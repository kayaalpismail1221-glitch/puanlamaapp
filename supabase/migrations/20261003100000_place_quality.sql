-- Mekân verisinin kalitesi (İstanbul):
-- 1) İlçe ve mahalle artık koordinattan hesaplanır: OSM idari sınırları `admin_areas` tablosunda,
--    her mekân eklenirken/taşınırken tetikleyici doldurur. Elle yazılan ilçe (ör. "Kadıkoy") kalmaz.
-- 2) Sokak adresi, telefon, web sitesi alanları (adres aramaya da girer).
-- 3) Birden fazla kaynaktan (OSM + Overture) birleşik içe aktarım: bir mekânın her kaynaktaki kimliği
--    `place_sources`'ta; içe aktarım tekrar çalıştırıldığında aynı satır güncellenir, kimlik (ve puanlar) korunur.

-- ---------------------------------------------------------------------------
-- Yeni alanlar
-- ---------------------------------------------------------------------------

alter table public.places drop constraint places_source_check;
alter table public.places add constraint places_source_check
  check (source in ('seed', 'user', 'foursquare', 'google', 'osm', 'overture'));

alter table public.places
  -- "Moda Cd. No:12" biçiminde; ilçe ve mahalle ayrı sütunlarda
  add column address text not null default '' check (char_length(address) <= 160),
  -- E.164 (+905321234567)
  add column phone text check (phone ~ '^\+[0-9]{8,15}$'),
  add column website text check (char_length(website) <= 300 and website ~ '^https?://'),
  -- Toplu içe aktarımda son görüldüğü an; kaynaktan düşen ve kullanılmayan mekânlar temizlenir
  add column imported_at timestamptz;

-- Arama metnine adres de girer ("moda caddesi kahve")
drop index public.places_search_idx;
alter table public.places drop column search_text;
alter table public.places add column search_text text generated always as (
  public.tr_fold(name || ' ' || cuisine || ' ' || neighborhood || ' ' || district || ' ' || city || ' ' || address)
) stored;
create index places_search_idx on public.places using gin (search_text extensions.gin_trgm_ops);

grant insert (address) on public.places to authenticated;

-- ---------------------------------------------------------------------------
-- Kaynak kimlikleri
-- ---------------------------------------------------------------------------

create table public.place_sources (
  source text not null check (source in ('osm', 'overture')),
  external_id text not null,
  place_id uuid not null references public.places (id) on delete cascade,
  primary key (source, external_id)
);

create index place_sources_place_idx on public.place_sources (place_id);

alter table public.place_sources enable row level security;
revoke all on public.place_sources from anon, authenticated;

insert into public.place_sources (source, external_id, place_id)
select source, external_id, id from public.places where source = 'osm' and external_id is not null;

-- ---------------------------------------------------------------------------
-- İdari sınırlar (ilçe = OSM admin_level 6, mahalle = 8)
-- ---------------------------------------------------------------------------

create table public.admin_areas (
  id bigint primary key, -- OSM ilişki kimliği
  level smallint not null check (level in (6, 8)),
  name text not null check (char_length(name) between 1 and 80),
  city text not null,
  -- Mahallenin bağlı olduğu ilçe (sınırları örtüşen komşu ilçenin mahallesi seçilmesin)
  district text,
  geom extensions.geometry(multipolygon, 4326) not null
);

create index admin_areas_geom_idx on public.admin_areas using gist (geom);

alter table public.admin_areas enable row level security;
revoke all on public.admin_areas from anon, authenticated;

/**
 * Koordinattaki il, ilçe ve mahalle. Sınırın hemen dışındaki noktalar (iskele, sahil, tekne)
 * en yakın ilçeye (≈500 m) ve mahalleye (≈300 m) bağlanır. Kapsanan bölge dışında boş döner.
 */
create or replace function public.area_at(p_latitude double precision, p_longitude double precision)
returns table (city text, district text, neighborhood text)
language sql
stable
security definer
set search_path = ''
as $$
  with pt as (
    select extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326) as g
  ),
  d as (
    select a.name, a.city
    from public.admin_areas a, pt
    where a.level = 6 and extensions.st_dwithin(a.geom, pt.g, 0.005)
    order by extensions.st_distance(a.geom, pt.g), a.id
    limit 1
  ),
  n as (
    select a.name
    from public.admin_areas a, pt, d
    where a.level = 8
      and (a.district = d.name or a.district is null)
      and extensions.st_dwithin(a.geom, pt.g, 0.003)
    order by extensions.st_distance(a.geom, pt.g), (a.district is null), a.id
    limit 1
  )
  select d.city, d.name, coalesce((select n.name from n), '') from d
