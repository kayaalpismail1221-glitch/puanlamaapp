-- Puanla: temel şema
-- Tablolar, kısıtlar, indeksler ve verinin tutarlılığını koruyan tetikleyiciler.
-- Güvenlik kuralları (RLS) ayrı dosyada: 20260924100100_policies.sql

create extension if not exists postgis with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Yardımcılar
-- ---------------------------------------------------------------------------

/** Türkçe duyarlı arama metni: "Köfteci İskender" → "kofteci iskender" */
create or replace function public.tr_fold(input text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(translate(coalesce(input, ''), 'ÇĞİIÖŞÜÂÎÛçğıöşüâîû', 'cgiiosuaiucgiosuaiu'))
$$;

/** Güncellenen satırın updated_at alanını yeniler */
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

/**
 * Kötüye kullanıma karşı basit günlük sınır.
 * Tetikleyici argümanları: sahip sütunu, günlük sınır, kullanıcıya gösterilecek ad.
 */
create or replace function public.enforce_daily_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_column text := tg_argv[0];
  max_per_day int := tg_argv[1]::int;
  label text := tg_argv[2];
  owner_id uuid;
  recent int;
begin
  -- Yönetim işlemleri (seed, service_role) sınırsız
  if auth.uid() is null then
    return new;
  end if;
  execute format('select ($1).%I', owner_column) into owner_id using new;
  execute format(
    'select count(*) from %I.%I where %I = $1 and created_at > now() - interval ''1 day''',
    tg_table_schema, tg_table_name, owner_column
  ) into recent using owner_id;
  if recent >= max_per_day then
    raise exception 'Günlük % sınırına ulaştın, yarın tekrar dene.', label
      using errcode = 'P0001', hint = 'rate_limit';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sabit listeler
-- ---------------------------------------------------------------------------

create type public.sentiment as enum ('liked', 'fine', 'disliked');
create type public.save_origin as enum ('social', 'app');
create type public.price_bucket as enum ('u250', '250-500', '500-1000', '1000-2000', 'o2000');
create type public.meal as enum ('kahvalti', 'ogle', 'aksam', 'gece');
create type public.report_reason as enum ('spam', 'offensive', 'fake', 'other');

/** Mutfak kategorileri; uygulamadaki `Cuisine` tipiyle aynı olmalı */
create table public.cuisines (
  name text primary key,
  position smallint not null unique
);

insert into public.cuisines (name, position) values
  ('Kahvaltıcı', 1),
  ('Esnaf lokantası', 2),
  ('Dürümcü', 3),
  ('Kokoreççi', 4),
  ('Ciğerci', 5),
  ('Balıkçı', 6),
  ('Meyhane', 7),
  ('Kebapçı', 8),
  ('Pideci', 9),
  ('Kafe', 10),
  ('Burgerci', 11),
  ('Tatlıcı', 12);

-- ---------------------------------------------------------------------------
-- Profiller
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique
    constraint username_format check (username ~ '^[a-z0-9._]{3,24}$'),
  name text not null
    constraint name_length check (char_length(btrim(name)) between 1 and 60),
  avatar_path text check (char_length(avatar_path) <= 300),
  school_id text check (char_length(school_id) <= 80),
  year_goal smallint check (year_goal between 1 and 1000),
  onboarded_at timestamptz,
  -- Sayaçlar tetikleyicilerle tutulur; kullanıcı doğrudan değiştiremez
  follower_count integer not null default 0,
  following_count integer not null default 0,
  post_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_text text generated always as (public.tr_fold(name || ' ' || username)) stored
);

create index profiles_search_idx on public.profiles using gin (search_text extensions.gin_trgm_ops);
create index profiles_school_idx on public.profiles (school_id) where school_id is not null;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

/** Yalnızca sahibinin görebildiği iletişim bilgileri */
create table public.profile_private (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  phone text check (phone ~ '^\+905[0-9]{9}$'),
  updated_at timestamptz not null default now()
);

create trigger profile_private_touch before update on public.profile_private
  for each row execute function public.touch_updated_at();

/** Serbest metni geçerli bir kullanıcı adı adayına çevirir */
create or replace function public.slugify_username(input text)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(regexp_replace(public.tr_fold(input), '[^a-z0-9._]', '', 'g'), 24)
$$;

