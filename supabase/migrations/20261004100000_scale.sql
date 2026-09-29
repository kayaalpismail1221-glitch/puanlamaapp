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

drop function public.feed_popular(double precision, double precision, text, text, integer, integer, timestamptz);
drop function public.hot_score(integer, integer, timestamptz);
drop function public.hot_score_at(integer, integer, timestamptz, timestamptz);

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
create index places_popularity_idx on public.places ((rating_count + post_count) desc, name);

/**
 * Mekân arama (sözleşme aynı): isim başı eşleşmeler önce, sonra benzerlik, yakınlık, popülerlik.
 * Boş aramada konum varsa en yakınlar, yoksa en popülerler. Metin eşleşmesi trigram indeksinden gelir:
 * planlayıcı benzerlik eşleşmesinin seçiciliğini bilemediği için bazen tüm mekânlarda benzerlik hesaplıyordu
 * (ölçümde 130 ms); fonksiyon içinde sıralı tarama kapalı.
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
set enable_seqscan = off
as $$
declare
  q text := public.tr_fold(btrim(coalesce(p_query, '')));
  pattern text := '%' || public.like_escape(q) || '%';
  prefix_pattern text := public.like_escape(q) || '%';
  origin extensions.geography := case
    when p_latitude is not null and p_longitude is not null
    then extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography
  end;
  lim int := least(greatest(p_limit, 1), 50);
begin
  if q = '' and origin is null then
    return query
    select v.*
    from (
      select pl.id, pl.rating_count + pl.post_count as popularity, pl.name
      from public.places pl
      order by pl.rating_count + pl.post_count desc, pl.name
      limit lim
    ) h
    join public.place_view v on v.id = h.id
    order by h.popularity desc, h.name;
  elsif q = '' then
    return query
    select v.*
    from (
      select pl.id, pl.location operator(extensions.<->) origin as distance, pl.rating_count + pl.post_count as popularity, pl.name
      from public.places pl
      order by pl.location operator(extensions.<->) origin
      limit lim
    ) h
    join public.place_view v on v.id = h.id
    order by h.distance, h.popularity desc, h.name;
  else
    return query
    select v.*
    from (
      select
        pl.id,
        extensions.word_similarity(q, pl.search_text) as similarity,
        public.tr_fold(pl.name) like prefix_pattern as prefix,
        case when origin is not null then pl.location operator(extensions.<->) origin end as distance,
        pl.rating_count + pl.post_count as popularity,
        pl.name
      from public.places pl
      where pl.search_text like pattern or q operator(extensions.<%) pl.search_text
      order by 3 desc, 2 desc, 4 asc nulls last, 5 desc, pl.name
      limit lim
    ) h
    join public.place_view v on v.id = h.id
    order by h.prefix desc, h.similarity desc, h.distance asc nulls last, h.popularity desc, h.name;
  end if;
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
 * Takip önerileri (sıralama aynı: aynı okul, ortak takip, paylaşım, takipçi).
 * Tüm profilleri sıralamak yerine aday kümesi: takip ettiklerinin takip ettikleri, okul arkadaşları,
 * en çok paylaşanlar.
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

/**
 * Liderlik tablosu (sözleşme aynı). Genel/tüm zamanlar sayaçlardan ve indeksten; bu ay tek gruplamayla;
 * arkadaş/okul yalnızca üyeler için. Yalnızca sayı ve herkese açık profil döndüğü için tanımlayıcı yetkisiyle
 * çalışır (gönderi satırı başına engel kuralı işletilmez); engelli kişiler her dalda açıkça çıkarılır.
 */
