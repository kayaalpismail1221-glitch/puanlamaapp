-- Yakınımda feed'i genelden doldurma (kullanıcı isteği 2026-10-03: "yakınımda 10 gönderiden az varsa genel feed'den
-- gönderi gelsin, yoksa bir tane oluyor").
--
-- Yakınımda modunda (konumla) seçilen bölgede (3/10/30 km ya da gönderisi olan en yakın şehir) 10'dan az gönderi
-- varsa önce bölgenin gönderileri sıcaklık sırasıyla, ardından her yerden en popüler gönderiler gelir. Sayfalama bu
-- birleşik sırada yürür (aynı `p_as_of`); tekrar yok. Yanıtta `nearby_count`: listenin başındaki bölge gönderisi
-- sayısı (doldurulmadıysa null). Şehir/ilçe seçilince doldurma yok: kullanıcı orayı istedi.
--
-- Tanım `20261010100000_scale`'deki son hâlden; değişen yalnızca doldurma dalı ve yanıttaki `nearby_count`.

create or replace function public.feed_popular(
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_city text default null,
  p_district text default null,
  p_offset integer default 0,
  p_limit integer default 20,
  p_as_of timestamptz default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  origin extensions.geography;
  radii constant int[] := array[3, 10, 30];
  min_posts constant int := 5;
  -- Bölgede bundan az gönderi varsa feed genelden doldurulur
  fill_below constant int := 10;
  counts int[] := '{}';
  radius int;
  meters double precision;
  area_city text := p_city;
  area_district text := case when p_city is not null then p_district end;
  fallback text;
  lim int := least(greatest(p_limit, 1), 50);
  off int := greatest(p_offset, 0);
  at_time timestamptz := coalesce(p_as_of, now());
  region_posts bigint;
  all_posts double precision;
  ids uuid[];
  near_ids uuid[];
  near_count int;
  entries jsonb;
begin
  if p_city is null and (p_latitude is null or p_longitude is null) then
    raise exception 'Konum ya da şehir gerekli' using errcode = '22023';
  end if;

  if p_city is null then
    origin := extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography;

    -- Karar için en fazla 5 gönderi saymak yeter
    for i in 1 .. array_length(radii, 1) loop
      counts[i] := (
        select count(*) from (
          select 1
          from public.places pl
          join public.posts p on p.place_id = pl.id
          where pl.post_count > 0 and extensions.st_dwithin(pl.location, origin, radii[i] * 1000)
          limit min_posts
        ) s
      );
      if counts[i] >= min_posts then
        radius := radii[i];
        exit;
      end if;
    end loop;

    -- Hiçbiri yetmedi: sayılar 5'ten küçük olduğu için tam; en çok gönderiyi kapsayan en küçük yarıçap
    if radius is null and counts[3] > 0 then
      radius := (select radii[i] from generate_subscripts(counts, 1) i where counts[i] = counts[3] order by i limit 1);
    end if;

    if radius is null then
      -- Yakında gönderi yok: gönderisi olan en yakın mekânın şehri
      select pl.city into fallback
      from public.places pl
      where pl.post_count > 0
      order by pl.location operator(extensions.<->) origin
      limit 1;
      if fallback is null then
        return jsonb_build_object(
          'as_of', at_time, 'radius_km', null, 'fallback_city', null, 'nearby_count', null, 'entries', '[]'::jsonb
        );
      end if;
      area_city := fallback;
    else
      meters := radius * 1000;
    end if;
  end if;

  -- Bölgedeki gönderi sayısı (sayaçlardan) ve tüm gönderiler (istatistikten, yaklaşık)
  if meters is not null then
    region_posts := (
      select coalesce(sum(pl.post_count), 0) from public.places pl
      where pl.post_count > 0 and extensions.st_dwithin(pl.location, origin, meters)
    );
  else
    region_posts := (
      select coalesce(sum(pl.post_count), 0) from public.places pl
      where pl.post_count > 0 and pl.city = area_city and (area_district is null or pl.district = area_district)
    );
  end if;
  all_posts := greatest((select c.reltuples from pg_catalog.pg_class c where c.oid = 'public.posts'::regclass), region_posts, 1);

  if p_city is null and region_posts < fill_below then
    -- Yakınımda, bölge küçük: bölgenin tüm gönderileri (< 10) önce, sonra geri kalan her yerden sıcaklık sırasıyla.
    -- Bölge toplanır (az satır), genel kısım sıcaklık indeksinden okunur.
    select coalesce(array_agg(s.id order by s.hot desc), '{}') into near_ids
    from (
      select p.id, p.hot
      from public.places pl
      join public.posts p on p.place_id = pl.id
      where pl.post_count > 0 and p.created_at <= at_time
        and case
          when meters is not null then extensions.st_dwithin(pl.location, origin, meters)
          else pl.city = area_city
        end
    ) s;
    near_count := cardinality(near_ids);
    ids := near_ids[off + 1 : off + lim];
    select ids || coalesce(array_agg(s.id order by s.hot desc), '{}') into ids
    from (
      select p.id, p.hot
      from public.posts p
      where p.created_at <= at_time and p.id <> all (near_ids)
      order by p.hot desc
      offset greatest(off - near_count, 0) limit lim - cardinality(ids)
    ) s;
  -- Sıcaklık indeksinden okumak ≈ (off + lim) × tümü / bölge satır; bölgeyi toplamak ≈ bölge satır
  elsif (off + lim) * all_posts < region_posts::double precision * region_posts then
    select array_agg(s.id order by s.hot desc) into ids
    from (
      select p.id, p.hot
      from public.posts p
      where p.created_at <= at_time
        and exists (
          select 1 from public.places pl
          where pl.id = p.place_id
            and case
              when meters is not null then extensions.st_dwithin(pl.location, origin, meters)
              else pl.city = area_city and (area_district is null or pl.district = area_district)
            end
        )
      order by p.hot desc
      offset off limit lim
    ) s;
  elsif meters is not null then
    with region as materialized (
      select p.id, p.hot
      from public.places pl
      join public.posts p on p.place_id = pl.id
      where pl.post_count > 0 and extensions.st_dwithin(pl.location, origin, meters) and p.created_at <= at_time
    )
    select array_agg(s.id order by s.hot desc) into ids
    from (select r.id, r.hot from region r order by r.hot desc offset off limit lim) s;
  else
    with region as materialized (
      select p.id, p.hot
      from public.places pl
      join public.posts p on p.place_id = pl.id
      where pl.post_count > 0 and pl.city = area_city and (area_district is null or pl.district = area_district)
        and p.created_at <= at_time
    )
    select array_agg(s.id order by s.hot desc) into ids
    from (select r.id, r.hot from region r order by r.hot desc offset off limit lim) s;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'post', to_jsonb(v),
        -- Uzaklık yalnızca bölgedeki gönderide; genelden gelende ekran "350 km" yerine semti yazar
        'distance_km', case when meters is not null and extensions.st_dwithin(pl.location, origin, meters)
          then round((extensions.st_distance(pl.location, origin) / 1000.0)::numeric, 2) end
      )
      order by x.ord
    ),
    '[]'::jsonb
  )
  into entries
  from unnest(coalesce(ids, '{}')) with ordinality as x (id, ord)
  join public.post_view v on v.id = x.id
  join public.places pl on pl.id = v.place_id;

  return jsonb_build_object(
    'as_of', at_time, 'radius_km', radius, 'fallback_city', fallback, 'nearby_count', near_count, 'entries', entries
  );
end;
$$;
