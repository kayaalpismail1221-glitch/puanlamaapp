-- Canlı arama hızı: her harfte cevap ~100 ms düzeyinde olsun.
--
-- 1) `area_index`: şehir/ilçe/mahalle ve açık mekân sayıları hazır tutulur (places tetikleyicisiyle güncel);
--    `search_areas` her harfte 35 bin mekânı gruplamak yerine bu küçük tablodan okur (önceden ~3,3 sn).
-- 2) `search_places` plpgsql: arama metni bir kez katlanır, koşul indekse uygun yazılır (trigram GIN indeksi
--    kullanılır; önceki CTE + "boş mu" koşulu tam tarama yaptırıyordu, ~1,3 sn). 1–2 harfte adın başına göre
--    (`places_name_fold_idx`); boş aramada konum varsa en yakınlar (KNN), yoksa en çok puanlanan/paylaşılanlar.

-- ---------------------------------------------------------------------------
-- Bölge dizini
-- ---------------------------------------------------------------------------

create table public.area_index (
  kind text not null check (kind in ('city', 'district', 'neighborhood')),
  city text not null,
  -- Şehir satırında boş; ilçe satırında ilçenin kendisi; mahallede bağlı olduğu ilçe
  district text not null default '',
  name text not null,
  place_count integer not null default 0,
  folded text generated always as (public.tr_fold(name)) stored,
  primary key (kind, city, district, name)
);

alter table public.area_index enable row level security;
revoke all on public.area_index from anon, authenticated;
grant select on public.area_index to authenticated;
create policy "Bölgeler üyelere açık" on public.area_index for select to authenticated using (true);