create or replace function public.leaderboard(
  p_scope text default 'all',
  p_period text default 'all',
  p_school_id text default null,
  p_limit integer default 100
)
returns table (user_id uuid, reviews integer, likes integer, rank integer, profile jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  lim int := least(greatest(p_limit, 1), 500);
  since timestamptz := case when p_period = 'month' then date_trunc('month', now()) end;
  members uuid[];
begin
  if p_scope not in ('friends', 'school') and since is null then
    return query
    with top as (
      select p.id, p.post_count as reviews, p.like_total as likes
      from public.profiles p
      where p.post_count > 0 and not public.is_blocked_between(me, p.id)
      order by p.post_count desc, p.like_total desc
      limit lim
    ),
    ranked as (
      select t.id, t.reviews, t.likes, (rank() over (order by t.reviews desc, t.likes desc))::int as rank
      from top t
    ),
    -- İlk sıralarda değilse kullanıcının kendi satırı: önündekiler (engelliler hariç) + 1
    mine as (
      select
        p.id,
        p.post_count as reviews,
        p.like_total as likes,
        (
          1
          + (select count(*) from public.profiles o where (o.post_count, o.like_total) > (p.post_count, p.like_total))
          - (
            select count(*)
            from public.blocks b
            join public.profiles o on o.id = case when b.blocker_id = me then b.blocked_id else b.blocker_id end
            where (b.blocker_id = me or b.blocked_id = me)
              and (o.post_count, o.like_total) > (p.post_count, p.like_total)
          )
        )::int as rank
      from public.profiles p
      where p.id = me and not exists (select 1 from ranked r where r.id = me)
    )
    select r.id, r.reviews, r.likes, r.rank, public.profile_json(pr)
    from (select * from ranked union all select * from mine) r
    join public.profiles pr on pr.id = r.id
    order by r.rank, pr.name;
    return;
  end if;

  if p_scope not in ('friends', 'school') then
    -- Genel, bu ay: bu ayın gönderileri tek seferde gruplanır
    return query
    with stats as (
      select x.user_id as id, count(*)::int as reviews, sum(x.like_count)::int as likes
      from public.posts x
      where x.created_at >= since
      group by x.user_id
    ),
    blocked as (
      select case when b.blocker_id = me then b.blocked_id else b.blocker_id end as id
      from public.blocks b
      where b.blocker_id = me or b.blocked_id = me
    ),
    ranked as (
      select s.id, s.reviews, s.likes, (rank() over (order by s.reviews desc, s.likes desc))::int as rank
      from (
        select * from stats
        union all
        select me, 0, 0 where me is not null and not exists (select 1 from stats where stats.id = me)
      ) s
      where not exists (select 1 from blocked b where b.id = s.id)
    )
    select r.id, r.reviews, r.likes, r.rank, public.profile_json(pr)
    from ranked r
    join public.profiles pr on pr.id = r.id
    where r.rank <= lim or r.id = me
    order by r.rank, pr.name;
    return;
  end if;

  -- Arkadaşlar ve okul: yalnızca üyeler için
  if p_scope = 'friends' then
    members := array(select me union select f.followee_id from public.follows f where f.follower_id = me);
  else
    members := array(select p.id from public.profiles p where p_school_id is not null and p.school_id = p_school_id);
  end if;

  return query
  with stats as (
    select
      p.id,
      case when since is null then p.post_count else coalesce(s.reviews, 0) end as reviews,
      case when since is null then p.like_total else coalesce(s.likes, 0) end as likes
    from unnest(members) as m (id)
    join public.profiles p on p.id = m.id
    left join lateral (
      select count(*)::int as reviews, sum(x.like_count)::int as likes
      from public.posts x
      where since is not null and x.user_id = m.id and x.created_at >= since
    ) s on true
    where not public.is_blocked_between(me, p.id)
  ),
  ranked as (
    select s.id, s.reviews, s.likes, (rank() over (order by s.reviews desc, s.likes desc))::int as rank
    from stats s
  )
  select r.id, r.reviews, r.likes, r.rank, public.profile_json(pr)
  from ranked r
  join public.profiles pr on pr.id = r.id
  where r.rank <= lim or r.id = me
  order by r.rank, pr.name;
end;
$$;

/** Kullanıcının genel (tüm zamanlar) sıralamadaki yeri; hiç değerlendirmesi yoksa null */
create or replace function public.user_rank(p_user_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select (1 + (select count(*) from public.profiles o where (o.post_count, o.like_total) > (p.post_count, p.like_total)))::int
  from public.profiles p
  where p.id = p_user_id and p.post_count > 0
$$;

-- Puanlanmış mekânlar (harita ve öneriler); puan örneklemesi için mekânın en yeni puanları
create index places_rated_coords_idx on public.places (latitude, longitude) where rating_count > 0;
create index places_rated_count_idx on public.places (rating_count desc) where rating_count > 0;
create index rankings_place_recent_idx on public.rankings (place_id, rated_at desc);
drop index public.rankings_place_idx;

/**
 * Harita "Puanla" katmanı (sözleşme aynı): görünen bölgede en çok puanlanan mekânlar ve topluluk ortalaması.
 * Önce sayaçla adaylar seçilir, ortalama yalnızca onlar için hesaplanır.
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
      and pl.latitude between p_south and p_north
      and pl.longitude between p_west and p_east
    order by pl.rating_count desc
    limit least(greatest(p_limit, 1), 300) * 2
  ),
  rated as materialized (
    select r.place_id, avg(r.score)::double precision as average, count(*)::int as rating_count
    from top
    join public.rankings r on r.place_id = top.id
    group by r.place_id
    order by count(*) desc, avg(r.score) desc
    limit least(greatest(p_limit, 1), 300)
  )
  select v.*, rated.average, rated.rating_count
  from rated
  join public.place_view v on v.id = rated.place_id
  order by rated.rating_count desc, rated.average desc
$$;

/**
 * Kişisel öneriler (sözleşme ve puanlama aynı). Adaylar: takip ettiklerinin en beğendiği mekânlar ile
 * en çok puanlanan mekânlar (genel ve ~15 km içinde). Topluluk ortalaması mekânın en yeni 100 puanından
 * (engellediğin/engelleyen kişilerinki hariç); sayısı sayaçtan. Arkadaş ortalaması tam.
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
  blocked as (
    select case when b.blocker_id = me.id then b.blocked_id else b.blocker_id end as id
    from public.blocks b, me
    where b.blocker_id = me.id or b.blocked_id = me.id
  ),
  -- Arkadaş puanı olan mekânda eşik arkadaş ortalamasına bakar; eşiği geçmeyenler aday olamaz
  friend_stats as (
    select r.place_id, avg(r.score)::double precision as friend_average, count(*)::int as friend_count
    from public.follows f
    join me on f.follower_id = me.id
    join public.rankings r on r.user_id = f.followee_id
    where not exists (select 1 from blocked b where b.id = f.followee_id)
    group by r.place_id
    having avg(r.score) >= 6.7
    order by avg(r.score) desc, count(*) desc
    limit 200
  ),
  candidates as (
    select place_id as id from friend_stats
    union
    (select pl.id from public.places pl where pl.rating_count > 0 order by pl.rating_count desc limit 100)
    union
    -- Yakındakiler: ~15 km'lik kutu (kesin uzaklık puanlamada)
    (
      select pl.id from public.places pl
      where p_latitude is not null and p_longitude is not null and pl.rating_count > 0
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
      sample.average as community_average,
      (
        pl.rating_count
        - (select count(*) from blocked b join public.rankings br on br.user_id = b.id and br.place_id = c.id)
      )::int as community_count
    from candidates c
    join public.places pl on pl.id = c.id
    left join friend_stats fs on fs.place_id = c.id
    cross join me
    cross join lateral (
      select avg(recent.score)::double precision as average
      from (
        select r.score
        from public.rankings r
        where r.place_id = c.id
          and r.user_id <> me.id
          and not exists (select 1 from blocked b where b.id = r.user_id)
        order by r.rated_at desc
        limit 100
      ) recent
    ) sample
    where sample.average is not null
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
  public.leaderboard(text, text, text, integer),
  public.user_rank(uuid),
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
  public.leaderboard(text, text, text, integer),
  public.user_rank(uuid),
  public.map_places(double precision, double precision, double precision, double precision, integer),
  public.recommended_places(double precision, double precision, integer)
to authenticated;

revoke all on public.area_view from anon, authenticated;
grant select on public.area_view to authenticated;

analyze public.places, public.posts, public.profiles, public.rankings;
