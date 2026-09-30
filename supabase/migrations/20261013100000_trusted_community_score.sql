-- Güvenilir topluluk puanı: puanı az mekân puanlamış hesaplardan gelen puanın ağırlığı düşük.
--
-- Neden: Bayes ortalaması (m = 7,0, C = 2) tek bir hayranı dengeler ama birkaç yeni/sahte hesabı dengelemez
-- (5 hesap 10 verirse ~9,1). Ayrıca her yeni kullanıcının ilk "Beğendim"i otomatik 8,4 olduğu için az puanlamış
-- hesaplar ortalamaları 8,4'e çeker. Kişinin sıralaması uzadıkça puanları kıyaslanmış ve anlamlı hâle gelir.
--
-- Ağırlık = min(kişinin puanladığı mekân sayısı, 5) / 5: 1 mekân 0,2 · 3 mekân 0,6 · 5+ mekân 1.
-- Ağırlık `rankings.weight`'te tutulur (okumalar birleştirme yapmadan toplar); yalnızca ilk 5 puanda değişir,
-- sonrasında hep 1 olduğu için tetikleyici yalnızca o bölgede yazar.
-- Arkadaş puanı (takip ettiklerin) düz ortalama kalır: orada kaynağı tanıyorsun.

alter table public.rankings add column weight numeric(3, 2) not null default 1
  constraint rankings_weight_range check (weight > 0 and weight <= 1);

/** Kişinin puanladığı mekân sayısından puan ağırlığı */
create or replace function public.rater_weight(p_count bigint)
returns numeric
language sql
immutable
parallel safe
set search_path = ''
as $$
  select (least(greatest(p_count, 1), 5) / 5.0)::numeric(3, 2)
$$;

/** Puan eklenince/silinince kişinin ağırlığını günceller (yalnızca ilk 5 puanda değişir) */
create or replace function public.sync_rater_weight()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := coalesce(new.user_id, old.user_id);
  n bigint;
begin
  select count(*) into n from public.rankings where user_id = uid;
  if n <= 5 then
    update public.rankings
    set weight = public.rater_weight(n)
    where user_id = uid and weight is distinct from public.rater_weight(n);
  end if;
  return null;
end;
$$;

create trigger rankings_weight after insert or delete on public.rankings
  for each row execute function public.sync_rater_weight();

-- Mevcut puanlar
update public.rankings r
set weight = public.rater_weight(c.n)
from (select user_id, count(*) as n from public.rankings group by user_id having count(*) < 5) c
where r.user_id = c.user_id;

/**
 * Ağırlıklı Bayes ortalaması: (C × m + Σ ağırlık × puan) / (C + Σ ağırlık), m = 7,0 ve C = 2.
 * Tam ağırlıklı puanlarda `community_score` ile aynı sonucu verir.
 */
create or replace function public.weighted_community_score(p_total numeric, p_weight numeric)
returns double precision
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case when p_weight > 0 then ((2 * 7.0 + p_total) / (2 + p_weight))::double precision end
$$;

/**
 * Mekân sayfası. Gövde 20261005100000_segment_rankings'teki ile aynı; yalnızca topluluk puanı ağırlıklı.
 */
