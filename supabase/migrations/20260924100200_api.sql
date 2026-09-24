-- Puanla: uygulamanın kullandığı okuma görünümleri ve fonksiyonlar
-- Görünümler security_invoker ile çalışır; yani RLS kuralları çağıran kullanıcıya göre uygulanır.

-- ---------------------------------------------------------------------------
-- Görünümler
-- ---------------------------------------------------------------------------

/** Herkese açık profil alanları (iletişim bilgisi hariç) */
create or replace function public.profile_json(p public.profiles)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'username', p.username,
    'name', p.name,
    'avatar_path', p.avatar_path,
    'school_id', p.school_id
  )
$$;

/** Profil + sayaçlar + mevcut kullanıcıyla ilişkisi */
create view public.profile_view with (security_invoker = true) as
select
  p.id,
  p.username,
  p.name,
  p.avatar_path,
  p.school_id,
  p.follower_count,
  p.following_count,
  p.post_count,
  p.created_at,
  exists (
    select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p.id
  ) as is_following,
  exists (
    select 1 from public.follows f where f.follower_id = p.id and f.followee_id = auth.uid()
  ) as follows_me
from public.profiles p
where not public.is_blocked_between(auth.uid(), p.id);

/**
 * Mekân ve kapak fotoğrafı. Mekânın kendi fotoğrafı yoksa
 * en çok beğenilen gönderisinin ilk fotoğrafı kullanılır.
 */
create view public.place_view with (security_invoker = true) as
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
  coalesce(pl.photo_url, cover.path) as photo
from public.places pl
left join lateral (
  select ph.path
  from public.posts po
  join public.post_photos ph on ph.post_id = po.id and ph.position = 0
  where po.place_id = pl.id
  order by po.like_count desc, po.created_at desc
  limit 1
) cover on true;

/** Gönderi: fotoğraflar, etiketlenenler, yazar, mekân ve mevcut kullanıcının etkileşimi */
create view public.post_view with (security_invoker = true) as
select
  p.id,
  p.user_id,
  p.place_id,
  p.caption,
  p.score,
  p.price_per_person,
  p.meal,
  p.dishes,
  p.highlights,
  p.like_count,
  p.comment_count,
  p.created_at,
  coalesce(
    (select array_agg(ph.path order by ph.position) from public.post_photos ph where ph.post_id = p.id),
    '{}'
  ) as photos,
  coalesce(
    (
      select jsonb_agg(public.profile_json(u) order by u.name)
      from public.post_tags t
      join public.profiles u on u.id = t.user_id
      where t.post_id = p.id
    ),
    '[]'::jsonb
  ) as tagged,
  exists (
    select 1 from public.post_likes l where l.post_id = p.id and l.user_id = auth.uid()
  ) as liked_by_me,
  exists (
    select 1 from public.post_saves s where s.post_id = p.id and s.user_id = auth.uid()
  ) as saved_by_me,
  (select public.profile_json(u) from public.profiles u where u.id = p.user_id) as author,
  (select to_jsonb(v) from public.place_view v where v.id = p.place_id) as place
from public.posts p;

/** Sıralama satırı ve mekânı */
create view public.ranking_view with (security_invoker = true) as
select
  r.user_id,
  r.place_id,
  r.sentiment,
  r.position,
  r.score,
  r.note,
  r.rated_at,
  (select to_jsonb(v) from public.place_view v where v.id = r.place_id) as place
from public.rankings r;

/** Listem satırı ve mekânı */
create view public.saved_place_view with (security_invoker = true) as
select
  s.user_id,
  s.place_id,
  s.origin,
  s.link,
  s.note,
  s.saved_at,
  (select to_jsonb(v) from public.place_view v where v.id = s.place_id) as place
from public.saved_places s;

/** Yorum ve yazarı */
create view public.comment_view with (security_invoker = true) as
select
  c.id,
  c.post_id,
  c.user_id,
  c.body,
  c.created_at,
  (select public.profile_json(u) from public.profiles u where u.id = c.user_id) as author
from public.comments c;

/** Konum seçici için şehir ve ilçeler, mekânların ortalama konumuyla */
create view public.area_view with (security_invoker = true) as
select
  city,
  district,
  avg(latitude) as latitude,
  avg(longitude) as longitude,
  count(*)::int as place_count
from public.places
group by city, district;

-- ---------------------------------------------------------------------------
-- Sıralama
-- ---------------------------------------------------------------------------