$$;

/**
 * Mekân eklenirken ya da konumu değişirken il/ilçe/mahalle koordinattan yazılır.
 * Kapsanan bölge dışındaysa girilen değerler kalır; ama "İstanbul" yazılıp konum dışarıdaysa reddedilir.
 */
create or replace function public.places_fill_area()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  area record;
begin
  select * into area from public.area_at(new.latitude, new.longitude);
  if area.district is not null then
    new.city := area.city;
    new.district := area.district;
    new.neighborhood := area.neighborhood;
  elsif public.tr_fold(new.city) in (select distinct public.tr_fold(a.city) from public.admin_areas a) then
    raise exception 'Konum % sınırları dışında', new.city using errcode = 'P0001', hint = 'place_outside_city';
  end if;
  return new;
end;
$$;

create trigger places_fill_area before insert or update of latitude, longitude on public.places
  for each row execute function public.places_fill_area();

-- ---------------------------------------------------------------------------
-- İçe aktarım (yalnızca service_role; scripts/places/upload.mjs)
-- ---------------------------------------------------------------------------

/**
 * Sınır ekler/günceller. Çokgen, ilişkinin yollarından (WKT MULTILINESTRING) PostGIS'te kurulur;
 * iç halkalar (delikler) ve parçalı sınırlar doğru birleşir. ~2 m sadeleştirilir.
 */