create or replace function public.place_details(p_place_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with place_posts as (
    select * from public.posts where place_id = p_place_id
  ),
  price as (
    select price_per_person as key, count(*)::int as count
    from place_posts
    where price_per_person is not null
    group by price_per_person
    order by count desc, price_per_person
    limit 1
  ),
  highlight_counts as (
    select h as label, count(*)::int as count
    from place_posts, unnest(highlights) h
    group by h
    order by count desc, h
    limit 4
  ),
  dish_counts as (
    -- "Köfte" ile "kofte" aynı yemek sayılır; en sık yazılış gösterilir
    select mode() within group (order by btrim(d)) as name, count(*)::int as count
    from place_posts, unnest(dishes) d
    group by public.tr_fold(btrim(d))
    order by count desc, name
    limit 5
  ),
  friends as (
    select
      r.user_id,
      r.score,
      (
        select p.id from place_posts p where p.user_id = r.user_id order by p.created_at desc limit 1
      ) as post_id
    from public.rankings r
    join public.follows f on f.followee_id = r.user_id and f.follower_id = auth.uid()
    where r.place_id = p_place_id
  )
  select jsonb_build_object(
    'place', (select to_jsonb(v) from public.place_view v where v.id = p_place_id),
    'rating', (
      select jsonb_build_object(
        'average', public.weighted_community_score(sum(score * weight), sum(weight)),
        'count', count(*)
      )
      from public.rankings where place_id = p_place_id
    ),
    'post_count', (select count(*) from place_posts),
    'summary', jsonb_build_object(
      'price', (select to_jsonb(price) from price),
      'price_votes', (select count(*) from place_posts where price_per_person is not null),
      'highlights', coalesce((select jsonb_agg(to_jsonb(h)) from highlight_counts h), '[]'),
      'dishes', coalesce((select jsonb_agg(to_jsonb(d)) from dish_counts d), '[]')
    ),
    'friends', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('user', public.profile_json(u), 'score', fr.score, 'post_id', fr.post_id)
          order by fr.score desc
        )
        from friends fr
        join public.profiles u on u.id = fr.user_id
      ),
      '[]'
    )
  )
  where exists (select 1 from public.places where id = p_place_id)
$$;

/** Harita "Puanla" katmanı. Gövde 20261010100000_scale'deki ile aynı; yalnızca topluluk puanı ağırlıklı. */
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
  with top as (
    select pl.id
    from public.places pl
    where pl.rating_count > 0
      and pl.closed_at is null
      and pl.latitude between p_south and p_north
      and pl.longitude between p_west and p_east
    order by pl.rating_count desc
    limit least(greatest(p_limit, 1), 300) * 2
  ),
  rated as materialized (
    select
      r.place_id,
      public.weighted_community_score(sum(r.score * r.weight), sum(r.weight)) as average,
      count(*)::int as rating_count
    from top
    join public.rankings r on r.place_id = top.id
    group by r.place_id
    order by count(*) desc, public.weighted_community_score(sum(r.score * r.weight), sum(r.weight)) desc
    limit least(greatest(p_limit, 1), 300)
  )
  select v.id, v.name, v.cuisine, v.neighborhood, v.district, v.city, v.price_level, v.latitude, v.longitude,
    v.photo, rated.average, rated.rating_count
  from rated
  join public.place_view v on v.id = rated.place_id
  order by rated.rating_count desc, rated.average desc
$$;