/** Bir kullanıcının bir izlenim grubundaki puanlarını sıraya göre yeniden hesaplar */
create or replace function public.recompute_group_scores(p_user_id uuid, p_sentiment public.sentiment)
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
    where user_id = p_user_id and sentiment = p_sentiment
  ) g
  where r.user_id = p_user_id and r.sentiment = p_sentiment
$$;

/** Mekânı sıralamadan çıkarır ve grubun sırasını sıkıştırır (kilit çağıranda) */
create or replace function public.detach_ranking(p_user_id uuid, p_place_id uuid)
returns public.sentiment
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
  where user_id = p_user_id and sentiment = removed.sentiment and position > removed.position;

  return removed.sentiment;
end;
$$;

/**
 * Mekânı kullanıcının sıralamasına ekler (ya da yerini değiştirir).
 * `p_index`: grup içindeki yeni sıra, 0 = en iyi. Uygulamadaki `insertEntry` ile aynı davranır.
 * Puanlanan mekân Listem'den çıkar. Yeni puanı döner.
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
  previous public.sentiment;
  group_size int;
  target int;
  result numeric;
begin
  if uid is null then
    raise exception 'Giriş yapman gerekiyor' using errcode = '42501';
  end if;
  if not exists (select 1 from public.places where id = p_place_id) then
    raise exception 'Mekân bulunamadı' using errcode = 'P0002';
  end if;

  -- Aynı kullanıcının eşzamanlı istekleri sırayı bozmasın
  perform pg_advisory_xact_lock(hashtextextended('rankings:' || uid::text, 0));

  previous := public.detach_ranking(uid, p_place_id);

  select count(*) into group_size from public.rankings where user_id = uid and sentiment = p_sentiment;
  target := greatest(0, least(coalesce(p_index, group_size), group_size));

  update public.rankings
  set position = position + 1
  where user_id = uid and sentiment = p_sentiment and position >= target;

  insert into public.rankings (user_id, place_id, sentiment, position, score, note)
  values (uid, p_place_id, p_sentiment, target, 0, nullif(btrim(p_note), ''));

  perform public.recompute_group_scores(uid, p_sentiment);
  if previous is not null and previous <> p_sentiment then
    perform public.recompute_group_scores(uid, previous);
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
  previous public.sentiment;
begin
  if uid is null then
    raise exception 'Giriş yapman gerekiyor' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('rankings:' || uid::text, 0));
  previous := public.detach_ranking(uid, p_place_id);
  if previous is not null then
    perform public.recompute_group_scores(uid, previous);
  end if;
end;
$$;

/** Takip edilenlerin bu mekânlara verdiği puanların ortalaması */
create or replace function public.friend_scores(p_place_ids uuid[])
returns table (place_id uuid, average double precision, count integer)
language sql
stable
set search_path = ''
as $$
  select r.place_id, avg(r.score)::double precision, count(*)::int
  from public.rankings r
  join public.follows f on f.followee_id = r.user_id and f.follower_id = auth.uid()
  where r.place_id = any (p_place_ids)
  group by r.place_id
$$;

-- ---------------------------------------------------------------------------
-- Gönderiler ve feed
-- ---------------------------------------------------------------------------

/**
 * Gönderiyi fotoğrafları ve etiketleriyle tek işlemde oluşturur.
 * Fotoğraflar önce depolamaya "<kullanıcı>/<gönderi>/<sıra>.jpg" yoluna yüklenir;
 * bu yüzden gönderi kimliğini istemci üretir.
 * p_photos: [{ "path": "...", "width": 1440, "height": 1800 }]
 */
create or replace function public.create_post(
  p_id uuid,
  p_place_id uuid,
  p_caption text default null,
  p_price public.price_bucket default null,
  p_meal public.meal default null,
  p_dishes text[] default '{}',
  p_highlights text[] default '{}',
  p_tagged uuid[] default '{}',
  p_photos jsonb default '[]'
)
returns setof public.post_view
language plpgsql
set search_path = ''
as $$
begin
  if jsonb_array_length(coalesce(p_photos, '[]')) > 5 then
    raise exception 'En fazla 5 fotoğraf eklenebilir' using errcode = '22023';
  end if;
  if cardinality(p_tagged) > 20 then
    raise exception 'En fazla 20 kişi etiketlenebilir' using errcode = '22023';
  end if;

  insert into public.posts (id, place_id, caption, price_per_person, meal, dishes, highlights)
  values (
    p_id,
    p_place_id,
    nullif(btrim(p_caption), ''),
    p_price,
    p_meal,
    array(select btrim(d) from unnest(p_dishes) with ordinality u(d, ord) where btrim(d) <> '' order by ord),
    coalesce(p_highlights, '{}')
  );

  insert into public.post_photos (post_id, position, path, width, height)
  select p_id, (ord - 1)::smallint, photo ->> 'path', (photo ->> 'width')::int, (photo ->> 'height')::int
  from jsonb_array_elements(coalesce(p_photos, '[]')) with ordinality as t(photo, ord);

  insert into public.post_tags (post_id, user_id)
  select distinct p_id, tagged
  from unnest(p_tagged) as tagged
  where tagged <> auth.uid();

  return query select * from public.post_view where id = p_id;
