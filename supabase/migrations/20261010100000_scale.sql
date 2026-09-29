-- Puanla: ölçek. (claude/friendly-albattani-ymieij dalındaki 20261004100000_scale, güncel dala taşındı:
-- search_places, map_places, recommended_places ve suggested_users bu dalın en son tanımları üzerine yazıldı —
-- kapanan mekânlar, segment/Bayes topluluk puanı ve gizlenen öneriler korunur. Liderlik ve profildeki sıra
-- XP sistemine (20261008100000_xp) ait olduğu için bu migration onlara dokunmaz.)
--
-- Puanla: ölçek. Aynı anda binlerce kullanıcı geldiğinde sık çağrılan okumalar tabloların tamamını taramasın.
--
-- Ölçüm (PGlite, 20 bin kullanıcı · 12 bin mekân · 60 bin gönderi · 200 bin puan · 400 bin beğeni):
--   popüler feed 0,9–2,3 sn · öneriler 3,9 sn · mekân arama 0,4–1,8 sn · kişi arama 0,5 sn · liderlik 0,8 sn ·
--   profildeki sıra 0,5 sn · harita (İstanbul) 0,27 sn · konum seçici 0,56 sn · beğeni geri alma bildirimleri tarıyor.
-- Hepsi her istekte tüm gönderileri/puanları topluyordu; veri büyüdükçe doğrusal yavaşlıyordu.
--
-- 1) Sayaçlar (tetikleyicilerle; istemci yazamaz): places.rating_count / post_count, profiles.like_total
-- 2) Popüler feed: zamandan bağımsız sıcaklık sütunu posts.hot + indeks; sayfa için yalnızca gereken satırlar okunur
-- 3) Arama, öneriler, harita, liderlik, takip feed'i, takip önerileri: sayaç ve indekslerle yalnızca aday kümesinde
-- 4) Eksik indeksler: yabancı anahtarlar (beğeni geri alma, gönderi/yorum/hesap silme bildirimleri tarıyordu),
--    mekân kapak fotoğrafı, günlük şikâyet sınırı

-- ---------------------------------------------------------------------------
-- 1) Sayaçlar
-- ---------------------------------------------------------------------------

alter table public.places
  add column rating_count integer not null default 0,
  add column post_count integer not null default 0;

-- Kullanıcının gönderilerinin aldığı toplam beğeni (liderlik tablosunda eşitlik bozucu)
alter table public.profiles add column like_total integer not null default 0;

update public.places pl set rating_count = s.n
from (select place_id, count(*)::int as n from public.rankings group by place_id) s
where s.place_id = pl.id;

update public.places pl set post_count = s.n
from (select place_id, count(*)::int as n from public.posts group by place_id) s
where s.place_id = pl.id;

update public.profiles pr set like_total = s.n
from (select user_id, sum(like_count)::int as n from public.posts group by user_id) s
where s.user_id = pr.id;

create or replace function public.on_ranking_count_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.places set rating_count = rating_count + 1 where id = new.place_id;
  else
    update public.places set rating_count = greatest(rating_count - 1, 0) where id = old.place_id;
  end if;
  return null;
end;
$$;

create trigger rankings_count after insert or delete on public.rankings
  for each row execute function public.on_ranking_count_change();

/** Gönderi sayısı (profil ve mekân) ve profilin toplam beğenisi */
create or replace function public.on_post_count_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles
    set post_count = post_count + 1, like_total = like_total + new.like_count
    where id = new.user_id;
    update public.places set post_count = post_count + 1 where id = new.place_id;
  else
    -- Gönderi silinince beğenileri de silinir; o beğenilerin tetikleyicisi gönderiyi artık bulamaz,
    -- bu yüzden toplam burada düşülür
    update public.profiles
    set post_count = greatest(post_count - 1, 0), like_total = greatest(like_total - old.like_count, 0)
    where id = old.user_id;
    update public.places set post_count = greatest(post_count - 1, 0) where id = old.place_id;
  end if;
  return null;
end;
$$;

