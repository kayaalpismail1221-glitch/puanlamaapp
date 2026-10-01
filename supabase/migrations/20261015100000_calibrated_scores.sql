-- Puanlama doğruluğu (kullanıcı kararı 2026-09-30: "kişisel ve genel mekân puanı çok doğru olsun").
-- Uygulamadaki `src/lib/ranking.ts` ile birebir aynı kurallar.
--
-- 1) Topluluğa kalibre katkı: bir puan topluluk puanına, verenin listesindeki yerinin "çok mekân puanlamış
--    birinin listesinde beklenen puanı" olarak katılır: üst − (üst − alt) × (s + 1)(s + 2) / ((n + 1)(n + 2))
--    (s: seviye, 0 = en iyi; n: seviye sayısı). Tek mekânlık listenin favorisi 8,9, 30 mekânlık listenin favorisi
--    10,0 sayılır; bir listenin katkılarının ortalaması liste uzunluğundan bağımsızdır (Beğendim 8,9). Az mekân
--    puanlayanların gittiği yerler artık ~5 yüzdelik puan yukarıda görünmez (simülasyon). Kişinin kendi gördüğü puan
--    (`score`) değişmez; `calibrated_score` yalnızca topluluk ortalamasına (mekân sayfası, harita, bölge, öneriler,
--    tür ortalamaları) girer. Doğrudan eklenen satırlarda (betikler) boşsa `score` kullanılır.
-- 2) Eşitlik zinciri korunur: grubun başı (bir üsttekiyle eşit olmayan) listeden çıkınca, altındaki eşiti grubun
--    yeni başı olur. Eskiden A > B = C iken B çıkınca C, A'ya eşit sayılıyordu.
-- 3) Eşit grubun arasına eşitliksiz girilmez: yeni mekân üstündekinden kötü, o da altındaki eşitleriyle aynı;
--    eşitlerin hepsinin altına konur. Eskiden grup bölünüyor, alttaki eşit yeni mekâna eşitleniyordu. Yeni
--    uygulama eşitleri zaten tek mekân gibi sorar; bu kural eski uygulamalar ve tutarlılık için.

alter table public.rankings add column calibrated_score numeric(5, 3)
  constraint rankings_calibrated_range check (calibrated_score between 0 and 10);

comment on column public.rankings.calibrated_score is
  'Topluluk puanına katkı: listedeki yerin uzun listede beklenen puanı (bkz. calibrated_score())';

/** Seviyenin topluluğa katkısı. pos: seviye (0 = en iyi), cnt: seviye sayısı. E[P²] = (pos+1)(pos+2)/((cnt+1)(cnt+2)) */
create or replace function public.calibrated_score(s public.sentiment, pos integer, cnt integer)
returns numeric
language sql
immutable
parallel safe
set search_path = ''
as $$
  select round((hi - (hi - lo) * (p + 1) * (p + 2) / ((n + 1) * (n + 2))::numeric) / 10.0, 3)
  from (
    select
      case s when 'liked' then 100 when 'fine' then 66 else 33 end as hi,
      case s when 'liked' then 67 when 'fine' then 34 else 0 end as lo,
      greatest(cnt, 1) as n,
      least(greatest(pos, 0), greatest(cnt - 1, 0)) as p
  ) base
$$;

-- ---------------------------------------------------------------------------
-- Puanlar: kişisel puan ve topluluk katkısı birlikte
-- ---------------------------------------------------------------------------

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
  set score = public.sentiment_score(r.sentiment, t.tier, t.tiers),
    calibrated_score = public.calibrated_score(r.sentiment, t.tier, t.tiers)
  from (
    select x.place_id, x.tier, (max(x.tier) over () + 1)::int as tiers
    from (
      select place_id,
        (sum(case when tied and position > 0 then 0 else 1 end) over (order by position) - 1)::int as tier
      from public.rankings
      where user_id = p_user_id and segment = p_segment and sentiment = p_sentiment
    ) x
  ) t
  where r.user_id = p_user_id and r.place_id = t.place_id
    and (
      r.score is distinct from public.sentiment_score(r.sentiment, t.tier, t.tiers)
      or r.calibrated_score is distinct from public.calibrated_score(r.sentiment, t.tier, t.tiers)
    )
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
  set score = public.sentiment_score(r.sentiment, t.tier, t.tiers),
    calibrated_score = public.calibrated_score(r.sentiment, t.tier, t.tiers)
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
    and (
      r.score is distinct from public.sentiment_score(r.sentiment, t.tier, t.tiers)
      or r.calibrated_score is distinct from public.calibrated_score(r.sentiment, t.tier, t.tiers)
    );
$$;

-- ---------------------------------------------------------------------------
-- Eşitlik zinciri
-- ---------------------------------------------------------------------------

/**
 * Sıralama satırını listeden çıkarır, alttakileri bir yukarı kaydırır. Çıkan kayıt grubunun başıysa (bir
 * üsttekiyle eşit değilse ya da listenin başındaysa) altındaki eşiti grubun yeni başı olur; yoksa üstteki
 * gruba eşit sayılırdı. Uygulamadaki `removeFromRankings` ile aynı.
 */