end;
$$;

/** Popülerlik: etkileşim yaşa göre sönümlenir (uygulamadaki `hotScore` ile aynı) */
create or replace function public.hot_score(likes integer, comments integer, created_at timestamptz)
returns double precision
language sql
stable
set search_path = ''
as $$
  select (likes + comments * 2 + 1)
    / power(greatest(extract(epoch from now() - created_at) / 3600.0, 0) + 2, 1.3)
$$;

/**
 * Gönderi listeleri (en yeni başta, sayfalı):
 * bir kullanıcının, bir mekânın ya da kaydedilen gönderiler.
 */
create or replace function public.list_posts(
  p_user_id uuid default null,
  p_place_id uuid default null,
  p_saved boolean default false,
  p_before timestamptz default null,
  p_limit integer default 30
)
returns setof public.post_view
language sql
stable
set search_path = ''
as $$
  with page as (
    select p.id, p.created_at
    from public.posts p
    where (p_user_id is null or p.user_id = p_user_id)
      and (p_place_id is null or p.place_id = p_place_id)
      and (
        not p_saved
        or exists (select 1 from public.post_saves s where s.post_id = p.id and s.user_id = auth.uid())
      )
      and (p_before is null or p.created_at < p_before)
    order by p.created_at desc
    limit least(greatest(p_limit, 1), 100)
  )
  select v.*
  from page
  join public.post_view v on v.id = page.id
  order by page.created_at desc
$$;

/** Takip feed'i: takip edilenlerin ve kullanıcının kendi gönderileri */
create or replace function public.feed_following(p_before timestamptz default null, p_limit integer default 20)
returns setof public.post_view
language sql
stable
set search_path = ''
as $$
  with page as (
    select p.id, p.created_at
    from public.posts p
    where (
        p.user_id = auth.uid()
        or p.user_id in (select followee_id from public.follows where follower_id = auth.uid())
      )
      and (p_before is null or p.created_at < p_before)
    order by p.created_at desc
    limit least(greatest(p_limit, 1), 50)
  )
  select v.*
  from page
  join public.post_view v on v.id = page.id
  order by page.created_at desc
$$;

/**
 * Popüler feed.
 * - Şehir seçiliyse: o şehrin (ve ilçenin) gönderileri, popülerliğe göre.
 * - Konum verildiyse: 3 → 10 → 30 km içinde en az 5 gönderi bulunan ilk yarıçap;
 *   hiçbiri yetmezse en çok gönderiyi kapsayan en küçük yarıçap.
 *   Yakında hiç gönderi yoksa en yakın şehrin gönderileri (fallback_city).
 * Dönen: { radius_km, fallback_city, entries: [{ post, distance_km }] }
 */
create or replace function public.feed_popular(
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_city text default null,
  p_district text default null,
  p_offset integer default 0,
  p_limit integer default 20
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
begin
  if p_city is null and (p_latitude is null or p_longitude is null) then
    raise exception 'Konum ya da şehir gerekli' using errcode = '22023';
  end if;

  if p_city is not null then
    select coalesce(jsonb_agg(jsonb_build_object('post', to_jsonb(v), 'distance_km', null) order by x.hot desc), '[]')
    into entries
    from (
      select p.id, public.hot_score(p.like_count, p.comment_count, p.created_at) as hot
      from public.posts p
      join public.places pl on pl.id = p.place_id
      where pl.city = p_city and (p_district is null or pl.district = p_district)
      order by hot desc
      offset off limit lim
    ) x
    join public.post_view v on v.id = x.id;
    return jsonb_build_object('radius_km', null, 'fallback_city', null, 'entries', entries);
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
        public.hot_score(p.like_count, p.comment_count, p.created_at) as hot
      from public.posts p
      join public.places pl on pl.id = p.place_id
      where extensions.st_dwithin(pl.location, origin, radius * 1000)
      order by hot desc
      offset off limit lim
    ) x
    join public.post_view v on v.id = x.id;

    return jsonb_build_object('radius_km', radius, 'fallback_city', null, 'entries', entries);
  end if;

  -- Yakında gönderi yok: gönderisi olan en yakın mekânın şehri
  select pl.city into fallback
  from public.places pl
  where exists (select 1 from public.posts p where p.place_id = pl.id)
  order by pl.location operator(extensions.<->) origin
  limit 1;

  if fallback is null then
    return jsonb_build_object('radius_km', null, 'fallback_city', null, 'entries', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('post', to_jsonb(v), 'distance_km', null) order by x.hot desc), '[]')
  into entries
  from (
    select p.id, public.hot_score(p.like_count, p.comment_count, p.created_at) as hot
    from public.posts p
    join public.places pl on pl.id = p.place_id
    where pl.city = fallback
    order by hot desc
    offset off limit lim
  ) x
  join public.post_view v on v.id = x.id;

  return jsonb_build_object('radius_km', null, 'fallback_city', fallback, 'entries', entries);
