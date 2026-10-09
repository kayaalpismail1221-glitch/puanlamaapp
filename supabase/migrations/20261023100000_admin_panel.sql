-- Web yönetim paneli (expeat.app/admin, kullanıcı isteği 2026-10-09: giriş ekranı olmasın).
--
-- Giriş yerine gizli anahtar: panel bağlantısı `expeat.app/admin#k=<anahtar>` bir kez açılınca anahtar o tarayıcıda
-- saklanır. Veritabanında yalnızca anahtarın SHA-256 özeti durur (`admin_panel_keys`). Panelin tek giriş noktası
-- `admin_panel(anahtar, işlem, argümanlar)`; anahtar doğruysa işlem süresince `is_admin()` doğru döner, böylece
-- mevcut yönetici fonksiyonları (şikâyet kuyruğu, mekân düzeltmeleri, büyüme ölçümü) aynen kullanılır.
-- Service role anahtarı web'e hiç çıkmaz.
--
-- Yeni anahtar (eskisi sızarsa): yeni bir anahtar üret, özetini ekle, eskisini sil:
--   insert into public.admin_panel_keys (key_hash, label) values (sha256(convert_to('<yeni>', 'UTF8')), 'açıklama');
--   delete from public.admin_panel_keys where label = '<eski>';
--
-- Doğrulanmış mekân satışı: `place_verifications` satış kaydı (paket, fiyat, tarih, iletişim); mekânın rozeti
-- `places.verified_until` (iptal edilmemiş satışların en geç bitişi, İstanbul gün sonu).
-- Panelin her değiştirici işlemi `admin_audit`'e yazılır.

-- ---------------------------------------------------------------------------
-- 1) Anahtar ve yetki
-- ---------------------------------------------------------------------------

