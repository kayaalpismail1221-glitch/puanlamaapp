-- Puanlama modelinin düzeltmeleri (kullanıcı kararı 2026-09-30: "tüm dezavantajları çöz, çok puanlayan
-- dezavantajlı kalmasın"). Uygulamadaki `src/lib/ranking.ts` ile birebir aynı kurallar.
--
-- 1) Eğri: puan, listedeki seviyenin (seviye / max(seviye sayısı − 1, 4)) karesiyle iner. Listenin üstü yüksek
--    kalır, düşüş sona doğru hızlanır: çok puanlayan kişinin sevdiği yerler 6,7–7,x görünmez (30 mekânda ilk 20'si
--    8,4'ün üstünde); alt sınır gerçekten "en az beğendiğim". Beğendim, 5 seviye: 10 · 9,8 · 9,2 · 8,1 · 6,7.
-- 2) Gerçek eşitlik: "İkisi aynı" denince yeni mekân karşılaştırılanla aynı seviyeye konur (`rankings.tied`:
--    listede bir üsttekiyle aynı), puanları eşit. Eski "Emin değilim" hep bir alta koyup puanı düşürüyordu.
-- 3) Topluluk puanının başlangıç değeri 7,0 değil türün gerçek (ağırlıklı) ortalaması (`community_priors`, saatte
--    bir tazelenir; az veride tüm puanların ortalaması, o da yoksa 7,5): yeni ve iyi mekânlar haksız yere
--    aşağı çekilmez.
-- 4) Tazelik: topluluk puanında 1 yıldan eski puanlar 0,75, 2 yıldan eskiler 0,5 ağırlık taşır (mekânlar
--    değişir; yeniden puanlamak puanı tazeler).

alter table public.rankings add column tied boolean not null default false;

-- ---------------------------------------------------------------------------
-- Kişisel puan
-- ---------------------------------------------------------------------------

create or replace function public.sentiment_score(s public.sentiment, pos integer, cnt integer)
returns numeric
language sql
immutable
parallel safe
set search_path = ''
as $$
  -- pos: seviye (0 = en iyi), cnt: seviye sayısı. İniş = round((hi − lo) × pos² / gap²)
  select (hi - (2 * (hi - lo) * p * p + gap * gap) / (2 * gap * gap)) / 10.0
  from (
    select
      case s when 'liked' then 100 when 'fine' then 66 else 33 end as hi,
      case s when 'liked' then 67 when 'fine' then 34 else 0 end as lo,
      greatest(cnt - 1, 4) as gap,
      least(greatest(pos, 0), greatest(cnt - 1, 0)) as p
  ) base
$$;

/**
 * Bir kullanıcının bir segment + izlenim listesindeki puanları: her kaydın seviyesi (ilk kayıt 0, `tied` olan
 * öncekinin seviyesinde, diğerleri bir altta) ve listedeki seviye sayısından.
 */