end;
$$;

-- ---------------------------------------------------------------------------
-- Mekân sayfası
-- ---------------------------------------------------------------------------

/**
 * Mekân sayfası için tek çağrıda: mekân, genel puan, "Puanla kullanıcılarına göre" özeti
 * (en sık kişi başı aralığı, öne çıkanlar, en çok yenilenler) ve takip edilenlerin puanları.
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
      select jsonb_build_object('average', avg(score)::double precision, 'count', count(*))
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

-- ---------------------------------------------------------------------------
-- Arama ve öneriler
-- ---------------------------------------------------------------------------

/**
 * Mekân arama: isim başı eşleşmeler önce, sonra benzerlik, sonra yakınlık.
 * Boş aramada konum varsa en yakın mekânlar döner.
 */
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
      case when q.origin is not null then pl.location operator(extensions.<->) q.origin end as distance
    from public.places pl, q
    where q.text = ''
       or pl.search_text like '%' || q.text || '%'
       or q.text operator(extensions.<%) pl.search_text
    order by prefix desc, similarity desc, distance asc nulls last, pl.name
    limit least(greatest(p_limit, 1), 50)
  )
  select v.*
  from hits
  join public.place_view v on v.id = hits.id
  order by hits.prefix desc, hits.similarity desc, hits.distance asc nulls last, v.name
$$;

create or replace function public.search_users(p_query text, p_limit integer default 30)
returns setof public.profile_view
language sql
stable
set search_path = ''
as $$
  with q as (select public.tr_fold(btrim(ltrim(coalesce(p_query, ''), '@'))) as text)
  select v.*
  from public.profile_view v
  join public.profiles p on p.id = v.id, q
  where q.text <> ''
    and (p.search_text like '%' || q.text || '%' or q.text operator(extensions.<%) p.search_text)
  order by
    (p.username like q.text || '%') desc,
    extensions.word_similarity(q.text, p.search_text) desc,
    p.follower_count desc
  limit least(greatest(p_limit, 1), 50)
$$;

/**
 * Takip önerileri: aynı okuldakiler, takip ettiklerinin takip ettikleri,
 * sonra en çok değerlendirme paylaşanlar.
 */
create or replace function public.suggested_users(p_limit integer default 30)
returns setof public.profile_view
language sql
stable
set search_path = ''
as $$
  with me as (select school_id from public.profiles where id = auth.uid()),
  mutual as (
    select f2.followee_id as id, count(*) as n
    from public.follows f1
    join public.follows f2 on f2.follower_id = f1.followee_id
    where f1.follower_id = auth.uid()
    group by f2.followee_id
  )
  select v.*
  from public.profile_view v
  left join mutual m on m.id = v.id
  cross join me
  where v.id <> auth.uid()
    and not v.is_following
  order by
    (v.school_id is not null and v.school_id = me.school_id) desc,
    coalesce(m.n, 0) desc,
    v.post_count desc,
    v.follower_count desc
  limit least(greatest(p_limit, 1), 100)
$$;

create or replace function public.followers_of(p_user_id uuid, p_offset integer default 0, p_limit integer default 50)
returns setof public.profile_view
language sql
stable
set search_path = ''
as $$
  select v.*
  from public.follows f
  join public.profile_view v on v.id = f.follower_id
  where f.followee_id = p_user_id
  order by f.created_at desc
  offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 100)
$$;