create table public.admin_panel_keys (
  key_hash bytea primary key check (octet_length(key_hash) = 32),
  label text not null check (char_length(label) between 1 and 80),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.admin_panel_keys enable row level security;
revoke all on public.admin_panel_keys from public, anon, authenticated;

insert into public.admin_panel_keys (key_hash, label)
values ('\xa138ac456cf8d059c2811ee7ecab7915879bcb716268a099a4007aee1b120989', 'İlk panel anahtarı (2026-10-09)');

/** Anahtarı doğrular; doğruysa bu işlem (transaction) boyunca is_admin() doğru döner */
create or replace function public.admin_panel_auth(p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  h bytea;
begin
  if p_key is null or char_length(p_key) not between 32 and 200 then
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;
  h := sha256(convert_to(p_key, 'UTF8'));
  update public.admin_panel_keys set last_used_at = now() where key_hash = h;
  if not found then
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;
  perform set_config('expeat.admin_panel', encode(h, 'hex'), true);
end;
$$;

/**
 * Uygulamadaki yönetici hesabı ya da bu işlemde doğrulanmış panel anahtarı.
 * Ayarın değeri anahtarın özeti olduğundan dışarıdan tahmin edilip yazılamaz.
 */
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false)
    or exists (
      select 1 from public.admin_panel_keys k
      where encode(k.key_hash, 'hex') = coalesce(current_setting('expeat.admin_panel', true), '')
    )
$$;

create table public.admin_audit (
  id bigint generated always as identity primary key,
  action text not null,
  args jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index admin_audit_created_idx on public.admin_audit (created_at desc);
alter table public.admin_audit enable row level security;
revoke all on public.admin_audit from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Doğrulanmış mekân satışları
-- ---------------------------------------------------------------------------

alter table public.places add column verified_until timestamptz;

create table public.place_verifications (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  plan text not null check (plan in ('monthly', 'quarterly', 'yearly', 'custom')),
  price numeric(12, 2) not null check (price >= 0),
  currency text not null default 'TRY' check (currency in ('TRY', 'USD', 'EUR')),
  starts_on date not null,
  ends_on date not null,
  contact_name text check (char_length(contact_name) <= 120),
  contact_phone text check (char_length(contact_phone) <= 40),
  contact_email text check (char_length(contact_email) <= 160),
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  check (ends_on >= starts_on)
);

create index place_verifications_place_idx on public.place_verifications (place_id);
create index place_verifications_created_idx on public.place_verifications (created_at desc);
alter table public.place_verifications enable row level security;
revoke all on public.place_verifications from public, anon, authenticated;

/** Rozet süresi: iptal edilmemiş satışların en geç bitiş gününün sonu (İstanbul) */
create or replace function public.refresh_place_verified()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := coalesce(new.place_id, old.place_id);
begin
  update public.places p
  set verified_until = (
    select ((max(v.ends_on) + 1)::timestamp at time zone 'Europe/Istanbul')
    from public.place_verifications v
    where v.place_id = pid and v.cancelled_at is null
  )
  where p.id = pid;
  if tg_op = 'UPDATE' and old.place_id <> new.place_id then
    update public.places p
    set verified_until = (
      select ((max(v.ends_on) + 1)::timestamp at time zone 'Europe/Istanbul')
      from public.place_verifications v
      where v.place_id = old.place_id and v.cancelled_at is null
    )
    where p.id = old.place_id;
  end if;
  return null;
end;
$$;

create trigger place_verifications_refresh after insert or update or delete on public.place_verifications
  for each row execute function public.refresh_place_verified();

-- ---------------------------------------------------------------------------
-- 3) Panel işlemleri (yalnızca admin_panel üzerinden çağrılır)
-- ---------------------------------------------------------------------------

/** Pano: sayılar, son 30 günün günlük kayıt/gönderi/puanı, öne çıkan iller, son kullanıcılar */
create or replace function public.admin_overview()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with days as (
    select d::date as day
    from generate_series(
      (now() at time zone 'Europe/Istanbul')::date - 29,
      (now() at time zone 'Europe/Istanbul')::date,
      interval '1 day'
    ) d
  ),
  since as (select ((now() at time zone 'Europe/Istanbul')::date - 29)::timestamp at time zone 'Europe/Istanbul' as t)
  select jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'users_today', (select count(*) from public.profiles
                    where created_at >= (now() at time zone 'Europe/Istanbul')::date::timestamp at time zone 'Europe/Istanbul'),
    'users_7d', (select count(*) from public.profiles where created_at >= now() - interval '7 days'),
    'users_30d', (select count(*) from public.profiles where created_at >= now() - interval '30 days'),
    'active_7d', (select count(*) from (
                    select user_id from public.rankings where rated_at >= now() - interval '7 days'
                    union select user_id from public.posts where created_at >= now() - interval '7 days'
                  ) a),
    'banned', (select count(*) from auth.users where banned_until > now()),
    'posts', (select count(*) from public.posts),
    'posts_7d', (select count(*) from public.posts where created_at >= now() - interval '7 days'),
    'rankings', (select count(*) from public.rankings),
    'rankings_7d', (select count(*) from public.rankings where rated_at >= now() - interval '7 days'),
    'comments', (select count(*) from public.comments),
    'lists', (select count(*) from public.lists),
    'places', (select count(*) from public.places),
    'places_user', (select count(*) from public.places where created_by is not null),
    'places_closed', (select count(*) from public.places where closed_at is not null),
    'verified_active', (select count(*) from public.places where verified_until > now()),
    'pending_reports', (select count(distinct coalesce(post_id, comment_id, list_id, user_id))
                        from public.reports where resolved_at is null),
    'pending_corrections', (select count(*) from public.place_corrections where status = 'pending'),
    'revenue_month', coalesce((
      select jsonb_object_agg(currency, total) from (
        select currency, sum(price) as total from public.place_verifications
        where cancelled_at is null
          and created_at >= date_trunc('month', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul'
        group by currency
      ) r), '{}'),
    'daily', (
      select jsonb_agg(jsonb_build_object(
        'day', d.day,
        'users', coalesce(u.n, 0),
        'posts', coalesce(p.n, 0),
        'rankings', coalesce(r.n, 0)
      ) order by d.day)
      from days d
      left join (
        select (created_at at time zone 'Europe/Istanbul')::date as day, count(*) as n
        from public.profiles, since where created_at >= since.t group by 1
      ) u on u.day = d.day
      left join (
        select (created_at at time zone 'Europe/Istanbul')::date as day, count(*) as n
        from public.posts, since where created_at >= since.t group by 1
      ) p on p.day = d.day
      left join (
        select (rated_at at time zone 'Europe/Istanbul')::date as day, count(*) as n
        from public.rankings, since where rated_at >= since.t group by 1
      ) r on r.day = d.day
    ),
    'cities', (
      select coalesce(jsonb_agg(c order by c.posts desc, c.places desc), '[]') from (
        select city, count(*) as places, sum(post_count) as posts, sum(rating_count) as ratings
        from public.places group by city
      ) c
    ),
    'latest_users', (
      select coalesce(jsonb_agg(u order by u.created_at desc), '[]') from (
        select id, username, name, avatar_path, created_at from public.profiles order by created_at desc limit 6
      ) u
    ),
    'cuisines', (select coalesce(jsonb_agg(name order by position), '[]') from public.cuisines)
  )
$$;

/** Kullanıcı listesi: arama (ad, kullanıcı adı, e-posta), süzgeç, sıralama, sayfalama */
create or replace function public.admin_users(p_args jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q text := nullif(btrim(p_args ->> 'q'), '');
  f text := coalesce(p_args ->> 'filter', 'all');
  s text := coalesce(p_args ->> 'sort', 'new');
  lim int := least(greatest(coalesce((p_args ->> 'limit')::int, 50), 1), 200);
  off int := greatest(coalesce((p_args ->> 'offset')::int, 0), 0);
  result jsonb;
begin
  with base as materialized (
    select p.*, u.email, u.last_sign_in_at, coalesce(u.banned_until > now(), false) as banned
    from public.profiles p
    left join auth.users u on u.id = p.id
    where (q is null
           or p.search_text like '%' || public.tr_fold(q) || '%'
           or u.email ilike '%' || q || '%')
      and (f = 'all'
           or (f = 'banned' and u.banned_until > now())
           or (f = 'admin' and p.is_admin)
           or (f = 'reported' and exists (
                 select 1 from public.reports r
                 left join public.posts po on po.id = r.post_id
                 left join public.comments co on co.id = r.comment_id
                 left join public.lists li on li.id = r.list_id
                 where r.resolved_at is null and coalesce(r.user_id, po.user_id, co.user_id, li.user_id) = p.id)))
  ),
  page as materialized (
    select b.*, row_number() over (
      order by
        case when s = 'posts' then b.post_count end desc nulls last,
        case when s = 'followers' then b.follower_count end desc nulls last,
        case when s = 'active' then b.last_sign_in_at end desc nulls last,
        b.created_at desc
    ) as rn
    from base b
    order by rn
    limit lim offset off
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'id', pg.id,
      'username', pg.username,
      'name', pg.name,
      'avatar_path', pg.avatar_path,
      'email', pg.email,
      'created_at', pg.created_at,
      'last_sign_in_at', pg.last_sign_in_at,
      'banned', pg.banned,
      'is_admin', pg.is_admin,
      'post_count', pg.post_count,
      'follower_count', pg.follower_count,
      'following_count', pg.following_count,
      'rating_count', (select count(*) from public.rankings r where r.user_id = pg.id)
    ) order by pg.rn), '[]')
  ) into result
  from page pg;
  return result;
