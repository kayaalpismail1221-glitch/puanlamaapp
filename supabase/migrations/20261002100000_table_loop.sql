-- Masa döngüsü ve rehber eşleştirme.
--
-- 1. Doğrulanmış telefon: numara Supabase Auth'un SMS doğrulamasıyla (auth.users.phone_confirmed_at) onaylanır;
--    eşleşmede yalnızca doğrulanmış numaralar kullanılır (başkasının numarasını yazıp onun yerine görünülemez).
-- 2. Rehber: kullanıcının rehberindeki numaralar sunucuda yalnızca SHA-256 özetiyle tutulur (`contact_hashes`);
--    rehberdeki kişiler uygulamaya katılınca "arkadaşın katıldı" bildirimi gider.
-- 3. Davet: gönderide rehberden etiketlenen, uygulamada olmayan kişiler (`invites`). Davet edilen katılınca
--    davet edene bildirim; aynı mekânı puanlayınca davet edene karşılaştırma bildirimi (friend_rated).
-- Numaralar yalnızca Türkiye cep telefonu (+905XXXXXXXXX).

alter type public.notification_type add value if not exists 'friend_joined';

-- ---------------------------------------------------------------------------
-- Numara biçimi ve özeti
-- ---------------------------------------------------------------------------

/** "0532 123 45 67", "+90 532…", "905321234567" → "+905321234567"; Türkiye cep numarası değilse null */
create or replace function public.normalize_tr_phone(input text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when d ~ '^5[0-9]{9}$' then '+90' || d end
  from (select regexp_replace(regexp_replace(coalesce(input, ''), '\D', '', 'g'), '^(90|0)', '') as d) s
$$;

/** Eşleştirmede kullanılan özet; numaranın kendisi rehber ve davet tablolarında saklanmaz */
create or replace function public.phone_hash(normalized text)
returns bytea
language sql
immutable
set search_path = ''
as $$
  select case when normalized is not null then sha256(convert_to(normalized, 'UTF8')) end
$$;

-- ---------------------------------------------------------------------------
-- Doğrulanmış telefon
-- ---------------------------------------------------------------------------

alter table public.profile_private
  add column phone_verified_at timestamptz,
  add column verified_phone_hash bytea,
  -- Rehberinde numaram kayıtlı olanlar beni bulabilir (Ayarlar'dan kapatılabilir)
  add column discoverable boolean not null default true;

-- Bir numara tek hesaba bağlı
create unique index profile_private_verified_phone on public.profile_private (verified_phone_hash)
  where verified_phone_hash is not null;

-- Doğrulama alanlarını yalnızca sunucu yazar
revoke insert, update on public.profile_private from authenticated;
grant insert (user_id, phone, push_muted, discoverable) on public.profile_private to authenticated;
grant update (phone, push_muted, discoverable) on public.profile_private to authenticated;

/** Kullanıcı numarasını elle değiştirirse doğrulaması düşer */
create or replace function public.on_private_phone_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.phone is distinct from old.phone and new.phone_verified_at is not distinct from old.phone_verified_at then
    new.phone_verified_at := null;
    new.verified_phone_hash := null;
  end if;
  return new;
end;
$$;

create trigger profile_private_phone_change before update on public.profile_private
  for each row execute function public.on_private_phone_change();

/**
 * Tek bildirim ekler (oturumsuz bağlam için: Supabase Auth numarayı kendi rolüyle doğrular, auth.uid() boştur).
 * Kendine ve engelli çiftler arasında bildirim yok; tekrarlar `notifications_once` ile yutulur.
 */
create or replace function public.notify_system(
  p_user_id uuid,
  p_actor_id uuid,
  p_type public.notification_type,
  p_place_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or p_user_id = p_actor_id or public.is_blocked_between(p_user_id, p_actor_id) then
    return;
  end if;
  insert into public.notifications (user_id, actor_id, type, place_id)
  values (p_user_id, p_actor_id, p_type, p_place_id)
  on conflict do nothing;
end;
$$;

/**
 * Numara doğrulanınca: davetler kabul edilmiş sayılır, davet edenlere ve rehberinde bu numara olanlara
 * "arkadaşın katıldı" bildirimi gider. Aynı numarayla daha önce doğrulanmış başka hesap varsa numara ondan alınır
 * (numaranın sahibi olduğunu SMS koduyla şimdi kanıtlayan kazanır).
 */
create or replace function public.phone_verified(p_user_id uuid, p_phone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  h bytea := public.phone_hash(p_phone);
  r record;
begin
  update public.profile_private
  set phone_verified_at = null, verified_phone_hash = null
  where verified_phone_hash = h and user_id <> p_user_id;

  update public.profile_private
  set phone = p_phone, phone_verified_at = now(), verified_phone_hash = h
  where user_id = p_user_id;

  -- Davet edenler: en son davet ettiği mekânla birlikte
  for r in
    with accepted as (
      update public.invites
      set joined_user_id = p_user_id, joined_at = now()
      where phone_hash = h and joined_user_id is null and inviter_id <> p_user_id
      returning inviter_id, place_id, created_at
    )
    select distinct on (inviter_id) inviter_id, place_id from accepted order by inviter_id, created_at desc
  loop
    perform public.notify_system(r.inviter_id, p_user_id, 'friend_joined', r.place_id);
  end loop;

  -- Rehberinde bu numara olanlar (davet edenler yukarıda bildirim aldı)
  for r in
    select c.owner_id from public.contact_hashes c
    where c.phone_hash = h and c.owner_id <> p_user_id
      and not exists (select 1 from public.invites i where i.inviter_id = c.owner_id and i.phone_hash = h)
  loop
    perform public.notify_system(r.owner_id, p_user_id, 'friend_joined');
  end loop;
end;
$$;

/** Supabase Auth numarayı doğrulayınca (updateUser + verifyOtp 'phone_change') ya da numara kalkınca */
create or replace function public.on_auth_phone_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized text := public.normalize_tr_phone(new.phone);
begin
  if new.phone_confirmed_at is not null and normalized is not null then
    if tg_op = 'INSERT' or old.phone_confirmed_at is distinct from new.phone_confirmed_at
       or old.phone is distinct from new.phone then
      perform public.phone_verified(new.id, normalized);
    end if;
  elsif tg_op = 'UPDATE' and old.phone_confirmed_at is not null then
    update public.profile_private
    set phone_verified_at = null, verified_phone_hash = null
    where user_id = new.id;
  end if;
  return null;
end;
$$;

-- Adı `on_auth_user_created`'dan sonra gelir: profil satırı önce oluşur
create trigger on_auth_user_phone after insert or update of phone, phone_confirmed_at on auth.users
  for each row execute function public.on_auth_phone_change();

-- ---------------------------------------------------------------------------
-- Rehber ve davetler
-- ---------------------------------------------------------------------------

/** Kullanıcının rehberindeki numaraların özetleri (son eşleştirmedeki hâli) */
create table public.contact_hashes (
  owner_id uuid not null references public.profiles (id) on delete cascade,
  phone_hash bytea not null,
  primary key (owner_id, phone_hash)
);

create index contact_hashes_phone_idx on public.contact_hashes (phone_hash);

/** Rehber eşleştirme istekleri (numara taramasına karşı günlük sınır için) */
create table public.contact_matches (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index contact_matches_user_idx on public.contact_matches (user_id, created_at);

create trigger contact_matches_daily_limit before insert on public.contact_matches
  for each row execute function public.enforce_daily_limit('user_id', '30', 'rehber eşleştirme');

/** Gönderide rehberden etiketlenen, uygulamada olmayan kişiler */
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  phone_hash bytea not null,
  place_id uuid not null references public.places (id) on delete cascade,
  post_id uuid references public.posts (id) on delete set null,
  created_at timestamptz not null default now(),
  joined_user_id uuid references public.profiles (id) on delete set null,
  joined_at timestamptz,
  unique (inviter_id, phone_hash, place_id)
);

create index invites_phone_idx on public.invites (phone_hash) where joined_user_id is null;
create index invites_joined_idx on public.invites (joined_user_id, place_id);

create trigger invites_daily_limit before insert on public.invites
  for each row execute function public.enforce_daily_limit('inviter_id', '50', 'davet');

-- Yalnızca fonksiyonlarla okunur ve yazılır
revoke all on public.contact_hashes, public.contact_matches, public.invites from anon, authenticated;
alter table public.contact_hashes enable row level security;
alter table public.contact_matches enable row level security;
alter table public.invites enable row level security;

-- ---------------------------------------------------------------------------
-- Uygulama API'si
-- ---------------------------------------------------------------------------

/**
 * Rehberdeki numaralardan uygulamada olanları döner (doğrulanmış, bulunabilir, engelli olmayan).
 * `p_save`: rehberin tamamı gönderildiyse saklanır (sonradan katılanlar için "arkadaşın katıldı");
 * gönderideki tek kişilik seçimde saklanmaz. Dönen numara, istemcinin rehberdeki adla eşlemesi içindir.
 */
create or replace function public.match_contacts(p_phones text[], p_save boolean default false)
returns table (phone text, "user" jsonb, following boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  phones text[];
begin
  if me is null then
    raise exception 'Giriş yapman gerekiyor' using errcode = '42501';
  end if;
  if cardinality(p_phones) > 3000 then
    raise exception 'En fazla 3000 numara eşleştirilebilir' using errcode = '22023';
  end if;
  insert into public.contact_matches (user_id) values (me);

  select coalesce(array_agg(distinct n), '{}') into phones
  from (select public.normalize_tr_phone(x) as n from unnest(coalesce(p_phones, '{}')) x) s
  where n is not null;

  if p_save then
    delete from public.contact_hashes c
    where c.owner_id = me
      and not c.phone_hash = any (array(select public.phone_hash(x) from unnest(phones) x));
    insert into public.contact_hashes (owner_id, phone_hash)
    select me, public.phone_hash(x) from unnest(phones) x
    on conflict do nothing;
  end if;

  return query
  select m.num, public.profile_json(p),
    exists (select 1 from public.follows f where f.follower_id = me and f.followee_id = p.id)
  from unnest(phones) as m(num)
  join public.profile_private pp on pp.verified_phone_hash = public.phone_hash(m.num) and pp.discoverable
  join public.profiles p on p.id = pp.user_id
  where p.id <> me and not public.is_blocked_between(me, p.id)
  order by p.name;
end;
$$;

/** Gönderide rehberden etiketlenen, uygulamada olmayan kişileri davet eder (en fazla 10) */
create or replace function public.create_invites(p_place_id uuid, p_phones text[], p_post_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Giriş yapman gerekiyor' using errcode = '42501';
  end if;
  if cardinality(p_phones) > 10 then
    raise exception 'Tek seferde en fazla 10 kişi davet edilebilir' using errcode = '22023';
  end if;
  if p_post_id is not null and not exists (select 1 from public.posts where id = p_post_id and user_id = me) then
    raise exception 'Gönderi bulunamadı' using errcode = '42501';
  end if;
  insert into public.invites (inviter_id, phone_hash, place_id, post_id)
  select distinct me, public.phone_hash(n), p_place_id, p_post_id
  from (select public.normalize_tr_phone(x) as n from unnest(coalesce(p_phones, '{}')) x) s
  where n is not null and n is distinct from (select phone from public.profile_private where user_id = me)
  on conflict (inviter_id, phone_hash, place_id) do update set post_id = coalesce(excluded.post_id, public.invites.post_id);
end;
$$;

/**
 * Beni davet edenler: onboarding davet bağlamıyla başlar (o mekânı puanla, davet edeni takip et).
 * Davet edenin o mekâna verdiği puan karşılaştırma için döner.
 */
create or replace function public.my_invites()
returns table (inviter jsonb, place jsonb, inviter_score numeric, my_score numeric, following boolean, invited_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.profile_json(p),
    (select to_jsonb(v) from public.place_view v where v.id = i.place_id),
    (select r.score from public.rankings r where r.user_id = i.inviter_id and r.place_id = i.place_id),
    (select r.score from public.rankings r where r.user_id = auth.uid() and r.place_id = i.place_id),
    exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = i.inviter_id),
    i.created_at
  from public.invites i
  join public.profiles p on p.id = i.inviter_id
  where i.joined_user_id = auth.uid() and not public.is_blocked_between(auth.uid(), i.inviter_id)
  order by i.created_at desc
  limit 20
$$;

-- ---------------------------------------------------------------------------
-- Bildirimler
-- ---------------------------------------------------------------------------

/**
 * "Arkadaşın gittiğin yeri puanladı": puanlayanı takip eden ya da onu bu mekân için davet etmiş,
 * o mekânı daha önce puanlamış kişilere (davetin karşılaştırma adımı).
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
    select f.follower_id from public.follows f where f.followee_id = new.user_id
    union
    select i.inviter_id from public.invites i where i.joined_user_id = new.user_id and i.place_id = new.place_id
  loop
    if exists (select 1 from public.rankings r where r.user_id = recipient and r.place_id = new.place_id) then
      perform public.notify(recipient, new.user_id, 'friend_rated', null, null, new.place_id);
    end if;
  end loop;
  return null;
end;
$$;

/** Push metni; yeni tür: friend_joined */
create or replace function public.notification_text(n public.notifications, locale text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor text := (select name from public.profiles where id = n.actor_id);
  place text := (
    select pl.name from public.places pl
    where pl.id = coalesce(n.place_id, (select place_id from public.posts where id = n.post_id))
  );
  body text;
  theirs numeric;
  mine numeric;
begin
  if n.type::text = 'friend_joined' then
    if place is not null then
      return case when locale = 'tr' then 'Davet ettiğin ' || actor || ' Puanla''ya katıldı. Bakalım ' || place || '''a kaç verecek?'
                  else actor || ' joined Puanla from your invite. Let''s see what they give ' || place || '.' end;
    end if;
    return case when locale = 'tr' then 'Rehberindeki ' || actor || ' Puanla''ya katıldı'
                else actor || ' from your contacts joined Puanla' end;
  end if;
  case n.type
    when 'like' then
      return case when locale = 'tr' then actor || ' gönderini beğendi · ' || place
                  else actor || ' liked your post · ' || place end;
    when 'comment' then
      body := (select c.body from public.comments c where c.id = n.comment_id);
      if char_length(body) > 80 then body := left(body, 79) || '…'; end if;
      return case when locale = 'tr' then actor || ' yorum yaptı: “' || body || '”'
                  else actor || ' commented: “' || body || '”' end;
    when 'tag' then
      return case when locale = 'tr' then actor || ' seni ' || place || ' gönderisinde etiketledi'
                  else actor || ' tagged you at ' || place end;
    when 'follow' then
      return case when locale = 'tr' then actor || ' seni takip etmeye başladı'
                  else actor || ' started following you' end;
    when 'friend_rated' then
      theirs := (select score from public.rankings where user_id = n.actor_id and place_id = n.place_id);
      mine := (select score from public.rankings where user_id = n.user_id and place_id = n.place_id);
      return case when locale = 'tr'
        then actor || ', ' || place || ' için ' || public.format_score(theirs, locale) || ' verdi. Sen '
             || public.format_score(mine, locale) || ' vermiştin.'
        else actor || ' gave ' || place || ' a ' || public.format_score(theirs, locale) || '. You gave it '
             || public.format_score(mine, locale) || '.' end;
    else
      return null;
  end case;
end;
$$;

/** Bildirime dokununca açılacak ekran; katılan arkadaşın profili */
create or replace function public.notification_path(n public.notifications)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  return case n.type::text
    when 'follow' then 'kullanici/' || n.actor_id
    when 'friend_joined' then 'kullanici/' || n.actor_id
    when 'friend_rated' then 'mekan/' || n.place_id
    else 'gonderi/' || n.post_id
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Erişim
-- ---------------------------------------------------------------------------

revoke execute on function
  public.normalize_tr_phone(text),
  public.phone_hash(text),
  public.on_private_phone_change(),
  public.notify_system(uuid, uuid, public.notification_type, uuid),
  public.phone_verified(uuid, text),
  public.on_auth_phone_change(),
  public.notification_text(public.notifications, text),
  public.notification_path(public.notifications)
from public, anon, authenticated;

revoke execute on function
  public.match_contacts(text[], boolean),
  public.create_invites(uuid, text[], uuid),
  public.my_invites()
from public, anon;

grant execute on function
  public.match_contacts(text[], boolean),
  public.create_invites(uuid, text[], uuid),
  public.my_invites()
to authenticated;