/** Bir mekânın şehir, ilçe ve mahalle sayaçlarını `delta` kadar değiştirir; sıfıra inen satır silinir */
create or replace function public.bump_area_index(p_city text, p_district text, p_neighborhood text, p_delta integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rows_ jsonb := jsonb_build_array(jsonb_build_array('city', p_city, '', p_city));
begin
  if coalesce(p_city, '') = '' then
    return;
  end if;
  if coalesce(p_district, '') <> '' then
    rows_ := rows_ || jsonb_build_array(jsonb_build_array('district', p_city, p_district, p_district));
  end if;
  -- İlçeyle aynı adlı mahalle (Kadıköy Mahallesi) ilçenin tekrarı olmasın
  if coalesce(p_neighborhood, '') <> '' and public.tr_fold(p_neighborhood) <> public.tr_fold(coalesce(p_district, '')) then
    rows_ := rows_ || jsonb_build_array(jsonb_build_array('neighborhood', p_city, coalesce(p_district, ''), p_neighborhood));
  end if;

  insert into public.area_index as a (kind, city, district, name, place_count)
  select r ->> 0, r ->> 1, r ->> 2, r ->> 3, p_delta
  from jsonb_array_elements(rows_) r
  on conflict (kind, city, district, name) do update set place_count = a.place_count + excluded.place_count;

  delete from public.area_index a
  using jsonb_array_elements(rows_) r
  where a.kind = r ->> 0 and a.city = r ->> 1 and a.district = r ->> 2 and a.name = r ->> 3 and a.place_count <= 0;
end;
$$;

/** Açık mekânlar sayılır: eklenen, silinen, kapanan/açılan ya da yeri değişen mekân sayaçları günceller */
create or replace function public.on_place_area_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.closed_at is null then
    if tg_op = 'DELETE'
       or new.closed_at is not null
       or (old.city, old.district, old.neighborhood) is distinct from (new.city, new.district, new.neighborhood) then
      perform public.bump_area_index(old.city, old.district, old.neighborhood, -1);
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.closed_at is null then
    if tg_op = 'INSERT'
       or old.closed_at is not null
       or (old.city, old.district, old.neighborhood) is distinct from (new.city, new.district, new.neighborhood) then
      perform public.bump_area_index(new.city, new.district, new.neighborhood, 1);
    end if;
  end if;
  return null;
end;
$$;

create trigger places_area_count after insert or update of city, district, neighborhood, closed_at or delete on public.places
  for each row execute function public.on_place_area_count();

-- Mevcut mekânlardan doldur
insert into public.area_index (kind, city, district, name, place_count)
select 'city', city, '', city, count(*)::int from public.places where closed_at is null and city <> '' group by city
union all
select 'district', city, district, district, count(*)::int
from public.places where closed_at is null and city <> '' and district <> '' group by city, district
union all
select 'neighborhood', city, district, neighborhood, count(*)::int
from public.places
where closed_at is null and city <> '' and neighborhood <> '' and public.tr_fold(neighborhood) <> public.tr_fold(district)
group by city, district, neighborhood;

create or replace function public.search_areas(p_query text, p_limit integer default 5)
returns table (kind text, name text, district text, city text, place_count integer)
language sql
stable
set search_path = ''
as $$
  with q as (select public.tr_fold(btrim(coalesce(p_query, ''))) as text)
  select a.kind, a.name, nullif(a.district, ''), a.city, a.place_count
  from public.area_index a, q
  where char_length(q.text) >= 2
    and (a.folded like q.text || '%' or a.folded like '% ' || q.text || '%')
  order by
    (a.folded = q.text) desc,
    (a.folded like q.text || '%') desc,
    case a.kind when 'city' then 0 when 'district' then 1 else 2 end,
    a.place_count desc,
    a.name
  limit least(greatest(p_limit, 1), 20)
$$;

-- ---------------------------------------------------------------------------
-- Mekân arama
-- ---------------------------------------------------------------------------

-- 1–2 harfli aramada adın başına göre (trigram indeksi 3 harften kısa metinde işe yaramaz)
create index places_name_fold_idx on public.places (public.tr_fold(name) text_pattern_ops) where closed_at is null;

/**
 * Mekân arama: isim başı eşleşmeler önce, sonra benzerlik, sonra yakınlık, sonra popülerlik.
 * Boş aramada konum varsa en yakın mekânlar, yoksa en çok puanlanan/paylaşılanlar. Kapanan mekân yok.
 */
create or replace function public.search_places(
  p_query text default '',
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_limit integer default 30
)
returns setof public.place_view
language plpgsql
stable
set search_path = ''
as $$
declare
  q text := public.tr_fold(btrim(coalesce(p_query, '')));
  lim integer := least(greatest(p_limit, 1), 50);
  origin extensions.geography := case
    when p_latitude is not null and p_longitude is not null
    then extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography
  end;
begin
  if q = '' then
    if origin is not null then
      return query
      select v.*
      from (
        select pl.id, pl.location operator(extensions.<->) origin as distance
        from public.places pl
        where pl.closed_at is null
        order by pl.location operator(extensions.<->) origin
        limit lim
      ) near
      join public.place_view v on v.id = near.id
      order by near.distance;
    else
      return query
      select v.*
      from (
        select x.place_id, count(*) as n
        from (select r.place_id from public.rankings r union all select p.place_id from public.posts p) x
        group by x.place_id
      ) popular
      join public.places pl on pl.id = popular.place_id and pl.closed_at is null
      join public.place_view v on v.id = popular.place_id
      order by popular.n desc, v.name
      limit lim;
    end if;
    return;
  end if;

  -- Kısa ve uzun arama ayrı sorgu: her biri kendi indeksini kullanabilsin
  if char_length(q) < 3 then
    return query
    with hits as (
      select
        pl.id,
        pl.name,
        (select count(*) from public.rankings r where r.place_id = pl.id)
          + (select count(*) from public.posts p where p.place_id = pl.id) as popularity,
        case when origin is not null then pl.location operator(extensions.<->) origin end as distance
      from public.places pl
      where pl.closed_at is null and public.tr_fold(pl.name) like q || '%'
      order by popularity desc, distance asc nulls last, pl.name
      limit lim
    )
    select v.*
    from hits
    join public.place_view v on v.id = hits.id
    order by hits.popularity desc, hits.distance asc nulls last, hits.name;
    return;
  end if;

  return query
  with hits as (
    select
      pl.id,
      pl.name,
      extensions.word_similarity(q, pl.search_text) as similarity,
      public.tr_fold(pl.name) like q || '%' as prefix,
      case when origin is not null then pl.location operator(extensions.<->) origin end as distance,
      (select count(*) from public.rankings r where r.place_id = pl.id)
        + (select count(*) from public.posts p where p.place_id = pl.id) as popularity
    from public.places pl
    where pl.closed_at is null
      and (pl.search_text like '%' || q || '%' or q operator(extensions.<%) pl.search_text)
    order by prefix desc, similarity desc, distance asc nulls last, popularity desc, pl.name
    limit lim
  )
  select v.*
  from hits
  join public.place_view v on v.id = hits.id
  order by hits.prefix desc, hits.similarity desc, hits.distance asc nulls last, hits.popularity desc, hits.name;
end;
$$;

revoke execute on function
  public.bump_area_index(text, text, text, integer),
  public.on_place_area_count()
from public, anon, authenticated;
