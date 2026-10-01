-- Global karşılaştırma modeli (kullanıcı kararı 2026-10-01: "global modeli şimdi kur") ve arkadaş puanının
-- önerileri ezmemesi.
--
-- Puanla puanı artık tek tek puanların ortalaması değil, herkesin listelerindeki bütün karşılaştırmalardan kurulan
-- bir modelden (Plackett–Luce): her (kişi, segment) listesi tek sıralamadır: beğendikleri (seviyeleriyle) >
-- "beğendim çizgisi" > idare ettikleri > "beğenmedim çizgisi" > beğenmedikleri. Mekân kendinden aşağıdaki her şeyi
-- (mekân ve çizgi), çizgi yalnızca aşağıdaki mekânları geçmiş sayılır (çizgiler birbiriyle yarışmaz); eşitler aynı
-- basamakta, birbirini geçmez. Güçlü rakipleri geçmek zayıfları geçmekten çok sayılır. Ağırlık: puanlayanın deneyimi
-- × tazelik (topluluk puanıyla aynı). Öncül: her mekân sıradan bir mekânla (güç 1) bir kez berabere kalmış sayılır,
-- az puanlanan ortadan başlar. Çözüm MM yinelemeleriyle (Hunter 2004), önceki çözümden ısınarak.
--
-- Gösterilen puan: çok mekân puanlamış tipik bir kullanıcının vereceği beklenen puan. Grup olasılıkları çizgilere
-- göre (beğenme = γ / (γ + γ_beğendim) …), grup içindeki yer o gruba girebilecek mekânlar arasındaki yüzdelik, puan
-- kişisel puanla aynı eğriyle (üst − (üst − alt) × yer²). Simülasyonda yoğun veride gerçek ilk 20'yi bulma
-- 10,5 → 15,5 / 20; seyrek veride kalibre katkıyla aynı.
--
-- Model en fazla 15 dakikada bir yeniden hesaplanır (pg_cron varsa zamanlanmış görev, yoksa puan değişince
-- tetikleyici). Son hesaptan sonra gelen puanlar kalibre katkılarıyla hemen harmanlanır; modelin görmediği mekânda
-- kalibre katkıların Bayes ortalaması kullanılır.
--
-- Öneriler: arkadaş puanı topluluk puanının yerine geçmez; aynı ortalamaya tanımadığın birinin iki katı ağırlıkla
-- eklenir (topluluktaki kendi puanıyla toplam üç kat). Güven çarpanı kalktı: belirsizliği öncül zaten taşıyor.

-- ---------------------------------------------------------------------------
-- Model tabloları
-- ---------------------------------------------------------------------------

/** Mekânın model gücü (log γ), gösterilen puanı ve modele giren puanların ağırlığı (+2, yeni puanlarla harmanlarken) */
create table public.place_strengths (
  place_id uuid primary key references public.places (id) on delete cascade,
  segment public.place_segment not null,
  strength double precision not null,
  score double precision not null constraint place_strengths_score_range check (score between 0 and 10),
  fit_weight double precision not null,
  ratings integer not null
);

/** Segmentin "beğendim" ve "beğenmedim" çizgilerinin gücü (log γ) */
create table public.segment_anchors (
  segment public.place_segment primary key,
  liked double precision not null,
  disliked double precision not null
);

/** Son model hesabı (tek satır) */
create table public.model_state (
  id boolean primary key default true constraint model_state_single check (id),
  fitted_at timestamptz,
  iterations integer not null default 0,
  places integer not null default 0,
  lists integer not null default 0
);

insert into public.model_state (id) values (true) on conflict do nothing;

alter table public.place_strengths enable row level security;
alter table public.segment_anchors enable row level security;
alter table public.model_state enable row level security;
revoke all on public.place_strengths, public.segment_anchors, public.model_state from public, anon, authenticated;
-- Zararsız özetler: üyeler okur (topluluk puanını hesaplayan fonksiyonlar çağıranın yetkisiyle çalışır)
grant select on public.place_strengths, public.model_state to authenticated;
create policy "Model gücü üyelere açık" on public.place_strengths for select to authenticated using (true);
create policy "Model durumu üyelere açık" on public.model_state for select to authenticated using (true);

