-- Mekân verisinin güveni (veri tarafı; kullanıcıya bir şey sorulmaz, ekranda yeni öğe yok):
--
-- 2026-10-02 ölçümü (Google'la 98 mekân): iki kaynakta (OSM + Overture) olan mekânların ~%75'i, tek kaynaklıların
-- ~%60'ı bugün de doğru. En zayıf iki grup: telefonu, sitesi, adresi olmayan yalnız-OSM kaydı (~%30 doğru) ve güveni
-- 0,80'in altındaki yalnız-Overture kaydı (~%35).
--   * Zayıf kayıt (`weak`, içe aktarımda build.mjs işaretler): silinmez (gerçek mekânların yarıya yakını kaybolurdu);
--     "yakınımdakiler" listesinde çıkmaz, aramada en sona düşer. Puanlanmış ya da gönderisi olan mekân zayıf sayılmaz.
--   * İçe aktarım il bazlı temizlenir: o ilde bu turda kaynakta olmayan ve kullanılmayan mekân silinir; kullanılan
--     (puanı, gönderisi, listesi olan) silinmez, `source_dropped_at` ile işaretlenir (yönetici incelemesi için).
--   * Arama yakındakileri (50 km) önce getirir; aynı yakınlık ve benzerlikte puanlanmış/kullanıcının eklediği mekân
--     önce, zayıf kayıt en sonda.
-- Kullanıcı kararı (2026-10-02): şimdilik kullanıcıya dönük doğrulama ("Hâlâ açık mı?") yok; düzeltme yalnızca
-- mevcut "Bilgi yanlış mı?" ekranından.

alter table public.places
  -- İçe aktarımda kaynaktan düştü (kapanmış olabilir) ama kullanıldığı için silinmedi
  add column source_dropped_at timestamptz,
  -- Tek kaynaklı, kanıtı zayıf içe aktarım (yukarıda)
  add column weak boolean not null default false;

/**
 * Aramadaki güven sınıfı: puanlanmış, gönderisi olan ya da kullanıcının eklediği (yerinde onaylanır) 2,
 * normal içe aktarım 1, zayıf içe aktarım 0
 */
create or replace function public.place_trust(p_activity integer, p_source text, p_weak boolean)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select case when p_activity > 0 or p_source = 'user' then 2 when p_weak then 0 else 1 end::smallint
$$;

-- ---------------------------------------------------------------------------
-- İçe aktarım: kaynakta yeniden görülen mekânın "düştü" işareti kalkar, zayıflık işareti yazılır
-- (20261004100000_place_corrections'taki tanım + bu iki alan)
-- ---------------------------------------------------------------------------

create or replace function public.import_places(p_rows jsonb)
returns integer[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
  existing uuid;
  added integer := 0;
  updated integer := 0;
begin
  for r in select * from jsonb_array_elements(p_rows)
  loop
    select ps.place_id into existing
    from public.place_sources ps
    join jsonb_to_recordset(r -> 'sources') s (source text, external_id text)
      on s.source = ps.source and s.external_id = ps.external_id
    order by ps.source = 'osm' desc
    limit 1;

    if existing is null then
      insert into public.places (name, cuisine, address, phone, website, latitude, longitude, city, district,
        source, external_id, imported_at, weak)
      values (r ->> 'name', r ->> 'cuisine', coalesce(r ->> 'address', ''), r ->> 'phone', r ->> 'website',
        (r ->> 'latitude')::float8, (r ->> 'longitude')::float8, r ->> 'city', r ->> 'district',
        r -> 'sources' -> 0 ->> 'source', r -> 'sources' -> 0 ->> 'external_id', clock_timestamp(),
        coalesce((r ->> 'weak')::boolean, false))
      returning id into existing;
      added := added + 1;
    else
      update public.places p
      set name = case when 'name' = any(p.locked_fields) then p.name else r ->> 'name' end,
          cuisine = r ->> 'cuisine',
          address = case when 'address' = any(p.locked_fields) then p.address else coalesce(r ->> 'address', '') end,
          phone = case when 'phone' = any(p.locked_fields) then p.phone else r ->> 'phone' end,
          website = case when 'website' = any(p.locked_fields) then p.website else r ->> 'website' end,
          latitude = case when 'location' = any(p.locked_fields) then p.latitude else (r ->> 'latitude')::float8 end,
          longitude = case when 'location' = any(p.locked_fields) then p.longitude else (r ->> 'longitude')::float8 end,
          imported_at = clock_timestamp(),
          source_dropped_at = null,
          weak = coalesce((r ->> 'weak')::boolean, false)
      where p.id = existing;
      updated := updated + 1;
    end if;

    insert into public.place_sources (source, external_id, place_id)
    select s.source, s.external_id, existing
    from jsonb_to_recordset(r -> 'sources') s (source text, external_id text)
    on conflict (source, external_id) do update set place_id = excluded.place_id;
  end loop;
  return array[added, updated];
end;
$$;

-- ---------------------------------------------------------------------------
-- İl bazlı temizlik (eski tek parametreli sürüm ili ayırt etmiyordu: bir il yüklenirken diğer illeri silerdi)
-- ---------------------------------------------------------------------------

drop function public.prune_imported_places(timestamptz);

/**
 * `p_city` ilinde bu turdan önce (`p_before`) içe aktarılmış, bu turda kaynakta görülmeyen mekânlar:
 * hiçbir kayda bağlı değilse silinir; bağlıysa (puan, gönderi, liste…) silinmez, `source_dropped_at` işaretlenir.
 * Dönen değer: [silinen, işaretlenen].
 */
create or replace function public.prune_imported_places(p_before timestamptz, p_city text)
returns integer[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  refs text := '';
  fk record;
  removed integer;
  flagged integer;
begin
  if coalesce(btrim(p_city), '') = '' then
    raise exception 'İl gerekli' using errcode = '22023';
  end if;
  -- places'a başvuran tüm tablolar (yeni tablolar eklendikçe kendiliğinden kapsanır; place_sources mekânla gider)
  for fk in
    select c.conrelid::regclass::text as tbl, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'public.places'::regclass
      and c.conrelid <> 'public.place_sources'::regclass
  loop
    refs := refs || format(' and not exists (select 1 from %s x where x.%I = p.id)', fk.tbl, fk.col);
  end loop;
  execute format(
    'delete from public.places p where p.source in (''osm'', ''overture'') and p.city = $2
       and coalesce(p.imported_at, ''-infinity'') < $1 %s',
    refs
  ) using p_before, p_city;
  get diagnostics removed = row_count;

  update public.places p
  set source_dropped_at = coalesce(p.source_dropped_at, now())
  where p.source in ('osm', 'overture') and p.city = p_city and coalesce(p.imported_at, '-infinity') < p_before;
  get diagnostics flagged = row_count;
  return array[removed, flagged];
end;
$$;

-- ---------------------------------------------------------------------------
-- Arama: yakındakiler önce, güven sınıfına göre (20261010100000_scale'deki tanım; sıralama ve yakın listesi değişti)
-- ---------------------------------------------------------------------------

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
  pattern text := '%' || public.like_escape(q) || '%';
  prefix_pattern text := public.like_escape(q) || '%';
  lim integer := least(greatest(p_limit, 1), 50);
  origin extensions.geography := case
    when p_latitude is not null and p_longitude is not null
    then extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography
  end;
  -- "Yakın": aynı şehir ölçeği (İstanbul'un bir ucundan öbürüne). Uzaktaki daha benzer ad bunların ardından gelir.
  near_meters constant double precision := 50000;
begin
  if q = '' then
    if origin is not null then
      return query
      select v.*
      from (
        select pl.id, pl.location operator(extensions.<->) origin as distance
        from public.places pl
        -- "Yakınımdakiler": kanıtı zayıf, kullanılmamış kayıt listelenmez (adıyla aranınca bulunur)
        where pl.closed_at is null and (not pl.weak or pl.rating_count + pl.post_count > 0)
        order by pl.location operator(extensions.<->) origin
        limit lim
      ) near
      join public.place_view v on v.id = near.id
      order by near.distance;
    else
      return query
      select v.*
      from (
        select pl.id, pl.rating_count + pl.post_count as popularity, pl.name
        from public.places pl
        where pl.closed_at is null
        order by pl.rating_count + pl.post_count desc, pl.name
        limit lim
      ) popular
      join public.place_view v on v.id = popular.id
      order by popular.popularity desc, popular.name;
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
        pl.rating_count + pl.post_count as popularity,
        case when origin is not null then pl.location operator(extensions.<->) origin end as distance,
        origin is null or pl.location operator(extensions.<->) origin < near_meters as near,
        public.place_trust(pl.rating_count + pl.post_count, pl.source, pl.weak) as trust
      from public.places pl
      where pl.closed_at is null and public.tr_fold(pl.name) like prefix_pattern
      order by near desc, trust desc, popularity desc, distance asc nulls last, pl.name
      limit lim
    )
    select v.*
    from hits
    join public.place_view v on v.id = hits.id
    order by hits.near desc, hits.trust desc, hits.popularity desc, hits.distance asc nulls last, hits.name;
    return;
  end if;

  return query
  with hits as (
    select
      pl.id,
      pl.name,
      extensions.word_similarity(q, pl.search_text) as similarity,
      -- Benzerlik 0,1'lik dilimlerde: neredeyse aynı benzerlikte güvenilir mekân öne, zayıf kayıt arkaya geçebilsin
      round(extensions.word_similarity(q, pl.search_text)::numeric, 1) as similarity_band,
      public.tr_fold(pl.name) like prefix_pattern as prefix,
      case when origin is not null then pl.location operator(extensions.<->) origin end as distance,
      origin is null or pl.location operator(extensions.<->) origin < near_meters as near,
      public.place_trust(pl.rating_count + pl.post_count, pl.source, pl.weak) as trust,
      pl.rating_count + pl.post_count as popularity
    from public.places pl
    where pl.closed_at is null
      and (pl.search_text like pattern or q operator(extensions.<%) pl.search_text)
    order by near desc, prefix desc, similarity_band desc, trust desc, similarity desc,
      distance asc nulls last, popularity desc, pl.name
    limit lim
  )
  select v.*
  from hits
  join public.place_view v on v.id = hits.id
  order by hits.near desc, hits.prefix desc, hits.similarity_band desc, hits.trust desc, hits.similarity desc,
    hits.distance asc nulls last, hits.popularity desc, hits.name;
end;
$$;

revoke execute on function public.prune_imported_places(timestamptz, text) from public, anon, authenticated;