/** Bölgenin en yüksek puanlıları. Gövde 20261007100000_area_search'teki ile aynı; topluluk puanı ağırlıklı. */
create or replace function public.area_top_places(
  p_city text,
  p_district text default null,
  p_neighborhood text default null,
  p_segment public.place_segment default null,
  p_limit integer default 30,
  p_offset integer default 0
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
  with area as (
    select pl.id, pl.name
    from public.places pl
    join public.cuisines c on c.name = pl.cuisine
    where pl.closed_at is null
      and pl.city = p_city
      and (p_district is null or pl.district = p_district)
      and (p_neighborhood is null or pl.neighborhood = p_neighborhood)
      and (p_segment is null or c.segment = p_segment)
  ),
  rated as (
    select
      r.place_id,
      public.weighted_community_score(sum(r.score * r.weight), sum(r.weight)) as average,
      count(*)::int as n
    from public.rankings r
    join area on area.id = r.place_id
    group by r.place_id
  ),
  posted as (
    select p.place_id, count(*)::int as n
    from public.posts p
    join area on area.id = p.place_id
    group by p.place_id
  ),
  -- Sıra önce ucuz sütunlarla belirlenir; görünüm (kapak fotoğrafı) yalnızca bu sayfadakiler için çekilir
  ranked as (
    select area.id, rated.average, coalesce(rated.n, 0) as rating_count, coalesce(posted.n, 0) as post_count, area.name
    from area
    left join rated on rated.place_id = area.id
    left join posted on posted.place_id = area.id
    order by rated.average desc nulls last, rating_count desc, post_count desc, area.name
    offset greatest(p_offset, 0)
    limit least(greatest(p_limit, 1), 50)
  )
  select v.id, v.name, v.cuisine, v.neighborhood, v.district, v.city, v.price_level, v.latitude, v.longitude,
    v.photo, ranked.average, ranked.rating_count
  from ranked
  join public.place_view v on v.id = ranked.id
  order by ranked.average desc nulls last, ranked.rating_count desc, ranked.post_count desc, ranked.name
$$;

/** Kişisel öneriler. Gövde 20261010100000_scale'deki ile aynı; yalnızca topluluk puanı ağırlıklı. */
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
  -- Takip ettiklerinin (engelliler hariç) puanları
  friend_ratings as materialized (
    select r.place_id, r.score
    from public.follows f
    join me on f.follower_id = me.id
    join public.rankings r on r.user_id = f.followee_id
    where not public.is_blocked_between(me.id, f.followee_id)
  ),
  friend_stats as (
    select fr.place_id, avg(fr.score)::double precision as friend_average, count(*)::int as friend_count
    from friend_ratings fr
    group by fr.place_id
  ),
  candidates as (
    (
      select fs.place_id as id from friend_stats fs
      where fs.friend_average >= 6.7
      order by fs.friend_average desc, fs.friend_count desc
      limit 200
    )
    union
    (
      select pl.id from public.places pl
      where pl.rating_count > 0 and pl.closed_at is null
      order by pl.rating_count desc
      limit 100
    )
    union
    -- Yakındakiler: ~15 km'lik kutu (kesin uzaklık puanlamada)
    (
      select pl.id from public.places pl
      where p_latitude is not null and p_longitude is not null
        and pl.rating_count > 0 and pl.closed_at is null
        and pl.latitude between p_latitude - 0.135 and p_latitude + 0.135
        and pl.longitude between p_longitude - 0.135 / greatest(cos(radians(p_latitude)), 0.1)
                             and p_longitude + 0.135 / greatest(cos(radians(p_latitude)), 0.1)
      order by pl.rating_count desc
      limit 150
    )
    except
    select r.place_id from public.rankings r, me where r.user_id = me.id
  ),
  stats as (
    select
      c.id as place_id,
      fs.friend_average,
      coalesce(fs.friend_count, 0) as friend_count,
      public.weighted_community_score(agg.total, agg.weight) as community_average,
      agg.n::int as community_count
    from candidates c
    left join friend_stats fs on fs.place_id = c.id
    cross join me
    cross join lateral (
      select sum(r.score * r.weight) as total, sum(r.weight) as weight, count(*) as n
      from public.rankings r
      where r.place_id = c.id
        and r.user_id <> me.id
        and not public.is_blocked_between(me.id, r.user_id)
    ) agg
    where agg.n > 0
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
  ),
  -- Önce sıralanıp kesilir; mekân görünümü (kapak fotoğrafı) yalnızca dönen satırlar için hesaplanır
  top as materialized (
    select * from scored order by rank_score desc, community_count desc limit least(greatest(p_limit, 1), 50)
  )
  select
    v.id, v.name, v.cuisine, v.neighborhood, v.district, v.city, v.price_level, v.latitude, v.longitude, v.photo,
    sc.friend_average, sc.friend_count, sc.community_average, sc.community_count, sc.distance::double precision
  from top sc
  join public.place_view v on v.id = sc.place_id
  order by sc.rank_score desc, sc.community_count desc
$$;

revoke execute on function
  public.rater_weight(bigint),
  public.weighted_community_score(numeric, numeric),
  public.sync_rater_weight()
from public, anon;
grant execute on function
  public.rater_weight(bigint),
  public.weighted_community_score(numeric, numeric)
to authenticated;