/** Segment çizgisinin modeldeki kimliği */
create or replace function public.model_anchor(p_segment public.place_segment, p_kind text)
returns uuid
language sql
stable
parallel safe
set search_path = ''
as $$
  select md5('puanla-anchor:' || p_segment::text || ':' || p_kind)::uuid
$$;

-- ---------------------------------------------------------------------------
-- Modeli hesaplama
-- ---------------------------------------------------------------------------

/**
 * Modeli `p_iterations` MM yinelemesiyle günceller (önceki çözümden başlar) ve puanları yazar. Aynı anda yalnızca
 * bir hesap çalışır. Uygulamadaki karşılığı yok; testteki başvuru uygulaması (`fitPlaceModel`) birebir aynı.
 */
create or replace function public.refresh_place_strengths(p_iterations integer default 8)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not pg_try_advisory_xact_lock(hashtextextended('place_model', 0)) then
    return;
  end if;

  drop table if exists pg_temp.model_rows;
  drop table if exists pg_temp.model_gamma;

  -- Her liste: mekânlar (grup + seviye) ve iki çizgi; `step` listedeki basamak (eşitler aynı basamakta)
  create temp table model_rows on commit drop as
  with entries as (
    select r.user_id, r.segment, r.place_id as item, true as is_place,
      case r.sentiment when 'liked' then 0 when 'fine' then 2 else 4 end as band,
      sum(case when r.tied and r.position > 0 then 0 else 1 end)
        over (partition by r.user_id, r.segment, r.sentiment order by r.position) as tier,
      (r.weight * public.rating_recency(r.rated_at))::double precision as w,
      r.weight::double precision as rater_weight
    from public.rankings r
  ),
  lists as (
    select user_id, segment, max(rater_weight) as w from entries group by user_id, segment
  ),
  everything as (
    select user_id, segment, item, is_place, band, tier, w from entries
    union all
    select user_id, segment, public.model_anchor(segment, 'liked'), false, 1, 0, w from lists
    union all
    select user_id, segment, public.model_anchor(segment, 'disliked'), false, 3, 0, w from lists
  )
  select user_id, segment, item, is_place, w,
    dense_rank() over (partition by user_id, segment order by band, tier)::int as step
  from everything;

  create index on pg_temp.model_rows (item);

  create temp table model_gamma on commit drop as
  select item, (array_agg(segment))[1] as segment, bool_or(is_place) as is_place, 0::double precision as lg
  from pg_temp.model_rows
  group by item;

  create unique index on pg_temp.model_gamma (item);

  update pg_temp.model_gamma g set lg = ps.strength from public.place_strengths ps where ps.place_id = g.item;
  update pg_temp.model_gamma g set lg = a.liked
  from public.segment_anchors a where g.item = public.model_anchor(a.segment, 'liked');
  update pg_temp.model_gamma g set lg = a.disliked
  from public.segment_anchors a where g.item = public.model_anchor(a.segment, 'disliked');

  -- MM: γ ← (kazanç + 1) / (Σ 1 / seçim kümesinin gücü + 2 / (γ + 1)); öncül: güç 1'lik sanal mekânla bir
  -- galibiyet, bir yenilgi. Tüm öğeler aynı önceki çözümden güncellenir.
  for i in 1 .. greatest(p_iterations, 0) loop
    with j as (
      select m.user_id, m.segment, m.item, m.is_place, m.w, m.step, exp(g.lg) as gamma
      from pg_temp.model_rows m
      join pg_temp.model_gamma g on g.item = m.item
    ),
    sets as (
      select j.*,
        coalesce(sum(gamma) over below, 0) as rest_all,
        coalesce(sum(gamma) filter (where is_place) over below, 0) as rest_places
      from j
      window below as (partition by user_id, segment order by step range between 1 following and unbounded following)
    ),
    choices as (
      select s.*,
        case when rest > 0 then w / (gamma + rest) else 0 end as u,
        case when rest > 0 then w else 0 end as win
      from (select sets.*, case when is_place then rest_all else rest_places end as rest from sets) s
    ),
    dens as (
      select item, win,
        u + case
          when is_place then coalesce(sum(u) over above, 0)
          else coalesce(sum(u) filter (where is_place) over above, 0)
        end as den
      from choices
      window above as (partition by user_id, segment order by step range between unbounded preceding and 1 preceding)
    ),
    per_item as (
      select item, sum(win) as wins, sum(den) as den from dens group by item
    )
    update pg_temp.model_gamma g
    set lg = ln((coalesce(p.wins, 0) + 1) / (coalesce(p.den, 0) + 2 / (exp(g.lg) + 1)))
    from (
      select g2.item, pi.wins, pi.den
      from pg_temp.model_gamma g2
      left join per_item pi on pi.item = g2.item
    ) p
    where p.item = g.item;
  end loop;

  insert into public.segment_anchors (segment, liked, disliked)
  select segment,
    max(lg) filter (where item = public.model_anchor(segment, 'liked')),
    max(lg) filter (where item = public.model_anchor(segment, 'disliked'))
  from pg_temp.model_gamma
  where not is_place
  group by segment
  on conflict (segment) do update set liked = excluded.liked, disliked = excluded.disliked;

  -- Gösterilen puan: tipik bir kullanıcının beklenen puanı (grup olasılığı × grup içindeki yerin puanı)
  with p as (
    select g.item as place_id, g.segment, g.lg, round(g.lg::numeric, 9) as key,
      exp(g.lg) / (exp(g.lg) + exp(a.liked)) as p_liked,
      exp(a.disliked) / (exp(g.lg) + exp(a.disliked)) as p_disliked
    from pg_temp.model_gamma g
    join public.segment_anchors a on a.segment = g.segment
    where g.is_place
  ),
  bands as (
    select place_id, segment, lg, key,
      p_liked / t as pl,
      greatest(1 - p_liked - p_disliked, 0) / t as pf,
      p_disliked / t as pd
    from (select p.*, p_liked + greatest(1 - p_liked - p_disliked, 0) + p_disliked as t from p) x
  ),
  -- Grup içindeki yer: o gruba girme olasılığıyla tartılmış, daha güçlü mekânların payı + eşitlerin yarısı
  placed as (
    select b.*,
      (sum(pl) over upto - sum(pl) over peers / 2) / nullif(sum(pl) over seg, 0) as xl,
      (sum(pf) over upto - sum(pf) over peers / 2) / nullif(sum(pf) over seg, 0) as xf,
      (sum(pd) over upto - sum(pd) over peers / 2) / nullif(sum(pd) over seg, 0) as xd
    from bands b
    window upto as (partition by segment order by key desc range between unbounded preceding and current row),
      peers as (partition by segment, key),
      seg as (partition by segment)
  ),
  stats as (
    select r.place_id, count(*)::int as n,
      2 + sum(r.weight * public.rating_recency(r.rated_at))::double precision as fit_weight
    from public.rankings r
    group by r.place_id
  )
  insert into public.place_strengths (place_id, segment, strength, score, fit_weight, ratings)
  select pp.place_id, pp.segment, pp.lg,
    least(10, greatest(0,
      pp.pl * (10 - 3.3 * power(coalesce(pp.xl, 0.5), 2))
      + pp.pf * (6.6 - 3.2 * power(coalesce(pp.xf, 0.5), 2))
      + pp.pd * (3.3 - 3.3 * power(coalesce(pp.xd, 0.5), 2))
    )),
    s.fit_weight, s.n
  from placed pp
  join stats s on s.place_id = pp.place_id
  on conflict (place_id) do update
    set segment = excluded.segment, strength = excluded.strength, score = excluded.score,
      fit_weight = excluded.fit_weight, ratings = excluded.ratings;

  delete from public.place_strengths ps
  where not exists (select 1 from pg_temp.model_gamma g where g.item = ps.place_id and g.is_place);

  update public.model_state
  set fitted_at = now(),
    iterations = iterations + greatest(p_iterations, 0),
    places = (select count(*) from pg_temp.model_gamma where is_place),
    lists = (select count(distinct (user_id, segment)) from pg_temp.model_rows);