/** Boşta olan bir kullanıcı adı bulur: zeynep, zeynep2, zeynep37… */
create or replace function public.unique_username(base text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  root text := public.slugify_username(base);
  candidate text;
  suffix text;
  attempt int := 0;
begin
  if char_length(root) < 3 then
    root := left('puanla' || root, 24);
  end if;
  candidate := root;
  while exists (select 1 from public.profiles where username = candidate) loop
    attempt := attempt + 1;
    -- Önce zeynep2…zeynep10, sonra rastgele dört hane
    suffix := (case when attempt < 10 then attempt + 1 else floor(random() * 9000 + 1000)::int end)::text;
    candidate := left(root, 24 - char_length(suffix)) || suffix;
    if attempt > 50 then
      raise exception 'Kullanıcı adı üretilemedi';
    end if;
  end loop;
  return candidate;
end;
$$;

/**
 * Yeni hesap açılınca profili oluşturur.
 * Kayıt sırasında gönderilen meta veriler: name, username, phone.
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
  phone_digits text := regexp_replace(coalesce(meta ->> 'phone', ''), '\D', '', 'g');
begin
  insert into public.profiles (id, name, username)
  values (
    new.id,
    left(coalesce(display_name, nullif(email_name, ''), 'Puanla kullanıcısı'), 60),
    public.unique_username(coalesce(nullif(meta ->> 'username', ''), display_name, email_name, 'puanla'))
  );

  insert into public.profile_private (user_id, phone)
  values (
    new.id,
    case when phone_digits ~ '^5[0-9]{9}$' then '+90' || phone_digits end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Mekânlar
-- ---------------------------------------------------------------------------

create table public.places (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  cuisine text not null references public.cuisines (name) on update cascade,
  neighborhood text not null default '' check (char_length(neighborhood) <= 80),
  district text not null check (char_length(btrim(district)) between 1 and 80),
  city text not null check (char_length(btrim(city)) between 1 and 80),
  price_level smallint not null default 2 check (price_level between 1 and 4),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  location extensions.geography(point, 4326) generated always as (
    extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography
  ) stored,
  photo_url text check (char_length(photo_url) <= 500),
  -- Verinin kaynağı: seed (geliştirme), user (kullanıcı ekledi), foursquare/google (içe aktarım)
  source text not null default 'user' check (source in ('seed', 'user', 'foursquare', 'google')),
  external_id text,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  search_text text generated always as (
    public.tr_fold(name || ' ' || cuisine || ' ' || neighborhood || ' ' || district || ' ' || city)
  ) stored,
  unique (source, external_id)
);

create index places_location_idx on public.places using gist (location);
create index places_search_idx on public.places using gin (search_text extensions.gin_trgm_ops);
create index places_area_idx on public.places (city, district);
create index places_created_by_idx on public.places (created_by, created_at) where created_by is not null;

create trigger places_daily_limit before insert on public.places
  for each row execute function public.enforce_daily_limit('created_by', '30', 'mekân ekleme');

-- ---------------------------------------------------------------------------
-- Sıralamalar (Beli tarzı): her izlenim grubunda 0'dan başlayan sıra
-- Yalnızca rank_place / unrank_place fonksiyonlarıyla değişir.
-- ---------------------------------------------------------------------------

create table public.rankings (
  user_id uuid not null references public.profiles (id) on delete cascade,
  place_id uuid not null references public.places (id) on delete cascade,
  sentiment public.sentiment not null,
  position integer not null check (position >= 0),
  -- Sıradaki konumdan hesaplanan 0–10 puan (grup değiştikçe yeniden hesaplanır)
  score numeric(3, 1) not null check (score between 0 and 10),
  note text check (char_length(note) <= 280),
  rated_at timestamptz not null default now(),
  primary key (user_id, place_id),
  constraint rankings_position_unique unique (user_id, sentiment, position) deferrable initially immediate
);

create index rankings_place_idx on public.rankings (place_id);

/**
 * Grup içindeki sıradan puan. Uygulamadaki `scoreAt` ile birebir aynı:
 * en iyi grubun üst sınırını, en kötü alt sınırını alır; aradakiler eşit aralıklı.
 * Kayan nokta farkı olmasın diye onda birler cinsinden tam sayılarla hesaplanır.
 */
create or replace function public.sentiment_score(s public.sentiment, pos integer, cnt integer)
returns numeric
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when cnt <= 1 then hi / 10.0
    else round(hi - (hi - lo)::numeric * pos / (cnt - 1)) / 10.0
  end
  from (
    select
      case s when 'liked' then 100 when 'fine' then 66 else 33 end as hi,
      case s when 'liked' then 67 when 'fine' then 34 else 0 end as lo
  ) range
$$;

-- ---------------------------------------------------------------------------
-- Listem: gitmek istenen mekânlar
-- ---------------------------------------------------------------------------

create table public.saved_places (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  place_id uuid not null references public.places (id) on delete cascade,
  origin public.save_origin not null default 'app',
  link text check (link ~ '^https?://' and char_length(link) <= 500),
  note text check (char_length(note) <= 280),
  saved_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

create index saved_places_user_idx on public.saved_places (user_id, saved_at desc);

-- ---------------------------------------------------------------------------
-- Takip ve engelleme
-- ---------------------------------------------------------------------------

create table public.follows (
  follower_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create index follows_followee_idx on public.follows (followee_id, created_at desc);

create table public.blocks (
  blocker_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index blocks_blocked_idx on public.blocks (blocked_id);

/** İki kullanıcıdan biri diğerini engellediyse true */
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  )
$$;

/** Engellenen kişiyle karşılıklı takip kalkar */
create or replace function public.on_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.follows
  where (follower_id = new.blocker_id and followee_id = new.blocked_id)
     or (follower_id = new.blocked_id and followee_id = new.blocker_id);
  return new;
end;
$$;

create trigger blocks_unfollow after insert on public.blocks
  for each row execute function public.on_block();

create or replace function public.on_follow_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
    update public.profiles set follower_count = follower_count + 1 where id = new.followee_id;
  else
    update public.profiles set following_count = greatest(following_count - 1, 0) where id = old.follower_id;
    update public.profiles set follower_count = greatest(follower_count - 1, 0) where id = old.followee_id;
  end if;
  return null;
end;
$$;

create trigger follows_count after insert or delete on public.follows
  for each row execute function public.on_follow_change();

-- ---------------------------------------------------------------------------
-- Gönderiler
-- ---------------------------------------------------------------------------

/** Metin dizisindeki her öğe kısa ve dolu olmalı */
create or replace function public.valid_tags(items text[], max_length int)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(char_length(btrim(item)) between 1 and max_length), true)
  from unnest(items) as item
$$;

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  place_id uuid not null references public.places (id) on delete cascade,
  caption text check (char_length(caption) <= 2000),
  -- Paylaşım anındaki puan; sunucu sıralamadan doldurur
  score numeric(3, 1) check (score between 0 and 10),
  price_per_person public.price_bucket,
  meal public.meal,
  dishes text[] not null default '{}'
    check (cardinality(dishes) <= 5 and public.valid_tags(dishes, 60)),
  highlights text[] not null default '{}'
    check (cardinality(highlights) <= 3 and public.valid_tags(highlights, 40)),
  like_count integer not null default 0,
  comment_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index posts_user_idx on public.posts (user_id, created_at desc);
create index posts_place_idx on public.posts (place_id, created_at desc);
create index posts_created_idx on public.posts (created_at desc);

create trigger posts_touch before update on public.posts
  for each row execute function public.touch_updated_at();

create trigger posts_daily_limit before insert on public.posts
  for each row execute function public.enforce_daily_limit('user_id', '30', 'gönderi');

/** Puanı istemciden almak yerine kullanıcının güncel sıralamasından yazar */
create or replace function public.on_post_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.score := (select score from public.rankings where user_id = new.user_id and place_id = new.place_id);
    new.like_count := 0;
    new.comment_count := 0;
  end if;
  return new;
end;
$$;

create trigger posts_fill before insert on public.posts
  for each row execute function public.on_post_insert();

create or replace function public.on_post_count_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set post_count = post_count + 1 where id = new.user_id;
  else
    update public.profiles set post_count = greatest(post_count - 1, 0) where id = old.user_id;
  end if;
  return null;
end;
$$;

create trigger posts_count after insert or delete on public.posts
  for each row execute function public.on_post_count_change();

/**
 * Fotoğraflar sırasıyla (en fazla 5). `path` depolamadaki yol ("<kullanıcı>/<gönderi>/0.jpg")
 * ya da geliştirme verisi için tam bir https adresidir.
 */
create table public.post_photos (
  post_id uuid not null references public.posts (id) on delete cascade,
  position smallint not null check (position between 0 and 4),
  path text not null check (char_length(path) <= 500),
  width integer check (width > 0),
  height integer check (height > 0),
  primary key (post_id, position)
);

/** Birlikte gidilen arkadaşlar */
create table public.post_tags (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (post_id, user_id)
);

create index post_tags_user_idx on public.post_tags (user_id);

create table public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index post_likes_user_idx on public.post_likes (user_id, created_at desc);

create or replace function public.on_like_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
  else
    update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$;

create trigger post_likes_count after insert or delete on public.post_likes
  for each row execute function public.on_like_change();

/** Kaydedilen gönderiler (yalnızca sahibi görür) */
create table public.post_saves (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index post_saves_user_idx on public.post_saves (user_id, created_at desc);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index comments_post_idx on public.comments (post_id, created_at);
create index comments_user_idx on public.comments (user_id, created_at);

create trigger comments_daily_limit before insert on public.comments
  for each row execute function public.enforce_daily_limit('user_id', '300', 'yorum');

create or replace function public.on_comment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id;
  else
    update public.posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$;

create trigger comments_count after insert or delete on public.comments
  for each row execute function public.on_comment_change();

-- ---------------------------------------------------------------------------
-- Şikâyetler (App Store kullanıcı içeriği kuralı gereği)
-- ---------------------------------------------------------------------------

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  post_id uuid references public.posts (id) on delete cascade,
  comment_id uuid references public.comments (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  reason public.report_reason not null,
  details text check (char_length(details) <= 1000),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (num_nonnulls(post_id, comment_id, user_id) = 1)
);

create index reports_open_idx on public.reports (created_at) where resolved_at is null;

create trigger reports_daily_limit before insert on public.reports
  for each row execute function public.enforce_daily_limit('reporter_id', '50', 'şikâyet');