create or replace function public.following_of(p_user_id uuid, p_offset integer default 0, p_limit integer default 50)
returns setof public.profile_view
language sql
stable
set search_path = ''
as $$
  select v.*
  from public.follows f
  join public.profile_view v on v.id = f.followee_id
  where f.follower_id = p_user_id
  order by f.created_at desc
  offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 100)
$$;

-- ---------------------------------------------------------------------------
-- Liderlik tablosu
-- ---------------------------------------------------------------------------

/**
 * En çok değerlendirme (gönderi) paylaşanlar; eşitlikte daha çok beğeni alan önde.
 * p_scope: 'all' | 'friends' | 'school'; p_period: 'all' | 'month'.
 * İlk p_limit sıra ve (dışarıda kalsa bile) mevcut kullanıcının satırı döner.
 * Genel tabloda değerlendirmesi olmayanlar listelenmez; arkadaş ve okul tablolarında listelenir.
 */
create or replace function public.leaderboard(
  p_scope text default 'all',
  p_period text default 'all',
  p_school_id text default null,
  p_limit integer default 100
)
returns table (user_id uuid, reviews integer, likes integer, rank integer, profile jsonb)
language sql
stable
set search_path = ''
as $$
  with since as (
    select case when p_period = 'month' then date_trunc('month', now()) end as ts
  ),
  stats as (
    select p.user_id, count(*)::int as reviews, sum(p.like_count)::int as likes
    from public.posts p, since
    where since.ts is null or p.created_at >= since.ts
    group by p.user_id
  ),
  members as (
    select id from public.profiles
    where case p_scope
      when 'friends' then id = auth.uid()
        or id in (select followee_id from public.follows where follower_id = auth.uid())
      when 'school' then p_school_id is not null and school_id = p_school_id
      else id = auth.uid() or id in (select stats.user_id from stats)
    end
  ),
  ranked as (
    select
      m.id as user_id,
      coalesce(s.reviews, 0) as reviews,
      coalesce(s.likes, 0) as likes,
      rank() over (order by coalesce(s.reviews, 0) desc, coalesce(s.likes, 0) desc)::int as rank
    from members m
    left join stats s on s.user_id = m.id
    where not public.is_blocked_between(auth.uid(), m.id)
  )
  select r.user_id, r.reviews, r.likes, r.rank, public.profile_json(p)
  from ranked r
  join public.profiles p on p.id = r.user_id
  where r.rank <= least(greatest(p_limit, 1), 500) or r.user_id = auth.uid()
  order by r.rank, p.name
$$;

/** Kullanıcının genel (tüm zamanlar) sıralamadaki yeri; hiç değerlendirmesi yoksa null */
create or replace function public.user_rank(p_user_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  with stats as (
    select user_id, count(*) as reviews, sum(like_count) as likes
    from public.posts
    group by user_id
  )
  select (
    1 + (
      select count(*) from stats s
      where (s.reviews, s.likes) > (me.reviews, me.likes)
    )
  )::int
  from stats me
  where me.user_id = p_user_id
$$;

-- ---------------------------------------------------------------------------
-- Hesap
-- ---------------------------------------------------------------------------

/** Kayıttan önce kullanıcı adının boşta olup olmadığı (giriş gerektirmez) */
create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_username ~ '^[a-z0-9._]{3,24}$'
    and not exists (select 1 from public.profiles where username = p_username)
$$;

/**
 * Hesabı ve tüm verisini kalıcı olarak siler (App Store kuralı gereği uygulama içinden).
 * Depolamadaki dosyalar istemci tarafından önce silinir.
 */
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Giriş yapman gerekiyor' using errcode = '42501';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Yetkiler
-- Supabase yeni nesnelere varsayılan olarak anon'a da yetki verir; burada kapatıyoruz.
-- ---------------------------------------------------------------------------

revoke all on
  public.profile_view,
  public.place_view,
  public.post_view,
  public.ranking_view,
  public.saved_place_view,
  public.comment_view,
  public.area_view
from anon, authenticated;

grant select on
  public.profile_view,
  public.place_view,
  public.post_view,
  public.ranking_view,
  public.saved_place_view,
  public.comment_view,
  public.area_view
to authenticated;

revoke execute on all functions in schema public from public, anon;

grant execute on all functions in schema public to authenticated;
-- İç yardımcılar doğrudan çağrılmasın
revoke execute on function
  public.recompute_group_scores(uuid, public.sentiment),
  public.detach_ranking(uuid, uuid),
  public.handle_new_user(),
  public.unique_username(text)
from authenticated;

grant execute on function public.username_available(text) to anon;