end;
$$;

/** Tek kullanıcı: profil, iletişim, sayılar, son gönderiler ve puanlar, açık şikâyetler */
create or replace function public.admin_user(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'profile', to_jsonb(p) - 'search_text',
    'email', u.email,
    'last_sign_in_at', u.last_sign_in_at,
    'banned', coalesce(u.banned_until > now(), false),
    'phone', pp.phone,
    'invited_by', (select i.username from public.profiles i where i.id = pp.invited_by),
    'rating_count', (select count(*) from public.rankings r where r.user_id = p.id),
    'comment_count', (select count(*) from public.comments c where c.user_id = p.id),
    'list_count', (select count(*) from public.lists l where l.user_id = p.id),
    'places_added', (select count(*) from public.places pl where pl.created_by = p.id),
    'corrections', (select count(*) from public.place_corrections pc where pc.user_id = p.id),
    'open_reports', (
      select count(*) from public.reports r
      left join public.posts po on po.id = r.post_id
      left join public.comments co on co.id = r.comment_id
      left join public.lists li on li.id = r.list_id
      where r.resolved_at is null and coalesce(r.user_id, po.user_id, co.user_id, li.user_id) = p.id
    ),
    'posts', (
      select coalesce(jsonb_agg(x order by x.created_at desc), '[]') from (
        select po.id, po.caption, po.score, po.like_count, po.comment_count, po.created_at,
          pl.name as place_name,
          (select ph.path from public.post_photos ph where ph.post_id = po.id order by ph.position limit 1) as photo
        from public.posts po join public.places pl on pl.id = po.place_id
        where po.user_id = p.id order by po.created_at desc limit 12
      ) x
    ),
    'rankings', (
      select coalesce(jsonb_agg(x order by x.rated_at desc), '[]') from (
        select r.place_id, pl.name as place_name, pl.district, pl.city, r.score, r.sentiment, r.rated_at
        from public.rankings r join public.places pl on pl.id = r.place_id
        where r.user_id = p.id order by r.rated_at desc limit 12
      ) x
    )
  )
  from public.profiles p
  left join auth.users u on u.id = p.id
  left join public.profile_private pp on pp.user_id = p.id
  where p.id = p_id