create or replace function public.import_admin_area(
  p_id bigint,
  p_level smallint,
  p_name text,
  p_city text,
  p_lines text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.admin_areas (id, level, name, city, geom)
  select p_id, p_level, p_name, p_city, g
  from (
    select extensions.st_multi(extensions.st_collectionextract(extensions.st_makevalid(
      extensions.st_simplifypreservetopology(
        extensions.st_buildarea(extensions.st_node(extensions.st_geomfromtext(p_lines, 4326))), 0.00002
      )
    ), 3)) as g
  ) built
  where not extensions.st_isempty(g)
  on conflict (id) do update set level = excluded.level, name = excluded.name, city = excluded.city, geom = excluded.geom
$$;

/**
 * Mekânların il/ilçe/mahallesini sınırlardan yeniden hesaplar. İstek zaman aşımına takılmamak için
 * kimlik sırasıyla sayfa sayfa çalışır: p_after = önceki sayfanın last_id'si (ilk çağrıda null).
 * İlk sayfada mahallelerin bağlı olduğu ilçe de yeniden bağlanır.
 */
create or replace function public.refresh_place_areas(p_after uuid default null, p_limit integer default 2000)
returns table (last_id uuid, changed integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last uuid;
  v_changed integer;
begin
  if p_after is null then
    update public.admin_areas m
    set district = (
      select d.name
      from public.admin_areas d
      where d.level = 6 and extensions.st_contains(d.geom, extensions.st_pointonsurface(m.geom))
      limit 1
    )
    where m.level = 8;
  end if;

  select p.id into v_last
  from (
    select id from public.places where p_after is null or id > p_after order by id limit greatest(p_limit, 1)
  ) p
  order by p.id desc
  limit 1;

  with batch as (
    select id, latitude, longitude
    from public.places
    where (p_after is null or id > p_after) and id <= v_last
  ),
  computed as (
    select b.id, a.city, a.district, a.neighborhood
    from batch b
    cross join lateral public.area_at(b.latitude, b.longitude) a
  ),
  updated as (
    update public.places p
    set city = c.city, district = c.district, neighborhood = c.neighborhood
    from computed c
    where c.id = p.id
      and (p.city, p.district, p.neighborhood) is distinct from (c.city, c.district, c.neighborhood)
    returning 1
  )
  select count(*)::int into v_changed from updated;

  return query select v_last, v_changed;
end;
$$;

/**
 * Birleştirilmiş mekânları yazar. Her satır: {sources: [{source, external_id}], name, cuisine, address,
 * phone, website, latitude, longitude}. Kaynak kimliklerinden biri zaten bir mekâna bağlıysa o mekân
 * güncellenir (kimlik, puanlar ve gönderiler korunur), değilse yeni mekân eklenir.
 * Dönen değer: [eklenen, güncellenen].
 */
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
        source, external_id, imported_at)
      values (r ->> 'name', r ->> 'cuisine', coalesce(r ->> 'address', ''), r ->> 'phone', r ->> 'website',
        (r ->> 'latitude')::float8, (r ->> 'longitude')::float8, r ->> 'city', r ->> 'district',
        r -> 'sources' -> 0 ->> 'source', r -> 'sources' -> 0 ->> 'external_id', clock_timestamp())
      returning id into existing;
      added := added + 1;
    else
      update public.places
      set name = r ->> 'name',
          cuisine = r ->> 'cuisine',
          address = coalesce(r ->> 'address', ''),
          phone = r ->> 'phone',
          website = r ->> 'website',
          latitude = (r ->> 'latitude')::float8,
          longitude = (r ->> 'longitude')::float8,
          imported_at = clock_timestamp()
      where id = existing;
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

/**
 * Son içe aktarımda görülmeyen (kaynaktan düşmüş, ör. kapanmış) içe aktarılmış mekânları siler;
 * puan, gönderi, kayıt, bildirim gibi herhangi bir kayda bağlı olanlara dokunmaz.
 */
create or replace function public.prune_imported_places(p_before timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  refs text := '';
  fk record;
  removed integer;
begin
  -- places'a başvuran tüm tablolar (yeni tablolar eklendikçe kendiliğinden kapsanır)
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
    'delete from public.places p where p.source in (''osm'', ''overture'') and coalesce(p.imported_at, ''-infinity'') < $1 %s',
    refs
  ) using p_before;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke execute on function
  public.import_admin_area(bigint, smallint, text, text, text),
  public.refresh_place_areas(uuid, integer),
  public.import_places(jsonb),
  public.prune_imported_places(timestamptz),
  public.places_fill_area()
from public, anon, authenticated;

revoke execute on function public.area_at(double precision, double precision) from public, anon;
grant execute on function public.area_at(double precision, double precision) to authenticated;

-- ---------------------------------------------------------------------------
-- Görünümler: adres, telefon, web sitesi
-- ---------------------------------------------------------------------------

create or replace view public.place_view with (security_invoker = true) as
select
  pl.id,
  pl.name,
  pl.cuisine,
  pl.neighborhood,
  pl.district,
  pl.city,
  pl.price_level,
  pl.latitude,
  pl.longitude,
  coalesce(pl.photo_url, cover.path) as photo,
  pl.address,
  pl.phone,
  pl.website
from public.places pl
left join lateral (
  select ph.path
  from public.posts po
  join public.post_photos ph on ph.post_id = po.id and ph.position = 0
  where po.place_id = pl.id
  order by po.like_count desc, po.created_at desc
  limit 1
) cover on true;

-- Görünüme sütun eklenince `v.*` dönüş tipini bozar; sütunlar açıkça seçilir
create or replace function public.map_places(
  p_south double precision,
  p_west double precision,
  p_north double precision,
  p_east double precision,
  p_limit integer default 200
)
returns table (
  id uuid,
  name text,
  cuisine text,
  neighborhood text,
  district text,
  city text,
  price_level smallint,
  latitude double precision,
  longitude double precision,
  photo text,
  average double precision,
  rating_count integer
)
language sql
stable
set search_path = ''
as $$
  with rated as (
    select r.place_id, avg(r.score)::double precision as average, count(*)::int as rating_count
    from public.rankings r
    join public.places pl on pl.id = r.place_id
    where pl.latitude between p_south and p_north
      and pl.longitude between p_west and p_east
    group by r.place_id
    order by count(*) desc, avg(r.score) desc
    limit least(greatest(p_limit, 1), 300)
  )
  select v.id, v.name, v.cuisine, v.neighborhood, v.district, v.city, v.price_level, v.latitude, v.longitude,
    v.photo, rated.average, rated.rating_count
  from rated
  join public.place_view v on v.id = rated.place_id
$$;
