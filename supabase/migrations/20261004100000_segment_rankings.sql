-- Segment bazlı sıralama ve dayanıklı topluluk puanı.
--
-- 1) Segment: birbiriyle kıyaslanması anlamlı mekân aileleri (restoran, sokak lezzeti, kahvaltı, kafe/tatlı,
--    meyhane/bar). Yeni mekân yalnızca aynı segmentteki mekânlarla karşılaştırılır; sıra ve puan segment
--    içinde tutulur. Uygulamadaki `src/constants/segments.ts` ile aynı eşleme.
-- 2) Kısa listelerde uç puan yok: tek "Beğendim" 10,0 değil 8,4; liste 5 mekâna ulaşınca tüm aralık
--    kullanılır (`sentiment_score`, uygulamadaki `scoreAt` ile birebir).
-- 3) Topluluk puanı ham ortalama değil, Bayes ortalaması: az puanlanan mekân 7,0'a doğru çekilir, tek bir
--    10 ya da tek bir 1 mekânı uca taşımaz (`community_score`).
-- Mevcut sıralamalar korunur: her kullanıcının grup içi sırası segmentlere bölünür, puanlar yeniden hesaplanır.

-- ---------------------------------------------------------------------------
-- Segmentler
-- ---------------------------------------------------------------------------

create type public.place_segment as enum ('restaurant', 'street', 'breakfast', 'cafe', 'nightlife');

alter table public.cuisines add column segment public.place_segment not null default 'restaurant';

update public.cuisines c
set segment = m.segment::public.place_segment
from (
  values
    ('Restoran', 'restaurant'),
    ('Esnaf lokantası', 'restaurant'),
    ('Kebapçı', 'restaurant'),
    ('Balıkçı', 'restaurant'),
    ('Uzak Doğu', 'restaurant'),
    ('Dünya mutfağı', 'restaurant'),
    ('Dürümcü', 'street'),
    ('Dönerci', 'street'),
    ('Kokoreççi', 'street'),
    ('Ciğerci', 'street'),
    ('Köfteci', 'street'),
    ('Çiğ köfteci', 'street'),
    ('Pideci', 'street'),
    ('Pizzacı', 'street'),
    ('Burgerci', 'street'),
    ('Büfe & fast food', 'street'),
    ('Kahvaltıcı', 'breakfast'),
    ('Kafe', 'cafe'),
    ('Tatlıcı', 'cafe'),
    ('Pastane & fırın', 'cafe'),
    ('Dondurmacı', 'cafe'),
    ('Meyhane', 'nightlife'),
    ('Bar', 'nightlife')
) as m (name, segment)
where c.name = m.name;

/** Mekânın segmenti (kategorisinden) */
create or replace function public.place_segment_of(p_place_id uuid)
returns public.place_segment
language sql
stable
set search_path = ''
as $$
  select c.segment
  from public.places pl
  join public.cuisines c on c.name = pl.cuisine
  where pl.id = p_place_id
$$;

-- ---------------------------------------------------------------------------
-- Sıralamalar segmentlere bölünür
-- ---------------------------------------------------------------------------

alter table public.rankings add column segment public.place_segment;

update public.rankings r set segment = public.place_segment_of(r.place_id);

alter table public.rankings alter column segment set not null;

alter table public.rankings drop constraint rankings_position_unique;

-- Grup içi sıra korunarak her segment 0'dan yeniden numaralanır
update public.rankings r
set position = n.position
from (
  select user_id, place_id, (row_number() over (partition by user_id, segment, sentiment order by position) - 1)::int as position
  from public.rankings
) n
where r.user_id = n.user_id and r.place_id = n.place_id;

alter table public.rankings add constraint rankings_position_unique
  unique (user_id, segment, sentiment, position) deferrable initially immediate;

/** Segment her zaman mekânın kategorisinden gelir (toplu ekleme yapan betikler de doğru segmente yazar) */
create or replace function public.set_ranking_segment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.segment := public.place_segment_of(new.place_id);
  return new;
end;
$$;

create trigger rankings_segment before insert on public.rankings
  for each row execute function public.set_ranking_segment();

-- ---------------------------------------------------------------------------
-- Puan
-- ---------------------------------------------------------------------------

/**
 * Listedeki sıradan puan. Uygulamadaki `scoreAt` ile birebir aynı:
 * aralığın ortası + yayılma × sıradaki yer; yayılma liste 5 mekâna ulaşana kadar 0'dan 1'e çıkar.
 * Onda birler cinsinden, yalnızca tam sayılarla (yarımlar yukarı yuvarlanır).
 */