create or replace function public.on_like_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  author uuid;
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id returning user_id into author;
    update public.profiles set like_total = like_total + 1 where id = author;
  else
    update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id returning user_id into author;
    update public.profiles set like_total = greatest(like_total - 1, 0) where id = author;
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Popüler feed
-- ---------------------------------------------------------------------------

/**
 * Sıcaklık: etkileşim (beğeni + 2 × yorum) üç katına çıkınca gönderi bir gün daha yeni sayılır.
 * Eski formül (etkileşim / yaş^1,3) her istekte her gönderi için yeniden hesaplanmak zorundaydı; bu hâli
 * zamana bağlı olmadığı için sütunda saklanır ve indekslenir. Sıra zamanla değişmez, sayfalar kaymaz.
 */
create or replace function public.hot_rank(likes integer, comments integer, created_at timestamptz)
returns double precision
language sql
immutable
parallel safe
set search_path = ''
as $$
  select ln(1 + greatest(likes, 0) + 2 * greatest(comments, 0))
    + extract(epoch from created_at)::double precision * ln(3) / 86400
$$;

alter table public.posts add column hot double precision
  generated always as (public.hot_rank(like_count, comment_count, created_at)) stored;

create index posts_hot_idx on public.posts (hot desc);

-- Bölgedeki gönderi sayısı ve en yakın şehir için yalnızca gönderisi olan mekânlar
create index places_posted_location_idx on public.places using gist (location) where post_count > 0;
create index places_posted_area_idx on public.places (city, district) where post_count > 0;

-- Eski imzalar (20261001100000_feed_as_of uygulanmamış olsa da çalışsın; iki imza kalırsa API hangisini
-- çağıracağını seçemez)
drop function if exists public.feed_popular(double precision, double precision, text, text, integer, integer);
drop function if exists public.feed_popular(double precision, double precision, text, text, integer, integer, timestamptz);
drop function if exists public.hot_score(integer, integer, timestamptz);
drop function if exists public.hot_score_at(integer, integer, timestamptz, timestamptz);