end;
$$;

/** Puan değişince model en fazla 15 dakikada bir yenilenir (pg_cron yoksa) */
create or replace function public.maybe_refresh_place_strengths()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.model_state where fitted_at > now() - interval '15 minutes') then
    perform public.refresh_place_strengths();
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Puanla puanı
-- ---------------------------------------------------------------------------

/** Son model hesabının zamanı; bu andan (dahil) sonraki puanlar model dışında sayılır */
create or replace function public.model_fitted_at()
returns timestamptz
language sql
stable
parallel safe
set search_path = ''
as $$
  select coalesce((select fitted_at from public.model_state), '-infinity'::timestamptz)
$$;

/**
 * Mekânın Puanla puanı. Model mekânı gördüyse modelin puanı, son hesaptan sonra gelen puanların kalibre
 * katkılarıyla harmanlanır: (model ağırlığı × model puanı + Σ yeni katkı) / (model ağırlığı + Σ yeni ağırlık).
 * Görmediyse kalibre katkıların Bayes ortalaması (`place_community_score`). Görünen puan yoksa boş.
 * `p_total`/`p_weight`: tüm görünen puanlar (katkı × ağırlık), `p_new_*`: son hesaptan sonrakiler.
 */
create or replace function public.puanla_score(
  p_place_id uuid,
  p_total numeric,
  p_weight numeric,
  p_new_total numeric,
  p_new_weight numeric
)
returns double precision
language sql
stable
parallel safe
set search_path = ''
as $$
  select case
    when coalesce(p_weight, 0) <= 0 then null
    when ps.place_id is not null then
      (ps.fit_weight * ps.score + coalesce(p_new_total, 0)::double precision)
        / (ps.fit_weight + coalesce(p_new_weight, 0)::double precision)
    else public.place_community_score(p_place_id, p_total, p_weight)
  end
  from (select 1) one
  left join public.place_strengths ps on ps.place_id = p_place_id
