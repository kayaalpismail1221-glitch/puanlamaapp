-- "Bilgi yanlış mı?": kullanıcılar mekânın telefonunu, adresini, web sitesini, adını, konumunu düzeltmeyi
-- ya da kapandığını bildirmeyi önerir. Doğruluk için tek kişinin beyanı veriyi değiştirmez:
--   * Aynı düzeltmeyi birbirinden bağımsız 2 kişi önerirse (kapandı için 3) kendiliğinden uygulanır.
--   * Gerisi yönetici kuyruğunda bekler (admin_place_corrections / admin_resolve_correction).
-- Uygulanan alan kilitlenir (`locked_fields`); toplu içe aktarım (OSM/Overture) onu bir daha ezmez.
-- Kapanan mekân arama, harita ve önerilerden çıkar; gönderileri ve kişilerin geçmişi durur.

alter table public.places
  add column locked_fields text[] not null default '{}',
  add column closed_at timestamptz;

create type public.correction_field as enum ('phone', 'address', 'website', 'name', 'location', 'closed');

create table public.place_corrections (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  field public.correction_field not null,
  -- phone/address/website/name için yeni değer ('' = bu bilgi yok, kaldırılsın)
  value text check (char_length(value) <= 160),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  status text not null default 'pending' check (status in ('pending', 'applied', 'rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- Kişi başına alan başına tek bekleyen öneri (yenisi eskisinin yerine geçer)
create unique index place_corrections_pending_idx on public.place_corrections (place_id, field, user_id)
  where status = 'pending';
create index place_corrections_user_idx on public.place_corrections (user_id, created_at);

alter table public.place_corrections enable row level security;
revoke all on public.place_corrections from anon, authenticated;
grant select on public.place_corrections to authenticated;
create policy "Kendi düzeltme önerilerini görür" on public.place_corrections
  for select to authenticated using (user_id = (select auth.uid()));

create trigger place_corrections_daily_limit before insert on public.place_corrections
  for each row execute function public.enforce_daily_limit('user_id', '20', 'düzeltme');

/** Aynı öneriyi yakalamak için değerin karşılaştırma biçimi: büyük/küçük harf, boşluk, Türkçe karakter farkı yok */
create or replace function public.correction_key(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(public.tr_fold(coalesce(p_value, '')), '[^a-z0-9]', '', 'g')
$$;

/** Öneriyi mekâna uygular, alanı kilitler; aynı alan için uyuşan bekleyen önerileri kapatır */
create or replace function public.apply_place_correction(p_correction_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.place_corrections;
begin
  select * into c from public.place_corrections where id = p_correction_id for update;
  if c.field = 'closed' then
    update public.places set closed_at = coalesce(closed_at, now()) where id = c.place_id;
  else
    update public.places
    set phone = case when c.field = 'phone' then nullif(c.value, '') else phone end,
        address = case when c.field = 'address' then coalesce(c.value, '') else address end,
        website = case when c.field = 'website' then nullif(c.value, '') else website end,
        name = case when c.field = 'name' then c.value else name end,
        latitude = case when c.field = 'location' then c.latitude else latitude end,
        longitude = case when c.field = 'location' then c.longitude else longitude end,
        locked_fields = (select array_agg(distinct f) from unnest(locked_fields || c.field::text) f)
    where id = c.place_id;
  end if;

  update public.place_corrections o
  set status = 'applied', resolved_at = now()
  where o.place_id = c.place_id and o.field = c.field and o.status = 'pending'
    and (
      c.field = 'closed'
      or (c.field = 'location' and extensions.st_dwithin(
            extensions.st_makepoint(o.longitude, o.latitude)::extensions.geography,
            extensions.st_makepoint(c.longitude, c.latitude)::extensions.geography, 50))
      or (c.field not in ('closed', 'location') and public.correction_key(o.value) = public.correction_key(c.value))
    );
  update public.place_corrections set status = 'applied', resolved_at = now() where id = c.id;
end;
$$;

/**
 * Düzeltme önerir. Değer istemcide biçimlenir (telefon E.164, web https://); burada yine denetlenir.
 * Dönen değer: 'applied' (uyuşan bağımsız öneri sayısı eşiğe ulaştı) ya da 'pending'.
 */
create or replace function public.suggest_place_correction(
  p_place_id uuid,
  p_field public.correction_field,
  p_value text default null,
  p_latitude double precision default null,
  p_longitude double precision default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  place public.places;
  new_id uuid;
  agreeing integer;
  v_value text := nullif(btrim(coalesce(p_value, '')), '');
  needed integer := case when p_field = 'closed' then 3 else 2 end;
begin
  if me is null then
    raise exception 'Giriş gerekli' using errcode = '42501';
  end if;
  select * into place from public.places where id = p_place_id;
  if place.id is null then
    raise exception 'Mekân bulunamadı' using errcode = 'P0002';
  end if;

  -- Biçim denetimi (hatalı değer kuyruğa bile girmesin)
  if p_field = 'phone' and v_value is not null and v_value !~ '^\+[0-9]{8,15}$' then
    raise exception 'Geçersiz telefon' using errcode = '22023';
  elsif p_field = 'website' and v_value is not null and (v_value !~ '^https?://[^ ]+\.[^ ]+$' or char_length(v_value) > 300) then
    raise exception 'Geçersiz web adresi' using errcode = '22023';
  elsif p_field = 'name' and (v_value is null or char_length(v_value) not between 2 and 120) then
    raise exception 'Geçersiz ad' using errcode = '22023';
  elsif p_field = 'location' and (
    p_latitude is null or p_longitude is null
    -- Konum düzeltmesi mekânı şehrin öbür ucuna taşıyamaz
    or not extensions.st_dwithin(place.location,
      extensions.st_makepoint(p_longitude, p_latitude)::extensions.geography, 2000)
  ) then
    raise exception 'Konum mekâna çok uzak' using errcode = '22023', hint = 'correction_too_far';
  end if;
  if p_field in ('name', 'address') and public.is_objectionable(v_value) then
    raise exception 'Uygunsuz ifade' using errcode = 'P0001', hint = 'objectionable';
  end if;

  delete from public.place_corrections
  where place_id = p_place_id and field = p_field and user_id = me and status = 'pending';
  insert into public.place_corrections (place_id, user_id, field, value, latitude, longitude)
  values (p_place_id, me, p_field,
    case when p_field in ('location', 'closed') then null else coalesce(v_value, '') end,
    case when p_field = 'location' then p_latitude end,
    case when p_field = 'location' then p_longitude end)
  returning id into new_id;

  -- Birbirinden bağımsız kaç kişi aynı şeyi söylüyor (engellediği/engellendiği kişiler sayılmaz)
  select count(distinct o.user_id) into agreeing
  from public.place_corrections o
  where o.place_id = p_place_id and o.field = p_field and o.status = 'pending'
    and (o.user_id = me or not public.is_blocked_between(me, o.user_id))
    and (
      p_field = 'closed'
      or (p_field = 'location' and extensions.st_dwithin(
            extensions.st_makepoint(o.longitude, o.latitude)::extensions.geography,
            extensions.st_makepoint(p_longitude, p_latitude)::extensions.geography, 50))
      or (p_field not in ('closed', 'location') and public.correction_key(o.value) = public.correction_key(v_value))
    );

  if agreeing >= needed then
    perform public.apply_place_correction(new_id);
    return 'applied';
  end if;
  return 'pending';
end;
$$;

/** Bekleyen öneriler, mekân ve aynı öneriyi yapan kişi sayısıyla. Yalnızca yöneticiler. */
create or replace function public.admin_place_corrections()
returns table (
  id uuid,
  place_id uuid,
  place_name text,
  field public.correction_field,
  current_value text,
  value text,
  latitude double precision,
  longitude double precision,
  supporters integer,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Yalnızca yöneticiler' using errcode = '42501';
  end if;
  return query
  select c.id, c.place_id, p.name, c.field,
    case c.field
      when 'phone' then p.phone
      when 'address' then p.address
      when 'website' then p.website
      when 'name' then p.name
      when 'location' then p.latitude || ',' || p.longitude
      else null
    end,
    c.value, c.latitude, c.longitude,
    (select count(*)::int from public.place_corrections o
      where o.place_id = c.place_id and o.field = c.field and o.status = 'pending'
        and (c.field in ('closed', 'location') or public.correction_key(o.value) = public.correction_key(c.value))),
    c.created_at
  from public.place_corrections c
  join public.places p on p.id = c.place_id
  where c.status = 'pending'
  order by c.created_at;
end;
$$;

create or replace function public.admin_resolve_correction(p_correction_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Yalnızca yöneticiler' using errcode = '42501';
  end if;
  if p_accept then
    perform public.apply_place_correction(p_correction_id);
  else
    update public.place_corrections set status = 'rejected', resolved_at = now()
    where id = p_correction_id and status = 'pending';
  end if;
end;
$$;

revoke execute on function
  public.apply_place_correction(uuid),
  public.suggest_place_correction(uuid, public.correction_field, text, double precision, double precision),
  public.admin_place_corrections(),
  public.admin_resolve_correction(uuid, boolean)
from public, anon;
revoke execute on function public.apply_place_correction(uuid) from authenticated;
grant execute on function
  public.suggest_place_correction(uuid, public.correction_field, text, double precision, double precision),
  public.admin_place_corrections(),
  public.admin_resolve_correction(uuid, boolean)
to authenticated;

-- ---------------------------------------------------------------------------
-- İçe aktarım kilitli alanlara dokunmaz
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
        source, external_id, imported_at)
      values (r ->> 'name', r ->> 'cuisine', coalesce(r ->> 'address', ''), r ->> 'phone', r ->> 'website',
        (r ->> 'latitude')::float8, (r ->> 'longitude')::float8, r ->> 'city', r ->> 'district',
        r -> 'sources' -> 0 ->> 'source', r -> 'sources' -> 0 ->> 'external_id', clock_timestamp())
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
          imported_at = clock_timestamp()
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
-- Kapanan mekânlar: görünümde işaretli, arama/harita/önerilerde yok
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
  pl.website,
  pl.closed_at
from public.places pl
left join lateral (
  select ph.path
  from public.posts po
  join public.post_photos ph on ph.post_id = po.id and ph.position = 0
  where po.place_id = pl.id
  order by po.like_count desc, po.created_at desc
  limit 1
) cover on true;

create or replace function public.search_places(
  p_query text default '',
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_limit integer default 30
)
returns setof public.place_view
language sql
stable
set search_path = ''
as $$
  with q as (
    select
      public.tr_fold(btrim(coalesce(p_query, ''))) as text,
      case
        when p_latitude is not null and p_longitude is not null
        then extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography
      end as origin
  ),
  hits as (
    select
      pl.id,
      case when q.text = '' then 0 else extensions.word_similarity(q.text, pl.search_text) end as similarity,
      (q.text <> '' and public.tr_fold(pl.name) like q.text || '%') as prefix,
      case when q.origin is not null then pl.location operator(extensions.<->) q.origin end as distance,
      (
        (select count(*) from public.rankings r where r.place_id = pl.id)
        + (select count(*) from public.posts p where p.place_id = pl.id)
      ) as popularity
    from public.places pl, q
    where pl.closed_at is null
      and (
        q.text = ''
        or pl.search_text like '%' || q.text || '%'
        or q.text operator(extensions.<%) pl.search_text
      )
    order by prefix desc, similarity desc, distance asc nulls last, popularity desc, pl.name
    limit least(greatest(p_limit, 1), 50)
  )
  select v.*
  from hits
  join public.place_view v on v.id = hits.id
  order by hits.prefix desc, hits.similarity desc, hits.distance asc nulls last, hits.popularity desc, v.name
$$;

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
      and pl.closed_at is null
    group by r.place_id
    order by count(*) desc, avg(r.score) desc
    limit least(greatest(p_limit, 1), 300)
  )
  select v.id, v.name, v.cuisine, v.neighborhood, v.district, v.city, v.price_level, v.latitude, v.longitude,
    v.photo, rated.average, rated.rating_count
  from rated
  join public.place_view v on v.id = rated.place_id
$$;

-- Önerilerde kapanan mekân yok (gövde 20260928100000'deki ile aynı, yalnızca filtre eklendi)
create or replace function public.recommended_places(
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_limit integer default 30
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
  friend_average double precision,
  friend_count integer,
  community_average double precision,
  community_count integer,
  distance_km double precision
)
language sql
stable
set search_path = ''
as $$
  with me as (select auth.uid() as id),
  origin as (
    select case
      when p_latitude is not null and p_longitude is not null
      then extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography
    end as g
  ),
  taste as (
    select pl.cuisine, avg(r.score) as avg_score
    from public.rankings r
    join public.places pl on pl.id = r.place_id
    join me on r.user_id = me.id
    group by pl.cuisine
  ),
  stats as (
    select
      r.place_id,
      (avg(r.score) filter (where f.follower_id is not null))::double precision as friend_average,
      (count(*) filter (where f.follower_id is not null))::int as friend_count,
      avg(r.score)::double precision as community_average,
      count(*)::int as community_count
    from public.rankings r
    cross join me
    left join public.follows f on f.follower_id = me.id and f.followee_id = r.user_id
    where r.user_id <> me.id
      and not public.is_blocked_between(me.id, r.user_id)
      and not exists (select 1 from public.rankings mine where mine.user_id = me.id and mine.place_id = r.place_id)
    group by r.place_id
  ),
  scored as (
    select
      s.*,
      case when o.g is not null then extensions.st_distance(pl.location, o.g) / 1000 end as distance,
      coalesce(s.friend_average, s.community_average)
        * (0.75 + 0.25 * least(s.friend_count * 2 + s.community_count, 4) / 4.0)
        + case when t.avg_score >= 7 then 0.4 else 0 end
        - case when o.g is not null then least(extensions.st_distance(pl.location, o.g) / 10000, 1.5) else 0 end
        as rank_score
    from stats s
    join public.places pl on pl.id = s.place_id
    cross join origin o
    left join taste t on t.cuisine = pl.cuisine
    where coalesce(s.friend_average, s.community_average) >= 6.7
      and pl.closed_at is null
  )
  select
    v.id, v.name, v.cuisine, v.neighborhood, v.district, v.city, v.price_level, v.latitude, v.longitude, v.photo,
    sc.friend_average, sc.friend_count, sc.community_average, sc.community_count, sc.distance::double precision
  from scored sc
  join public.place_view v on v.id = sc.place_id
  order by sc.rank_score desc, sc.community_count desc
  limit least(greatest(p_limit, 1), 50)
$$;