create or replace function public.recompute_group_scores(
  p_user_id uuid,
  p_segment public.place_segment,
  p_sentiment public.sentiment
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.rankings r
  set score = public.sentiment_score(r.sentiment, t.tier, t.tiers)
  from (
    select x.place_id, x.tier, (max(x.tier) over () + 1)::int as tiers
    from (
      select place_id,
        (sum(case when tied and position > 0 then 0 else 1 end) over (order by position) - 1)::int as tier
      from public.rankings
      where user_id = p_user_id and segment = p_segment and sentiment = p_sentiment
    ) x
  ) t
  where r.user_id = p_user_id and r.place_id = t.place_id and r.score is distinct from public.sentiment_score(r.sentiment, t.tier, t.tiers)
$$;

/** Sıraları boşluksuz yeniden numaralar ve tüm puanları hesaplar (kullanıcı verilmezse herkes); sıra korunur */
create or replace function public.normalize_rankings(p_user_id uuid default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.rankings r
  set position = n.position
  from (
    select user_id, place_id, (row_number() over (partition by user_id, segment, sentiment order by position) - 1)::int as position
    from public.rankings
    where p_user_id is null or user_id = p_user_id
  ) n
  where r.user_id = n.user_id and r.place_id = n.place_id and r.position <> n.position;

  update public.rankings r
  set score = public.sentiment_score(r.sentiment, t.tier, t.tiers)
  from (
    select x.user_id, x.place_id, x.tier,
      (max(x.tier) over (partition by x.user_id, x.segment, x.sentiment) + 1)::int as tiers
    from (
      select user_id, place_id, segment, sentiment,
        (sum(case when tied and position > 0 then 0 else 1 end)
          over (partition by user_id, segment, sentiment order by position) - 1)::int as tier
      from public.rankings
      where p_user_id is null or user_id = p_user_id
    ) x
  ) t
  where r.user_id = t.user_id and r.place_id = t.place_id
    and r.score is distinct from public.sentiment_score(r.sentiment, t.tier, t.tiers);
$$;

/**
 * Mekânı kullanıcının sıralamasına ekler (ya da yerini değiştirir). `p_index`: segmentteki, seçilen izlenim
 * listesindeki yeni sıra (0 = en iyi). `p_tie`: bir üstteki mekânla aynı seviye ("İkisi aynı"); listenin başına
 * eşitlik konmaz. Kayan kayıtlar eşitlik bayraklarını korur (istemcideki `insertEntry` ile aynı).
 * Gövde 20261005100000_segment_rankings'teki ile aynı; yalnızca eşitlik eklendi.
 */
drop function public.rank_place(uuid, public.sentiment, integer, text);

create function public.rank_place(
  p_place_id uuid,
  p_sentiment public.sentiment,
  p_index integer,
  p_note text default null,
  p_tie boolean default false
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  seg public.place_segment;
  previous public.rankings;
  group_size int;
  target int;
  result numeric;
begin
  if uid is null then
    raise exception 'Giriş yapman gerekiyor' using errcode = '42501';
  end if;
  seg := public.place_segment_of(p_place_id);
  if seg is null then
    raise exception 'Mekân bulunamadı' using errcode = 'P0002';
  end if;

  -- Aynı kullanıcının eşzamanlı istekleri sırayı bozmasın
  perform pg_advisory_xact_lock(hashtextextended('rankings:' || uid::text, 0));

  previous := public.detach_ranking(uid, p_place_id);

  select count(*) into group_size
  from public.rankings
  where user_id = uid and segment = seg and sentiment = p_sentiment;
  target := greatest(0, least(coalesce(p_index, group_size), group_size));

  update public.rankings
  set position = position + 1
  where user_id = uid and segment = seg and sentiment = p_sentiment and position >= target;

  insert into public.rankings (user_id, place_id, sentiment, segment, position, score, note, tied)
  values (uid, p_place_id, p_sentiment, seg, target, 0, nullif(btrim(p_note), ''), coalesce(p_tie, false) and target > 0);

  perform public.recompute_group_scores(uid, seg, p_sentiment);
  if previous.place_id is not null and (previous.segment, previous.sentiment) is distinct from (seg, p_sentiment) then
    perform public.recompute_group_scores(uid, previous.segment, previous.sentiment);
  end if;

  delete from public.saved_places where user_id = uid and place_id = p_place_id;

  select score into result from public.rankings where user_id = uid and place_id = p_place_id;
  return result;
end;
$$;

/** Sıralama satırı ve mekânı (eşitlik sona eklendi; mevcut sütunların sırası değişmez) */
create or replace view public.ranking_view with (security_invoker = true) as
select
  r.user_id,
  r.place_id,
  r.sentiment,
  r.position,
  r.score,
  r.note,
  r.rated_at,
  (select to_jsonb(v) from public.place_view v where v.id = r.place_id) as place,
  r.segment,
  r.tied
from public.rankings r;

-- ---------------------------------------------------------------------------
-- Topluluk puanı: türün ortalamasından başlar, tazelik ağırlıklı
-- ---------------------------------------------------------------------------

/** Türün (segment) ağırlıklı ortalama puanı: Bayes başlangıç değeri */
create table public.community_priors (
  segment public.place_segment primary key,
  mean numeric(4, 2) not null,
  ratings integer not null,
  updated_at timestamptz not null default now()
);

-- Zararsız özet (tür başına ortalama): üyeler okur, yalnızca tanımlayıcı fonksiyon yazar
alter table public.community_priors enable row level security;
revoke all on public.community_priors from public, anon, authenticated;
grant select on public.community_priors to authenticated;
create policy "Tür ortalamaları üyelere açık" on public.community_priors for select to authenticated using (true);

/** Başlangıç değerlerini yeniden hesaplar: tür ≥ 30 puan → türün ortalaması, yoksa tüm puanlarınki, o da yoksa 7,5 */
create or replace function public.refresh_community_priors()
returns void
language sql
security definer
set search_path = ''
as $$
  with per as (
    select r.segment, sum(r.score * r.weight) / nullif(sum(r.weight), 0) as mean, count(*)::int as n
    from public.rankings r
    group by r.segment
  ),
  overall as (
    select sum(r.score * r.weight) / nullif(sum(r.weight), 0) as mean, count(*)::int as n
    from public.rankings r
  )
  insert into public.community_priors (segment, mean, ratings, updated_at)
  select
    s.segment,
    round(coalesce(case when per.n >= 30 then per.mean end, case when o.n >= 30 then o.mean end, 7.5), 2),
    coalesce(per.n, 0),
    now()
  from unnest(enum_range(null::public.place_segment)) s(segment)
  left join per on per.segment = s.segment
  cross join overall o
  on conflict (segment) do update
    set mean = excluded.mean, ratings = excluded.ratings, updated_at = excluded.updated_at
$$;

/** Puanlar değiştikçe başlangıç değerleri en fazla saatte bir tazelenir (aynı anda yalnızca bir istek hesaplar) */
create or replace function public.maybe_refresh_community_priors()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.community_priors where updated_at > now() - interval '1 hour')
     and pg_try_advisory_xact_lock(hashtextextended('community_priors', 0)) then
    perform public.refresh_community_priors();
  end if;
  return null;
end;
$$;

create trigger rankings_community_priors after insert or update or delete on public.rankings
  for each statement execute function public.maybe_refresh_community_priors();

/** Puanın tazeliği: son 1 yıl 1 · 1–2 yıl 0,75 · daha eski 0,5 */
create or replace function public.rating_recency(p_rated_at timestamptz)
returns numeric
language sql
stable
parallel safe
set search_path = ''
as $$
  select case
    when p_rated_at > now() - interval '1 year' then 1
    when p_rated_at > now() - interval '2 years' then 0.75
    else 0.5
  end::numeric
$$;

/**
 * Mekânın topluluk puanı: (C × m + Σ ağırlık × puan) / (C + Σ ağırlık), C = 2, m = mekânın türünün ortalaması.
 * Ağırlık = puanlayanın deneyimi (`rankings.weight`) × tazelik (`rating_recency`).
 */
create or replace function public.place_community_score(p_place_id uuid, p_total numeric, p_weight numeric)
returns double precision
language sql
stable
parallel safe
set search_path = ''
as $$
  select case when p_weight > 0 then ((2 * m.mean + p_total) / (2 + p_weight))::double precision end
  from (
    select coalesce(
      (
        select cp.mean
        from public.places pl
        join public.cuisines c on c.name = pl.cuisine
        join public.community_priors cp on cp.segment = c.segment
        where pl.id = p_place_id
      ),
      7.5
    ) as mean
  ) m
$$;

/**
 * Mekân sayfası. Gövde 20261005100000_segment_rankings'teki ile aynı; topluluk puanı ağırlıklı, tazelikli ve türün ortalamasından başlar.
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
        'average', public.place_community_score(p_place_id, sum(score * weight * public.rating_recency(rated_at)), sum(weight * public.rating_recency(rated_at))),
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

/** Harita "Puanla" katmanı. Gövde 20261010100000_scale'deki ile aynı; topluluk puanı ağırlıklı, tazelikli ve türün ortalamasından başlar. */
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
      public.place_community_score(r.place_id, sum(r.score * r.weight * public.rating_recency(r.rated_at)), sum(r.weight * public.rating_recency(r.rated_at))) as average,
      count(*)::int as rating_count
    from top
    join public.rankings r on r.place_id = top.id
    group by r.place_id
    order by count(*) desc, public.place_community_score(r.place_id, sum(r.score * r.weight * public.rating_recency(r.rated_at)), sum(r.weight * public.rating_recency(r.rated_at))) desc
    limit least(greatest(p_limit, 1), 300)
  )
  select v.id, v.name, v.cuisine, v.neighborhood, v.district, v.city, v.price_level, v.latitude, v.longitude,
    v.photo, rated.average, rated.rating_count
  from rated
  join public.place_view v on v.id = rated.place_id
  order by rated.rating_count desc, rated.average desc
$$;

/** Bölgenin en yüksek puanlıları. Gövde 20261007100000_area_search'teki ile aynı; topluluk puanı ağırlıklı, tazelikli, türün ortalamasından başlar. */
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
      public.place_community_score(r.place_id, sum(r.score * r.weight * public.rating_recency(r.rated_at)), sum(r.weight * public.rating_recency(r.rated_at))) as average,
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

/** Kişisel öneriler. Gövde 20261010100000_scale'deki ile aynı; topluluk puanı ağırlıklı, tazelikli ve türün ortalamasından başlar. */
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
      public.place_community_score(c.id, agg.total, agg.weight) as community_average,
      agg.n::int as community_count
    from candidates c
    left join friend_stats fs on fs.place_id = c.id
    cross join me
    cross join lateral (
      select sum(r.score * r.weight * public.rating_recency(r.rated_at)) as total, sum(r.weight * public.rating_recency(r.rated_at)) as weight, count(*) as n
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


select public.refresh_community_priors();

-- Tüm kişisel puanlar yeni eğriyle (sıra korunur)
select public.normalize_rankings();

-- Gönderilerdeki puan paylaşım anının kopyası; ölçek değiştiği için bir kez güncel puana eşitlenir
update public.posts p
set score = r.score
from public.rankings r
where r.user_id = p.user_id and r.place_id = p.place_id and p.score is distinct from r.score;

revoke execute on function
  public.refresh_community_priors(),
  public.maybe_refresh_community_priors()
from public, anon, authenticated;
revoke execute on function
  public.rating_recency(timestamptz),
  public.place_community_score(uuid, numeric, numeric)
from public, anon;
grant execute on function
  public.rating_recency(timestamptz),
  public.place_community_score(uuid, numeric, numeric)
to authenticated;