create or replace function public.detach_ranking(p_user_id uuid, p_place_id uuid)
returns public.rankings
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed public.rankings;
begin
  delete from public.rankings
  where user_id = p_user_id and place_id = p_place_id
  returning * into removed;

  if not found then
    return null;
  end if;

  if not removed.tied or removed.position = 0 then
    update public.rankings
    set tied = false
    where user_id = p_user_id
      and segment = removed.segment
      and sentiment = removed.sentiment
      and position = removed.position + 1
      and tied;
  end if;

  update public.rankings
  set position = position - 1
  where user_id = p_user_id
    and segment = removed.segment
    and sentiment = removed.sentiment
    and position > removed.position;

  return removed;
end;
$$;

/**
 * Mekânı kullanıcının sıralamasına ekler (ya da yerini değiştirir). `p_index`: segmentteki, seçilen izlenim
 * listesindeki yeni sıra (0 = en iyi). `p_tie`: bir üstteki mekânla aynı seviye ("İkisi aynı"); listenin başına
 * eşitlik konmaz. Eşitliksiz eklemede sıra eşit grubun içine düşerse grubun sonuna iner. Kayan kayıtlar eşitlik
 * bayraklarını korur. İstemcideki `insertEntry` ile aynı. Gövde 20261013140000_score_curve_ties'teki ile aynı;
 * yalnızca grup içi sıranın düzeltilmesi eklendi.
 */
create or replace function public.rank_place(
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

  -- Yeni mekân bir üsttekinden kötü bulundu; o da altındaki eşitleriyle aynı: grubu bölmeden hepsinin altına
  if not coalesce(p_tie, false) and target > 0 then
    target := coalesce(
      (
        select min(position)
        from public.rankings
        where user_id = uid and segment = seg and sentiment = p_sentiment and position >= target and not tied
      ),
      group_size
    );
  end if;

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

-- ---------------------------------------------------------------------------
-- Topluluk puanı kalibre katkıdan. Gövdeler 20261013140000_score_curve_ties'teki ile aynı; yalnızca toplanan
-- puan `coalesce(calibrated_score, score)` oldu.
-- ---------------------------------------------------------------------------

/** Başlangıç değerlerini yeniden hesaplar: tür ≥ 30 puan → türün ortalaması, yoksa tüm puanlarınki, o da yoksa 7,5 */
create or replace function public.refresh_community_priors()
returns void
language sql
security definer
set search_path = ''
as $$
  with per as (
    select r.segment, sum(coalesce(r.calibrated_score, r.score) * r.weight) / nullif(sum(r.weight), 0) as mean,
      count(*)::int as n
    from public.rankings r
    group by r.segment
  ),
  overall as (
    select sum(coalesce(r.calibrated_score, r.score) * r.weight) / nullif(sum(r.weight), 0) as mean, count(*)::int as n
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

/**
 * Mekân sayfası. Topluluk puanı kalibre katkılardan; arkadaşların puanı kendi listelerinde gördükleri puan.
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
        'average', public.place_community_score(
          p_place_id,
          sum(coalesce(calibrated_score, score) * weight * public.rating_recency(rated_at)),
          sum(weight * public.rating_recency(rated_at))
        ),
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

/** Harita katmanı: görünen bölgede en çok puanlanan mekânlar, topluluk puanıyla */
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
      public.place_community_score(
        r.place_id,
        sum(coalesce(r.calibrated_score, r.score) * r.weight * public.rating_recency(r.rated_at)),
        sum(r.weight * public.rating_recency(r.rated_at))
      ) as average,
      count(*)::int as rating_count
    from top
    join public.rankings r on r.place_id = top.id
    group by r.place_id
    order by rating_count desc, average desc
    limit least(greatest(p_limit, 1), 300)
  )
  select v.id, v.name, v.cuisine, v.neighborhood, v.district, v.city, v.price_level, v.latitude, v.longitude,
    v.photo, rated.average, rated.rating_count
  from rated
  join public.place_view v on v.id = rated.place_id
  order by rated.rating_count desc, rated.average desc
$$;

/** Bölgenin en yüksek puanlıları (topluluk puanı, segment süzgeci, sayfalı, kapanan mekân yok) */
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
      public.place_community_score(
        r.place_id,
        sum(coalesce(r.calibrated_score, r.score) * r.weight * public.rating_recency(r.rated_at)),
        sum(r.weight * public.rating_recency(r.rated_at))
      ) as average,
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

/**
 * Öneriler: gitmediğin, arkadaşlarının (öncelikli) ya da topluluğun beğendiği mekânlar. Topluluk puanı kalibre
 * katkılardan; arkadaş puanı onların kendi listelerinde gördükleri puan.
 */
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
      select
        sum(coalesce(r.calibrated_score, r.score) * r.weight * public.rating_recency(r.rated_at)) as total,
        sum(r.weight * public.rating_recency(r.rated_at)) as weight,
        count(*) as n
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

-- ---------------------------------------------------------------------------
-- Mevcut veri: sıra korunur, kişisel puanlar aynı kalır, katkılar hesaplanır; tür ortalamaları katkıdan
-- ---------------------------------------------------------------------------

select public.normalize_rankings();
select public.refresh_community_priors();