create or replace function public.sentiment_score(s public.sentiment, pos integer, cnt integer)
returns numeric
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when cnt <= 1 then ((hi + lo + 1) / 2) / 10.0
    else ((2 * n + m) / (2 * m)) / 10.0
  end
  from (
    select
      hi,
      lo,
      steps * d * (hi + lo) + least(d, steps) * (hi - lo) * (d - 2 * p) as n,
      2 * steps * d as m
    from (
      select
        case s when 'liked' then 100 when 'fine' then 66 else 33 end as hi,
        case s when 'liked' then 67 when 'fine' then 34 else 0 end as lo,
        greatest(cnt - 1, 1) as d,
        least(greatest(pos, 0), greatest(cnt - 1, 1)) as p,
        4 as steps
    ) base
  ) terms
$$;

/** Bir kullanıcının bir segment + izlenim listesindeki puanlarını sıraya göre yeniden hesaplar */
drop function public.recompute_group_scores(uuid, public.sentiment);

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
  set score = public.sentiment_score(r.sentiment, r.position, g.cnt)
  from (
    select count(*)::int as cnt
    from public.rankings
    where user_id = p_user_id and segment = p_segment and sentiment = p_sentiment
  ) g
  where r.user_id = p_user_id and r.segment = p_segment and r.sentiment = p_sentiment
$$;

/**
 * Sıraları boşluksuz yeniden numaralar ve tüm puanları hesaplar (kullanıcı verilmezse herkes).
 * Migration, seed ve toplu içe aktarmalar sonrası için; sıra korunur.
 */
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
  set score = public.sentiment_score(r.sentiment, r.position, g.cnt)
  from (
    select user_id, segment, sentiment, count(*)::int as cnt
    from public.rankings
    where p_user_id is null or user_id = p_user_id
    group by user_id, segment, sentiment
  ) g
  where r.user_id = g.user_id and r.segment = g.segment and r.sentiment = g.sentiment;
$$;

select public.normalize_rankings();

-- ---------------------------------------------------------------------------
-- Puanlama fonksiyonları
-- ---------------------------------------------------------------------------

/** Mekânı sıralamadan çıkarır, listesinin sırasını sıkıştırır ve çıkan satırı döner (kilit çağıranda) */
drop function public.detach_ranking(uuid, uuid);

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
 * Mekânı kullanıcının sıralamasına ekler (ya da yerini değiştirir).
 * `p_index`: mekânın segmentindeki, seçilen izlenim listesindeki yeni sıra (0 = en iyi).
 * Uygulamadaki `insertEntry` ile aynı davranır. Puanlanan mekân Listem'den çıkar. Yeni puanı döner.
 */