/**
 * Popüler feed (sözleşme aynı).
 * - Şehir seçiliyse: o şehrin (ve ilçenin) gönderileri, sıcaklığa göre.
 * - Konum verildiyse: 3 → 10 → 30 km içinde en az 5 gönderi bulunan ilk yarıçap;
 *   hiçbiri yetmezse en çok gönderiyi kapsayan en küçük yarıçap.
 *   Yakında hiç gönderi yoksa en yakın şehrin gönderileri (fallback_city).
 * - `p_as_of`: bu andan sonra paylaşılanlar sayfalara girmez (ilk sayfada boş; yanıttaki `as_of` geri yollanır).
 * Bölge yoğunsa gönderiler sıcaklık indeksinden okunur ve sayfa dolunca durulur; seyrekse bölgenin gönderileri
 * toplanıp sıralanır. İkisinde de okunan satır sayısı tüm gönderi sayısından bağımsızdır.
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
  radii constant int[] := array[3, 10, 30];
  min_posts constant int := 5;
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
        return jsonb_build_object('as_of', at_time, 'radius_km', null, 'fallback_city', null, 'entries', '[]'::jsonb);
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

  -- Sıcaklık indeksinden okumak ≈ (off + lim) × tümü / bölge satır; bölgeyi toplamak ≈ bölge satır
  if (off + lim) * all_posts < region_posts::double precision * region_posts then
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
        'distance_km', case when meters is not null
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

  return jsonb_build_object('as_of', at_time, 'radius_km', radius, 'fallback_city', fallback, 'entries', entries);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Diğer okumalar
-- ---------------------------------------------------------------------------

/** LIKE kalıbında %, _ ve \ harfiyen aransın ("a_b" her şeyi eşlemesin) */
create or replace function public.like_escape(input text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select replace(replace(replace(input, '\', '\\'), '%', '\%'), '_', '\_')
$$;

-- Konumsuz boş aramada en popülerler
create index places_popularity_idx on public.places ((rating_count + post_count) desc, name) where closed_at is null;

/**
 * Mekân arama: isim başı eşleşmeler önce, sonra benzerlik, yakınlık, popülerlik. Boş aramada konum varsa en
 * yakınlar, yoksa en popülerler. Kapanan mekân yok. Gövde 20261007110000_search_speed'deki ile aynı; popülerlik
 * her mekân için puan/gönderi saymak yerine sayaçtan, % ve _ harfiyen aranır.
 */
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
begin
  if q = '' then
    if origin is not null then
      return query
      select v.*
      from (
        select pl.id, pl.location operator(extensions.<->) origin as distance
        from public.places pl
        where pl.closed_at is null
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
        case when origin is not null then pl.location operator(extensions.<->) origin end as distance
      from public.places pl
      where pl.closed_at is null and public.tr_fold(pl.name) like prefix_pattern
      order by popularity desc, distance asc nulls last, pl.name
      limit lim
    )
    select v.*
    from hits
    join public.place_view v on v.id = hits.id
    order by hits.popularity desc, hits.distance asc nulls last, hits.name;
    return;
  end if;

  return query
  with hits as (
    select
      pl.id,
      pl.name,
      extensions.word_similarity(q, pl.search_text) as similarity,
      public.tr_fold(pl.name) like prefix_pattern as prefix,
      case when origin is not null then pl.location operator(extensions.<->) origin end as distance,
      pl.rating_count + pl.post_count as popularity
    from public.places pl
    where pl.closed_at is null
      and (pl.search_text like pattern or q operator(extensions.<%) pl.search_text)
    order by prefix desc, similarity desc, distance asc nulls last, popularity desc, pl.name
    limit lim
  )
  select v.*
  from hits
  join public.place_view v on v.id = hits.id
  order by hits.prefix desc, hits.similarity desc, hits.distance asc nulls last, hits.popularity desc, hits.name;
end;
$$;

/** Kişi arama (sözleşme aynı); mekân aramasındaki gibi trigram indeksi kullanılır */
create or replace function public.search_users(p_query text, p_limit integer default 30)
returns setof public.profile_view
language plpgsql
stable
set search_path = ''
set enable_seqscan = off
as $$
declare
  q text := public.tr_fold(btrim(ltrim(coalesce(p_query, ''), '@')));
  pattern text := '%' || public.like_escape(q) || '%';
  prefix_pattern text := public.like_escape(q) || '%';
begin
  if q = '' then
    return;
  end if;
  return query
  select v.*
  from (
    select
      p.id,
      p.username like prefix_pattern as prefix,
      extensions.word_similarity(q, p.search_text) as similarity,
      p.follower_count
    from public.profiles p
    where (p.search_text like pattern or q operator(extensions.<%) p.search_text)
      and not public.is_blocked_between(auth.uid(), p.id)
    order by 2 desc, 3 desc, 4 desc
    limit least(greatest(p_limit, 1), 50)
  ) h
  join public.profile_view v on v.id = h.id
  order by h.prefix desc, h.similarity desc, h.follower_count desc;
end;
$$;

-- Liderlik tablosu, profildeki sıra ve takip önerilerinde "en çok paylaşanlar"
create index profiles_ranking_idx on public.profiles (post_count, like_total);

/**
 * Takip önerileri (sıralama aynı: aynı okul, ortak takip, paylaşım, takipçi; gizlenen kişiler çıkmaz — gövde
 * 20261006110000_comment_social'daki ile aynı). Tüm profilleri sıralamak yerine aday kümesi: takip ettiklerinin
 * takip ettikleri, okul arkadaşları, en çok paylaşanlar.
 */
create or replace function public.suggested_users(p_limit integer default 30)
returns setof public.profile_view
language sql
stable
set search_path = ''
as $$
  with me as (select id, school_id from public.profiles where id = auth.uid()),
  mutual as (
    select theirs.followee_id as id, count(*) as n
    from (
      select followee_id from public.follows
      where follower_id = auth.uid()
      order by created_at desc
      limit 200
    ) mine
    cross join lateral (
      select f.followee_id from public.follows f where f.follower_id = mine.followee_id limit 200
    ) theirs
    group by theirs.followee_id
  ),
  candidates as (
    select id from mutual
    union
    (
      select p.id from public.profiles p, me
      where me.school_id is not null and p.school_id = me.school_id
      order by p.post_count desc
      limit 500
    )
    union
    (select p.id from public.profiles p order by p.post_count desc, p.like_total desc limit 500)
  )
  select v.*
  from candidates c
  join public.profile_view v on v.id = c.id
  left join mutual m on m.id = v.id
  cross join me
  where v.id <> me.id
    and not v.is_following
    and not exists (
      select 1 from public.suggestion_dismissals d where d.user_id = me.id and d.dismissed_id = v.id
    )
  order by
    (v.school_id is not null and v.school_id = me.school_id) desc,
    coalesce(m.n, 0) desc,
    v.post_count desc,
    v.follower_count desc
  limit least(greatest(p_limit, 1), 100)
$$;

/** Takip feed'i: her yazarın en yeni gönderileri indeksten, sonra birleştirilir */
create or replace function public.feed_following(p_before timestamptz default null, p_limit integer default 20)
returns setof public.post_view
language sql
stable
set search_path = ''
as $$
  with authors as (
    select auth.uid() as id
    union
    select followee_id from public.follows where follower_id = auth.uid()
  ),
  page as (
    select c.id, c.created_at
    from authors a
    cross join lateral (
      select p.id, p.created_at
      from public.posts p
      where p.user_id = a.id and p.created_at < coalesce(p_before, 'infinity'::timestamptz)
      order by p.created_at desc
      limit least(greatest(p_limit, 1), 50)
    ) c
    order by c.created_at desc
    limit least(greatest(p_limit, 1), 50)
  )
  select v.*
  from page
  join public.post_view v on v.id = page.id
  order by page.created_at desc
$$;

/** Bir kullanıcının ya da mekânın gönderileri; her iki durumda da ilgili indeksten okunur */
create or replace function public.list_posts(
  p_user_id uuid default null,
  p_place_id uuid default null,
  p_before timestamptz default null,
  p_limit integer default 30
)
returns setof public.post_view
language plpgsql
stable
set search_path = ''
as $$
declare
  lim int := least(greatest(p_limit, 1), 100);
  before timestamptz := coalesce(p_before, 'infinity'::timestamptz);
  ids uuid[];
begin
  if p_user_id is not null then
    ids := array(
      select p.id from public.posts p
      where p.user_id = p_user_id and p.created_at < before
        and (p_place_id is null or p.place_id = p_place_id)
      order by p.created_at desc
      limit lim
    );
  elsif p_place_id is not null then
    ids := array(
      select p.id from public.posts p
      where p.place_id = p_place_id and p.created_at < before
      order by p.created_at desc
      limit lim
    );
  else
    ids := array(
      select p.id from public.posts p
      where p.created_at < before
      order by p.created_at desc
      limit lim
    );
  end if;

  return query
  select v.*
  from unnest(ids) with ordinality as x (id, ord)
  join public.post_view v on v.id = x.id
  order by x.ord;
end;
$$;

-- Puanlanmış mekânlar (harita ve öneriler); puan örneklemesi için mekânın en yeni puanları
create index places_rated_coords_idx on public.places (latitude, longitude) where rating_count > 0;
create index places_rated_count_idx on public.places (rating_count desc) where rating_count > 0;
create index rankings_place_recent_idx on public.rankings (place_id, rated_at desc);
drop index if exists public.rankings_place_idx;

/**
 * Harita "Puanla" katmanı: görünen bölgede puanlanan, kapanmamış mekânlar ve topluluk puanı (Bayes,
 * `community_score`); en çok puanlananlar önce. Gövde 20261005100000_segment_rankings'teki ile aynı; adaylar
 * önce sayaçla ve indeksten seçilir, topluluk puanı yalnızca onlar için hesaplanır.
 */
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
    select r.place_id, public.community_score(sum(r.score), count(*)) as average, count(*)::int as rating_count
    from top
    join public.rankings r on r.place_id = top.id
    group by r.place_id
    order by count(*) desc, public.community_score(sum(r.score), count(*)) desc
    limit least(greatest(p_limit, 1), 300)
  )
  select v.id, v.name, v.cuisine, v.neighborhood, v.district, v.city, v.price_level, v.latitude, v.longitude,
    v.photo, rated.average, rated.rating_count
  from rated
  join public.place_view v on v.id = rated.place_id
  order by rated.rating_count desc, rated.average desc
$$;

/**
 * Henüz puanlamadığın, arkadaşlarının (takip ettiklerin) ya da topluluğun beğendiği mekânlar. Puanlama
 * 20261005100000_segment_rankings'teki ile birebir aynı: arkadaş puanı düz ortalama, topluluk puanı Bayes
 * (`community_score`), eşik 6,7, güven, mutfak bonusu, uzaklık cezası; engellilerin puanları ve kapanan mekânlar
 * sayılmaz. Değişen yalnızca adaylar: tüm puanları gruplamak yerine arkadaşlarının en beğendiği 200 mekân + en çok
 * puanlanan 100 (genel) + 150 (~15 km), puanlar yalnızca onlar için toplanır.
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
      public.community_score(agg.total, agg.n) as community_average,
      agg.n::int as community_count
    from candidates c
    left join friend_stats fs on fs.place_id = c.id
    cross join me
    cross join lateral (
      select sum(r.score) as total, count(*) as n
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

/** Konum seçici: ilçe başına mekân ve gönderi sayısı (gönderi sayısı sayaçtan) */
create or replace view public.area_view with (security_invoker = true) as
select
  pl.city,
  pl.district,
  avg(pl.latitude) as latitude,
  avg(pl.longitude) as longitude,
  count(*)::int as place_count,
  coalesce(sum(pl.post_count), 0)::int as post_count
from public.places pl
group by pl.city, pl.district;

/**
 * "Arkadaşın gittiğin yeri puanladı" (davranış aynı): alıcılar tek sorguda bulunur. Önceden puanlayanın her
 * takipçisi için ayrı sorgu çalışıyordu; çok takipçili biri puanlayınca işlem uzuyordu.
 */
create or replace function public.on_ranking_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient uuid;
begin
  if not exists (select 1 from public.rankings where user_id = new.user_id and place_id = new.place_id) then
    return null;
  end if;
  for recipient in
    select f.follower_id
    from public.follows f
    join public.rankings r on r.user_id = f.follower_id and r.place_id = new.place_id
    where f.followee_id = new.user_id
    union
    select i.inviter_id
    from public.invites i
    join public.rankings r on r.user_id = i.inviter_id and r.place_id = new.place_id
    where i.joined_user_id = new.user_id and i.place_id = new.place_id
  loop
    perform public.notify(recipient, new.user_id, 'friend_rated', null, null, new.place_id);
  end loop;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Eşzamanlı kayıt
-- ---------------------------------------------------------------------------

/**
 * Yeni hesap açılınca profili oluşturur (davranış aynı). Aynı anda aynı adla iki kişi kaydolunca ikisi de
 * kullanıcı adını boşta görüyordu; ikincinin kaydı "unique violation" ile tamamen düşüyordu. Artık çakışmada
 * kullanıcı adı yeniden üretilir (ilkinin kaydı bittiği için bir sonraki boş ad bulunur).
 */
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  display_name text := nullif(btrim(coalesce(meta ->> 'name', meta ->> 'full_name', '')), '');
  email_name text := split_part(coalesce(new.email, ''), '@', 1);
  -- Rakamlar alınır, baştaki 90 / 0 atılır: "0532 123 45 67" ve "+90 532…" aynı sonucu verir
  phone_digits text := regexp_replace(regexp_replace(coalesce(meta ->> 'phone', ''), '\D', '', 'g'), '^(90|0)', '');
  attempt int := 0;
  failed_constraint text;
begin
  loop
    begin
      insert into public.profiles (id, name, username)
      values (
        new.id,
        left(coalesce(display_name, nullif(email_name, ''), 'Puanla kullanıcısı'), 60),
        public.unique_username(coalesce(nullif(meta ->> 'username', ''), display_name, email_name, 'puanla'))
      );
      exit;
    exception when unique_violation then
      get stacked diagnostics failed_constraint = constraint_name;
      attempt := attempt + 1;
      if failed_constraint is distinct from 'profiles_username_key' or attempt >= 5 then
        raise;
      end if;
    end;
  end loop;

  insert into public.profile_private (user_id, phone)
  values (
    new.id,
    case when phone_digits ~ '^5[0-9]{9}$' then '+90' || phone_digits end
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Eksik indeksler
-- ---------------------------------------------------------------------------

-- Mekân kapak fotoğrafı (place_view): en çok beğenilen gönderi indeksten; her feed kartında hesaplanıyor
create index posts_place_popular_idx on public.posts (place_id, like_count desc, created_at desc);

-- Bildirimler: beğeni/etiket geri alma ve gönderi, yorum, mekân, hesap silmede (on delete cascade)
create index notifications_post_idx on public.notifications (post_id) where post_id is not null;
create index notifications_comment_idx on public.notifications (comment_id) where comment_id is not null;
create index notifications_place_idx on public.notifications (place_id) where place_id is not null;
create index notifications_actor_idx on public.notifications (actor_id);

-- Şikâyetler: günlük sınır ve silinen içeriğin şikâyetleri
create index reports_reporter_idx on public.reports (reporter_id, created_at);
create index reports_post_idx on public.reports (post_id) where post_id is not null;
create index reports_comment_idx on public.reports (comment_id) where comment_id is not null;
create index reports_user_idx on public.reports (user_id) where user_id is not null;
create index reports_list_idx on public.reports (list_id) where list_id is not null;

-- Davetler: gönderi silinince (on delete set null) ve mekân silinince
create index invites_post_idx on public.invites (post_id) where post_id is not null;
create index invites_place_idx on public.invites (place_id);

-- Listem: mekân silinince
create index saved_places_place_idx on public.saved_places (place_id);

-- ---------------------------------------------------------------------------
-- Yetkiler
-- ---------------------------------------------------------------------------

revoke execute on function
  public.handle_new_user(),
  public.on_ranking_count_change(),
  public.on_post_count_change(),
  public.on_like_change(),
  public.on_ranking_notify()
from public, anon, authenticated;

-- hot_rank üretilen sütunda gönderiyi ekleyen kullanıcının yetkisiyle çalışır
revoke execute on function
  public.hot_rank(integer, integer, timestamptz),
  public.like_escape(text),
  public.feed_popular(double precision, double precision, text, text, integer, integer, timestamptz),
  public.search_places(text, double precision, double precision, integer),
  public.search_users(text, integer),
  public.suggested_users(integer),
  public.feed_following(timestamptz, integer),
  public.list_posts(uuid, uuid, timestamptz, integer),
  public.map_places(double precision, double precision, double precision, double precision, integer),
  public.recommended_places(double precision, double precision, integer)
from public, anon;

grant execute on function
  public.hot_rank(integer, integer, timestamptz),
  public.like_escape(text),
  public.feed_popular(double precision, double precision, text, text, integer, integer, timestamptz),
  public.search_places(text, double precision, double precision, integer),
  public.search_users(text, integer),
  public.suggested_users(integer),
  public.feed_following(timestamptz, integer),
  public.list_posts(uuid, uuid, timestamptz, integer),
  public.map_places(double precision, double precision, double precision, double precision, integer),
  public.recommended_places(double precision, double precision, integer)
to authenticated;

revoke all on public.area_view from anon, authenticated;
grant select on public.area_view to authenticated;

analyze public.places, public.posts, public.profiles, public.rankings;