$$;

create or replace function public.admin_set_ban(p_id uuid, p_banned boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_banned and exists (select 1 from public.profiles where id = p_id and is_admin) then
    raise exception 'Yönetici hesabı yasaklanamaz' using errcode = '22023';
  end if;
  update auth.users set banned_until = case when p_banned then 'infinity'::timestamptz end where id = p_id;
  if not found then
    raise exception 'Kullanıcı bulunamadı' using errcode = 'P0002';
  end if;
end;
$$;

/** Mekân listesi: arama, süzgeç (kullanıcı ekledi, kapalı, doğrulanmış, popüler), il, sayfalama */
create or replace function public.admin_places(p_args jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q text := nullif(btrim(p_args ->> 'q'), '');
  f text := coalesce(p_args ->> 'filter', 'all');
  c text := nullif(p_args ->> 'city', '');
  lim int := least(greatest(coalesce((p_args ->> 'limit')::int, 50), 1), 200);
  off int := greatest(coalesce((p_args ->> 'offset')::int, 0), 0);
  result jsonb;
begin
  with base as materialized (
    select p.id, p.name, p.cuisine, p.neighborhood, p.district, p.city, p.address, p.phone, p.website,
      p.latitude, p.longitude, p.closed_at, p.source, p.created_at, p.created_by, p.rating_count, p.post_count,
      p.verified_until, p.locked_fields, p.price_level
    from public.places p
    where (q is null or p.search_text like '%' || public.tr_fold(q) || '%' or p.id::text = q)
      and (c is null or p.city = c)
      and (f = 'all'
           or (f = 'user' and p.created_by is not null)
           or (f = 'closed' and p.closed_at is not null)
           or (f = 'verified' and p.verified_until > now())
           or (f = 'popular' and p.rating_count + p.post_count > 0)
           or (f = 'locked' and cardinality(p.locked_fields) > 0))
  ),
  page as materialized (
    select b.*, row_number() over (
      order by
        case when f = 'user' then b.created_at end desc nulls last,
        case when f = 'verified' then b.verified_until end desc nulls last,
        b.rating_count + b.post_count desc,
        b.name,
        b.id
    ) as rn
    from base b
    order by rn
    limit lim offset off
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'rows', coalesce(jsonb_agg(
      to_jsonb(pg) || jsonb_build_object(
        'average', (select round(avg(r.score)::numeric, 1) from public.rankings r where r.place_id = pg.id),
        'created_by_username', (select u.username from public.profiles u where u.id = pg.created_by),
        'pending_corrections', (select count(*) from public.place_corrections pc
                                where pc.place_id = pg.id and pc.status = 'pending')
      ) order by pg.rn
    ), '[]')
  ) into result
  from page pg;
  return result;
end;
$$;

/**
 * Mekânı düzeltir. Değişen alanlar kilitlenir: toplu içe aktarım (OSM/Overture) onları bir daha ezmez.
 * Konum değişirse il/ilçe/mahalle koordinattan yeniden yazılır (places_fill_area).
 */
create or replace function public.admin_update_place(p_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  patch jsonb := coalesce(p_patch, '{}');
  locks text[] := '{}';
  result jsonb;
begin
  if patch ? 'name' then
    if char_length(btrim(patch ->> 'name')) = 0 then
      raise exception 'Ad boş olamaz' using errcode = '22023';
    end if;
    locks := array_append(locks, 'name');
  end if;
  if patch ? 'cuisine' then locks := array_append(locks, 'cuisine'); end if;
  if patch ? 'address' then locks := array_append(locks, 'address'); end if;
  if patch ? 'phone' then locks := array_append(locks, 'phone'); end if;
  if patch ? 'website' then locks := array_append(locks, 'website'); end if;
  if patch ? 'latitude' or patch ? 'longitude' then locks := array_append(locks, 'location'); end if;
  if patch ? 'closed' then locks := array_append(locks, 'closed'); end if;

  update public.places p
  set name = case when patch ? 'name' then btrim(patch ->> 'name') else p.name end,
      cuisine = case when patch ? 'cuisine' then patch ->> 'cuisine' else p.cuisine end,
      address = case when patch ? 'address' then coalesce(btrim(patch ->> 'address'), '') else p.address end,
      phone = case when patch ? 'phone' then nullif(btrim(patch ->> 'phone'), '') else p.phone end,
      website = case when patch ? 'website' then nullif(btrim(patch ->> 'website'), '') else p.website end,
      price_level = case when patch ? 'price_level' then (patch ->> 'price_level')::int else p.price_level end,
      latitude = case when patch ? 'latitude' then (patch ->> 'latitude')::float8 else p.latitude end,
      longitude = case when patch ? 'longitude' then (patch ->> 'longitude')::float8 else p.longitude end,
      closed_at = case
        when not patch ? 'closed' then p.closed_at
        when (patch ->> 'closed')::boolean then coalesce(p.closed_at, now())
        else null
      end,
      locked_fields = (select coalesce(array_agg(distinct x order by x), '{}') from unnest(p.locked_fields || locks) x)
  where p.id = p_id
  returning jsonb_build_object('id', p.id, 'city', p.city, 'district', p.district, 'neighborhood', p.neighborhood)
  into result;
  if result is null then
    raise exception 'Mekân bulunamadı' using errcode = 'P0002';
  end if;
  return result;
end;
$$;

/** Bekleyen mekân düzeltmeleri; harita için mekânın konumu ve öneren kişiyle */
create or replace function public.admin_corrections()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    to_jsonb(c) || jsonb_build_object(
      'city', p.city,
      'district', p.district,
      'neighborhood', p.neighborhood,
      'cuisine', p.cuisine,
      'place_latitude', p.latitude,
      'place_longitude', p.longitude,
      'reporter', u.username
    ) order by c.created_at
  ), '[]')
  from public.admin_place_corrections() c
  join public.places p on p.id = c.place_id
  join public.place_corrections pc on pc.id = c.id
  left join public.profiles u on u.id = pc.user_id
$$;

/** Son gönderiler: arama (açıklama, kullanıcı, mekân), sayfalama */
create or replace function public.admin_posts(p_args jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q text := nullif(btrim(p_args ->> 'q'), '');
  lim int := least(greatest(coalesce((p_args ->> 'limit')::int, 30), 1), 100);
  off int := greatest(coalesce((p_args ->> 'offset')::int, 0), 0);
  uid uuid := nullif(p_args ->> 'user_id', '')::uuid;
  result jsonb;
begin
  with page as materialized (
    select po.*
    from public.posts po
    where (uid is null or po.user_id = uid)
      and (q is null
           or po.caption ilike '%' || q || '%'
           or exists (select 1 from public.profiles u where u.id = po.user_id and u.search_text like '%' || public.tr_fold(q) || '%')
           or exists (select 1 from public.places pl where pl.id = po.place_id and pl.search_text like '%' || public.tr_fold(q) || '%'))
    order by po.created_at desc
    limit lim offset off
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pg.id,
    'caption', pg.caption,
    'score', pg.score,
    'like_count', pg.like_count,
    'comment_count', pg.comment_count,
    'created_at', pg.created_at,
    'photos', (select coalesce(jsonb_agg(ph.path order by ph.position), '[]') from public.post_photos ph where ph.post_id = pg.id),
    'author', (select jsonb_build_object('id', u.id, 'username', u.username, 'name', u.name, 'avatar_path', u.avatar_path)
               from public.profiles u where u.id = pg.user_id),
    'place', (select jsonb_build_object('id', pl.id, 'name', pl.name, 'district', pl.district, 'city', pl.city)
              from public.places pl where pl.id = pg.place_id),
    'open_reports', (select count(*) from public.reports r where r.post_id = pg.id and r.resolved_at is null)
  ) order by pg.created_at desc), '[]')
  into result
  from page pg;
  return result;