create or replace function public.rank_place(
  p_place_id uuid,
  p_sentiment public.sentiment,
  p_index integer,
  p_note text default null
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

  insert into public.rankings (user_id, place_id, sentiment, segment, position, score, note)
  values (uid, p_place_id, p_sentiment, seg, target, 0, nullif(btrim(p_note), ''));

  perform public.recompute_group_scores(uid, seg, p_sentiment);
  if previous.place_id is not null and (previous.segment, previous.sentiment) is distinct from (seg, p_sentiment) then
    perform public.recompute_group_scores(uid, previous.segment, previous.sentiment);
  end if;

  delete from public.saved_places where user_id = uid and place_id = p_place_id;

  select score into result from public.rankings where user_id = uid and place_id = p_place_id;
  return result;
end;
$$;

create or replace function public.unrank_place(p_place_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  previous public.rankings;
begin
  if uid is null then
    raise exception 'Giriş yapman gerekiyor' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('rankings:' || uid::text, 0));
  previous := public.detach_ranking(uid, p_place_id);
  if previous.place_id is not null then
    perform public.recompute_group_scores(uid, previous.segment, previous.sentiment);
  end if;
end;
$$;

/**
 * Mekânın kategorisi başka bir segmente geçerse (düzeltme, birleştirme) onu puanlamış herkesin
 * sıralamasında mekân yeni segmentin o izlenim listesinin sonuna taşınır; iki liste de yeniden puanlanır.
 */
create or replace function public.on_place_cuisine_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  seg public.place_segment := public.place_segment_of(new.id);
  moved public.rankings;
begin
  for moved in
    select * from public.rankings where place_id = new.id and segment <> seg
  loop
    perform pg_advisory_xact_lock(hashtextextended('rankings:' || moved.user_id::text, 0));
    perform public.detach_ranking(moved.user_id, moved.place_id);
    insert into public.rankings (user_id, place_id, sentiment, segment, position, score, note, rated_at)
    select moved.user_id, moved.place_id, moved.sentiment, seg, count(*)::int, 0, moved.note, moved.rated_at
    from public.rankings
    where user_id = moved.user_id and segment = seg and sentiment = moved.sentiment;
    perform public.recompute_group_scores(moved.user_id, moved.segment, moved.sentiment);
    perform public.recompute_group_scores(moved.user_id, seg, moved.sentiment);
  end loop;
  return null;
end;
$$;

create trigger places_cuisine_segment after update of cuisine on public.places
  for each row
  when (old.cuisine is distinct from new.cuisine)
  execute function public.on_place_cuisine_change();

/** Sıralama satırı ve mekânı (segment sona eklendi; mevcut sütunların sırası değişmez) */
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
  r.segment
from public.rankings r;

-- ---------------------------------------------------------------------------
-- Topluluk puanı
-- ---------------------------------------------------------------------------

/**
 * Bayes ortalaması: (C × m + puanlar toplamı) / (C + puan sayısı), m = 7,0 ve C = 2.
 * Tek bir 9,2 → 7,7; beş kişi ortalama 9,2 → 8,6; yirmi kişi → 9,0. Az puanlı mekân ne tek bir
 * hayranla zirveye çıkar ne de tek bir kötü puanla dibe iner; puan sayısı arttıkça gerçek ortalamaya yaklaşır.
 */
create or replace function public.community_score(p_total numeric, p_count bigint)
returns double precision
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case when p_count > 0 then ((2 * 7.0 + p_total) / (2 + p_count))::double precision end
$$;

/**
 * Mekân sayfası için tek çağrıda: mekân, topluluk puanı (`rating.average`: Bayes ortalaması), "Puanla
 * kullanıcılarına göre" özeti (en sık kişi başı aralığı, öne çıkanlar, en çok yenilenler) ve takip
 * edilenlerin puanları.
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
      select jsonb_build_object('average', public.community_score(sum(score), count(*)), 'count', count(*))
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

/** Harita "Puanla" katmanı: görünen bölgede puanlanan mekânlar ve topluluk puanı; en çok puanlananlar önce */
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
    select r.place_id, public.community_score(sum(r.score), count(*)) as average, count(*)::int as rating_count
    from public.rankings r
    join public.places pl on pl.id = r.place_id
    where pl.latitude between p_south and p_north
      and pl.longitude between p_west and p_east
    group by r.place_id
    order by count(*) desc, public.community_score(sum(r.score), count(*)) desc
    limit least(greatest(p_limit, 1), 300)
  )
  select v.*, rated.average, rated.rating_count
  from rated
  join public.place_view v on v.id = rated.place_id
$$;

/**
 * Henüz puanlamadığın, arkadaşlarının (takip ettiklerin) ya da topluluğun beğendiği mekânlar.
 * Arkadaş puanı: ortalama (az kişi, doğrudan tanıdığın insanlar). Topluluk puanı: Bayes ortalaması
 * (`community_score`), ≥ 6,7 olanlar. Sıralama: arkadaş ortalaması varsa o, yoksa topluluk puanı; puan
 * sayısı arttıkça güven artar; en sevdiğin mutfaklara küçük bir bonus; konum verilirse uzaklık cezası
 * (10 km'de 1 puan, en fazla 1,5). Engellediğin/engelleyen kişilerin puanları sayılmaz.
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
  stats as (
    select
      r.place_id,
      (avg(r.score) filter (where f.follower_id is not null))::double precision as friend_average,
      (count(*) filter (where f.follower_id is not null))::int as friend_count,
      public.community_score(sum(r.score), count(*)) as community_average,
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
  )
  select
    v.id, v.name, v.cuisine, v.neighborhood, v.district, v.city, v.price_level, v.latitude, v.longitude, v.photo,
    sc.friend_average, sc.friend_count, sc.community_average, sc.community_count, sc.distance::double precision
  from scored sc
  join public.place_view v on v.id = sc.place_id
  order by sc.rank_score desc, sc.community_count desc
  limit least(greatest(p_limit, 1), 50)
$$;

-- ---------------------------------------------------------------------------
-- Yetkiler
-- ---------------------------------------------------------------------------

revoke execute on function
  public.place_segment_of(uuid),
  public.community_score(numeric, bigint)
from public, anon;

grant execute on function
  public.place_segment_of(uuid),
  public.community_score(numeric, bigint)
to authenticated;

-- İç yardımcılar doğrudan çağrılmasın
revoke execute on function
  public.recompute_group_scores(uuid, public.place_segment, public.sentiment),
  public.normalize_rankings(uuid),
  public.detach_ranking(uuid, uuid),
  public.set_ranking_segment(),
  public.on_place_cuisine_change()
from public, anon, authenticated;
