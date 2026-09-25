-- Popüler feed'de sayfa kayması düzeltmesi.
-- Sıralama "sıcaklık" puanına göre ve sayfalar offset'le çekiliyordu; kullanıcı kaydırırken zaman geçtikçe
-- ya da gönderiler beğeni aldıkça sıra değişiyor, sonraki sayfada aynı gönderi tekrar geliyor ya da bazıları
-- hiç görünmüyordu. Artık sıcaklık oturumun başındaki sabit anda (as_of) hesaplanır ve o andan sonra
-- paylaşılanlar bu oturumun sayfalarına girmez. İstemci ilk sayfadaki `as_of`'u sonraki sayfalarda geri yollar;
-- yenileyince yeni bir an başlar. (Beğeni sayısındaki küçük kaymalara karşı istemci ayrıca tekrarları ayıklar.)
-- Eski sürüm `p_as_of` göndermez: o zaman `now()` kullanılır, davranış eskisi gibi.

/** Sıcaklık puanı, verilen ana göre (hot_score'un sabit anlı hâli) */
create or replace function public.hot_score_at(likes integer, comments integer, created_at timestamptz, at_time timestamptz)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select (likes + comments * 2 + 1)
    / power(greatest(extract(epoch from at_time - created_at) / 3600.0, 0) + 2, 1.3)
$$;

drop function public.feed_popular(double precision, double precision, text, text, integer, integer);

/**
 * Popüler feed.
 * - Şehir seçiliyse: o şehrin (ve ilçenin) gönderileri, popülerliğe göre.
 * - Konum verildiyse: 3 → 10 → 30 km içinde en az 5 gönderi bulunan ilk yarıçap;
 *   hiçbiri yetmezse en çok gönderiyi kapsayan en küçük yarıçap.
 *   Yakında hiç gönderi yoksa en yakın şehrin gönderileri (fallback_city).
 * - `p_as_of`: sıralamanın sabit anı (ilk sayfada boş; yanıttaki `as_of` sonraki sayfalarda geri yollanır).
 * Dönen: { as_of, radius_km, fallback_city, entries: [{ post, distance_km }] }
 */
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
  radii int[] := array[3, 10, 30];
  min_posts constant int := 5;
  counts int[];
  best int;
  radius int;
  fallback text;
  lim int := least(greatest(p_limit, 1), 50);
  off int := greatest(p_offset, 0);
  entries jsonb;
  -- Sıralamanın hesaplandığı an: sayfalar arasında sabit kalsın diye istemci ilk sayfadakini geri yollar
  at_time timestamptz := coalesce(p_as_of, now());
begin
  if p_city is null and (p_latitude is null or p_longitude is null) then
    raise exception 'Konum ya da şehir gerekli' using errcode = '22023';
  end if;

  if p_city is not null then
    select coalesce(jsonb_agg(jsonb_build_object('post', to_jsonb(v), 'distance_km', null) order by x.hot desc), '[]')
    into entries
    from (
      select p.id, public.hot_score_at(p.like_count, p.comment_count, p.created_at, at_time) as hot
      from public.posts p
      join public.places pl on pl.id = p.place_id
      where pl.city = p_city and (p_district is null or pl.district = p_district)
        and p.created_at <= at_time
      order by hot desc
      offset off limit lim
    ) x
    join public.post_view v on v.id = x.id;
    return jsonb_build_object('as_of', at_time, 'radius_km', null, 'fallback_city', null, 'entries', entries);
  end if;

  origin := extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography;

  select array[
    count(*) filter (where d <= 3000),
    count(*) filter (where d <= 10000),
    count(*)
  ]
  into counts
  from (
    select extensions.st_distance(pl.location, origin) as d
    from public.posts p
    join public.places pl on pl.id = p.place_id
    where extensions.st_dwithin(pl.location, origin, 30000)
  ) near;

  best := (select max(c) from unnest(counts) c);

  if best > 0 then
    radius := coalesce(
      (select radii[i] from generate_subscripts(counts, 1) i where counts[i] >= min_posts order by i limit 1),
      (select radii[i] from generate_subscripts(counts, 1) i where counts[i] = best order by i limit 1)
    );

    select coalesce(
      jsonb_agg(jsonb_build_object('post', to_jsonb(v), 'distance_km', round((x.d / 1000.0)::numeric, 2)) order by x.hot desc),
      '[]'
    )
    into entries
    from (
      select
        p.id,
        extensions.st_distance(pl.location, origin) as d,
        public.hot_score_at(p.like_count, p.comment_count, p.created_at, at_time) as hot
      from public.posts p
      join public.places pl on pl.id = p.place_id
      where extensions.st_dwithin(pl.location, origin, radius * 1000)
        and p.created_at <= at_time
      order by hot desc
      offset off limit lim
    ) x
    join public.post_view v on v.id = x.id;

    return jsonb_build_object('as_of', at_time, 'radius_km', radius, 'fallback_city', null, 'entries', entries);
  end if;

  -- Yakında gönderi yok: gönderisi olan en yakın mekânın şehri
  select pl.city into fallback
  from public.places pl
  where exists (select 1 from public.posts p where p.place_id = pl.id)
  order by pl.location operator(extensions.<->) origin
  limit 1;

  if fallback is null then
    return jsonb_build_object('as_of', at_time, 'radius_km', null, 'fallback_city', null, 'entries', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('post', to_jsonb(v), 'distance_km', null) order by x.hot desc), '[]')
  into entries
  from (
    select p.id, public.hot_score_at(p.like_count, p.comment_count, p.created_at, at_time) as hot
    from public.posts p
    join public.places pl on pl.id = p.place_id
    where pl.city = fallback
      and p.created_at <= at_time
    order by hot desc
    offset off limit lim
  ) x
  join public.post_view v on v.id = x.id;

  return jsonb_build_object('as_of', at_time, 'radius_km', null, 'fallback_city', fallback, 'entries', entries);
end;
$$;

revoke execute on function public.hot_score_at(integer, integer, timestamptz, timestamptz) from public, anon;
revoke execute on function
  public.feed_popular(double precision, double precision, text, text, integer, integer, timestamptz)
from public, anon;
grant execute on function
  public.feed_popular(double precision, double precision, text, text, integer, integer, timestamptz)
to authenticated;