end;
$$;

/** Doğrulanmış mekân satışları ve özet (aktif, yakında bitecek, gelir) */
create or replace function public.admin_verifications()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with today as (select (now() at time zone 'Europe/Istanbul')::date as d),
  v as (
    select v.*, p.name as place_name, p.district, p.city,
      case
        when v.cancelled_at is not null then 'cancelled'
        when v.starts_on > today.d then 'upcoming'
        when v.ends_on < today.d then 'expired'
        else 'active'
      end as status
    from public.place_verifications v
    join public.places p on p.id = v.place_id, today
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(v) order by v.created_at desc) from v), '[]'),
    'active', (select count(distinct place_id) from v where status = 'active'),
    'expiring', (select count(*) from v, today where status = 'active' and v.ends_on <= today.d + 14),
    'revenue', coalesce((
      select jsonb_object_agg(currency, jsonb_build_object('month', month, 'year', year, 'total', total)) from (
        select currency,
          sum(price) filter (where created_at >= date_trunc('month', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul') as month,
          sum(price) filter (where created_at >= date_trunc('year', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul') as year,
          sum(price) as total
        from v where status <> 'cancelled' group by currency
      ) r), '{}')
  )
$$;

create or replace function public.admin_add_verification(p_args jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan text := coalesce(p_args ->> 'plan', 'monthly');
  starts date := coalesce(nullif(p_args ->> 'starts_on', '')::date, (now() at time zone 'Europe/Istanbul')::date);
  ends date := nullif(p_args ->> 'ends_on', '')::date;
  new_id uuid;
begin
  if ends is null then
    ends := case plan
      when 'monthly' then starts + interval '1 month' - interval '1 day'
      when 'quarterly' then starts + interval '3 months' - interval '1 day'
      when 'yearly' then starts + interval '1 year' - interval '1 day'
    end;
  end if;
  if ends is null then
    raise exception 'Bitiş tarihi gerekli' using errcode = '22023';
  end if;
  insert into public.place_verifications (
    place_id, plan, price, currency, starts_on, ends_on, contact_name, contact_phone, contact_email, note
  ) values (
    (p_args ->> 'place_id')::uuid, plan, coalesce((p_args ->> 'price')::numeric, 0),
    coalesce(nullif(p_args ->> 'currency', ''), 'TRY'), starts, ends,
    nullif(btrim(p_args ->> 'contact_name'), ''), nullif(btrim(p_args ->> 'contact_phone'), ''),
    nullif(btrim(p_args ->> 'contact_email'), ''), nullif(btrim(p_args ->> 'note'), '')
  ) returning id into new_id;
  return jsonb_build_object('id', new_id, 'ends_on', ends);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Tek giriş noktası
-- ---------------------------------------------------------------------------

create or replace function public.admin_panel(p_key text, p_action text, p_args jsonb default '{}')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a jsonb := coalesce(p_args, '{}');
  result jsonb;
begin
  perform public.admin_panel_auth(p_key);

  case p_action
    when 'overview' then
      result := public.admin_overview();
    when 'growth' then
      result := public.growth_stats(coalesce((a ->> 'days')::int, 30));
    when 'reports' then
      result := (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.admin_reports() r);
    when 'resolve_report' then
      perform public.admin_resolve_report((a ->> 'id')::uuid, a ->> 'action');
    when 'corrections' then
      result := public.admin_corrections();
    when 'resolve_correction' then
      perform public.admin_resolve_correction((a ->> 'id')::uuid, (a ->> 'accept')::boolean);
    when 'users' then
      result := public.admin_users(a);
    when 'user' then
      result := public.admin_user((a ->> 'id')::uuid);
    when 'set_ban' then
      perform public.admin_set_ban((a ->> 'id')::uuid, (a ->> 'banned')::boolean);
    when 'places' then
      result := public.admin_places(a);
    when 'update_place' then
      result := public.admin_update_place((a ->> 'id')::uuid, a -> 'patch');
    when 'posts' then
      result := public.admin_posts(a);
    when 'delete_post' then
      delete from public.posts where id = (a ->> 'id')::uuid;
    when 'verifications' then
      result := public.admin_verifications();
    when 'add_verification' then
      result := public.admin_add_verification(a);
    when 'cancel_verification' then
      update public.place_verifications set cancelled_at = coalesce(cancelled_at, now())
      where id = (a ->> 'id')::uuid;
    when 'versions' then
      result := (select coalesce(jsonb_agg(to_jsonb(v) order by v.platform), '[]') from public.app_min_versions v);
    when 'set_version' then
      update public.app_min_versions set min_version = a ->> 'version', updated_at = now()
      where platform = a ->> 'platform';
    when 'audit' then
      result := (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]')
                 from (select * from public.admin_audit order by created_at desc limit 200) x);
    else
      raise exception 'Bilinmeyen işlem: %', p_action using errcode = '22023';
  end case;

  if p_action in ('resolve_report', 'resolve_correction', 'set_ban', 'update_place', 'delete_post',
                  'add_verification', 'cancel_verification', 'set_version') then
    insert into public.admin_audit (action, args) values (p_action, a);
  end if;

  return coalesce(result, '{"ok": true}');
end;
$$;

-- ---------------------------------------------------------------------------
-- Fonksiyon yetkileri: yalnızca admin_panel dışarıya açık (anahtarı kendisi denetler)
-- ---------------------------------------------------------------------------

revoke execute on function
  public.admin_panel_auth(text),
  public.refresh_place_verified(),
  public.admin_overview(),
  public.admin_users(jsonb),
  public.admin_user(uuid),
  public.admin_set_ban(uuid, boolean),
  public.admin_places(jsonb),
  public.admin_update_place(uuid, jsonb),
  public.admin_corrections(),
  public.admin_posts(jsonb),
  public.admin_verifications(),
  public.admin_add_verification(jsonb),
  public.admin_panel(text, text, jsonb)
from public, anon, authenticated;

grant execute on function public.admin_panel(text, text, jsonb) to anon, authenticated;