$$;

-- ---------------------------------------------------------------------------
-- Okumalar. Gövdeler 20261015100000_calibrated_scores'taki ile aynı; yalnızca topluluk puanı `puanla_score` oldu
-- (öneriler ayrıca: arkadaş harmanı)
-- ---------------------------------------------------------------------------

/**
 * Mekân sayfası. Topluluk puanı Puanla puanı (model + yeni puanlar); arkadaşların puanı kendi listelerinde
 * gördükleri puan.
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
        'average', public.puanla_score(
          p_place_id,
          sum(coalesce(calibrated_score, score) * weight * public.rating_recency(rated_at)),
          sum(weight * public.rating_recency(rated_at)),
          sum(coalesce(calibrated_score, score) * weight * public.rating_recency(rated_at))
            filter (where rated_at >= public.model_fitted_at()),
          sum(weight * public.rating_recency(rated_at)) filter (where rated_at >= public.model_fitted_at())
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

/** Harita katmanı: görünen bölgede en çok puanlanan mekânlar, Puanla puanıyla */
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
      public.puanla_score(
        r.place_id,
        sum(coalesce(r.calibrated_score, r.score) * r.weight * public.rating_recency(r.rated_at)),
        sum(r.weight * public.rating_recency(r.rated_at)),
        sum(coalesce(r.calibrated_score, r.score) * r.weight * public.rating_recency(r.rated_at))
          filter (where r.rated_at >= public.model_fitted_at()),
        sum(r.weight * public.rating_recency(r.rated_at)) filter (where r.rated_at >= public.model_fitted_at())
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

/** Bölgenin en yüksek puanlıları (Puanla puanı, segment süzgeci, sayfalı, kapanan mekân yok) */
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
      public.puanla_score(
        r.place_id,
        sum(coalesce(r.calibrated_score, r.score) * r.weight * public.rating_recency(r.rated_at)),
        sum(r.weight * public.rating_recency(r.rated_at)),
        sum(coalesce(r.calibrated_score, r.score) * r.weight * public.rating_recency(r.rated_at))
          filter (where r.rated_at >= public.model_fitted_at()),
        sum(r.weight * public.rating_recency(r.rated_at)) filter (where r.rated_at >= public.model_fitted_at())
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
 * Öneriler: gitmediğin, beğenmen beklenen mekânlar. Tahmin = Puanla puanı ile arkadaşların puanlarının (kalibre
 * katkı) harmanı: arkadaş, topluluk ağırlığına tanımadığın birinin iki katı olarak eklenir; tek arkadaş topluluğu
 * ezmez. Sonuçta gösterilen arkadaş ortalaması, arkadaşların kendi listelerinde gördükleri puan.
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
    select r.place_id, r.score, coalesce(r.calibrated_score, r.score) as calibrated
    from public.follows f
    join me on f.follower_id = me.id
    join public.rankings r on r.user_id = f.followee_id
    where not public.is_blocked_between(me.id, f.followee_id)
  ),
  friend_stats as (
    select fr.place_id, avg(fr.score)::double precision as friend_average, count(*)::int as friend_count,
      sum(fr.calibrated)::double precision as friend_total
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
      coalesce(fs.friend_total, 0) as friend_total,
      public.puanla_score(c.id, agg.total, agg.weight, agg.new_total, agg.new_weight) as community_average,
      coalesce(ps.fit_weight + coalesce(agg.new_weight, 0), 2 + agg.weight)::double precision as community_weight,
      agg.n::int as community_count
    from candidates c
    left join friend_stats fs on fs.place_id = c.id
    left join public.place_strengths ps on ps.place_id = c.id
    cross join me
    cross join lateral (
      select
        sum(coalesce(r.calibrated_score, r.score) * r.weight * public.rating_recency(r.rated_at)) as total,
        sum(r.weight * public.rating_recency(r.rated_at)) as weight,
        sum(coalesce(r.calibrated_score, r.score) * r.weight * public.rating_recency(r.rated_at))
          filter (where r.rated_at >= public.model_fitted_at()) as new_total,
        sum(r.weight * public.rating_recency(r.rated_at)) filter (where r.rated_at >= public.model_fitted_at()) as new_weight,
        count(*) as n
      from public.rankings r
      where r.place_id = c.id
        and r.user_id <> me.id
        and not public.is_blocked_between(me.id, r.user_id)
    ) agg
    where agg.n > 0
  ),
  estimated as (
    select s.*,
      (s.community_weight * s.community_average + 2 * s.friend_total) / (s.community_weight + 2 * s.friend_count)
        as estimate
    from stats s
  ),
  scored as (
    select
      e.*,
      case when o.g is not null then extensions.st_distance(pl.location, o.g) / 1000 end as distance,
      e.estimate
        + case when t.avg_score >= 7 then 0.4 else 0 end
        - case when o.g is not null then least(extensions.st_distance(pl.location, o.g) / 10000, 1.5) else 0 end
        as rank_score
    from estimated e
    join public.places pl on pl.id = e.place_id
    cross join origin o
    left join taste t on t.cuisine = pl.cuisine
    where e.estimate >= 6.7
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
-- Yetkiler ve zamanlama
-- ---------------------------------------------------------------------------

revoke execute on function
  public.refresh_place_strengths(integer),
  public.maybe_refresh_place_strengths(),
  public.model_anchor(public.place_segment, text)
from public, anon, authenticated;
revoke execute on function
  public.model_fitted_at(),
  public.puanla_score(uuid, numeric, numeric, numeric, numeric)
from public, anon;
grant execute on function
  public.model_fitted_at(),
  public.puanla_score(uuid, numeric, numeric, numeric, numeric)
to authenticated;

-- pg_cron varsa 15 dakikada bir zamanlanmış görev (kullanıcının isteğini bekletmez); yoksa ya da kurulamazsa puan
-- değişince en fazla 15 dakikada bir tetikleyici
do $$
begin
  begin
    if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
      create extension if not exists pg_cron;
      perform cron.schedule('puanla-place-model', '*/15 * * * *', 'select public.refresh_place_strengths()');
      return;
    end if;
  exception when others then
    raise warning 'pg_cron kurulamadı (%): model puan değiştikçe tetikleyiciyle yenilenecek', sqlerrm;
  end;
  create trigger rankings_place_model after insert or update or delete on public.rankings
    for each statement execute function public.maybe_refresh_place_strengths();
end
$$;

-- İlk hesap: sıfırdan yakınsayana kadar
select public.refresh_place_strengths(200);
