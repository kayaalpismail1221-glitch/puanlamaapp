-- Bildirimler: beğeni, yorum, etiket, takip ve "arkadaşın gittiğin yeri puanladı".
-- Bildirim kayıtları tetikleyicilerle oluşur (uygulama yazamaz); push, Expo Push API'ye pg_net ile gönderilir.
-- pg_net olmayan ortamda (testler) push adımı sessizce atlanır, uygulama içi bildirimler yine oluşur.

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
end;
$$;

create type public.notification_type as enum ('like', 'comment', 'tag', 'follow', 'friend_rated');

-- ---------------------------------------------------------------------------
-- Tablolar
-- ---------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  -- Alıcı
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Bildirime sebep olan kişi
  actor_id uuid not null references public.profiles (id) on delete cascade,
  type public.notification_type not null,
  post_id uuid references public.posts (id) on delete cascade,
  comment_id uuid references public.comments (id) on delete cascade,
  place_id uuid references public.places (id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (user_id <> actor_id)
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

-- Aynı kişi aynı gönderiyi/mekânı için bir kez bildirim (yorumlar hariç: her yorum ayrı)
create unique index notifications_once on public.notifications (
  user_id, actor_id, type, coalesce(post_id, place_id, '00000000-0000-0000-0000-000000000000'::uuid)
) where type <> 'comment';

/** Cihazların Expo push jetonları; yalnızca register/unregister fonksiyonlarıyla yazılır */
create table public.push_tokens (
  token text primary key check (token ~ '^Expo(nent)?PushToken\[[^\]]{1,200}\]$'),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Bildirim metinlerinin dili (uygulamadaki dil tercihi)
  locale text not null default 'tr' check (locale in ('tr', 'en')),
  updated_at timestamptz not null default now()
);

create index push_tokens_user_idx on public.push_tokens (user_id);

/** Kullanıcının push almak istemediği türler (uygulama içi bildirim yine oluşur) */
alter table public.profile_private
  add column push_muted public.notification_type[] not null default '{}';

-- ---------------------------------------------------------------------------
-- Bildirim oluşturma
-- ---------------------------------------------------------------------------

/**
 * Tek bildirim ekler. Kendine, engelli çiftler arasında ve yönetici betiklerinde (oturum yok) bildirim yok.
 * Tekrarlar `notifications_once` ile yutulur.
 */
create or replace function public.notify(
  p_user_id uuid,
  p_actor_id uuid,
  p_type public.notification_type,
  p_post_id uuid default null,
  p_comment_id uuid default null,
  p_place_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or p_user_id is null or p_user_id = p_actor_id
     or public.is_blocked_between(p_user_id, p_actor_id) then
    return;
  end if;
  insert into public.notifications (user_id, actor_id, type, post_id, comment_id, place_id)
  values (p_user_id, p_actor_id, p_type, p_post_id, p_comment_id, p_place_id)
  on conflict do nothing;
end;
$$;

/** Beğeni geri alınınca bildirimi de kalkar */
create or replace function public.on_like_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify((select user_id from public.posts where id = new.post_id), new.user_id, 'like', new.post_id);
  else
    delete from public.notifications
    where type = 'like' and actor_id = old.user_id and post_id = old.post_id;
  end if;
  return null;
end;
$$;

create trigger post_likes_notify after insert or delete on public.post_likes
  for each row execute function public.on_like_notify();

/** Yorum silinince bildirimi `comment_id` üzerinden kendiliğinden silinir */
create or replace function public.on_comment_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.notify(
    (select user_id from public.posts where id = new.post_id), new.user_id, 'comment', new.post_id, new.id
  );
  return null;
end;
$$;

create trigger comments_notify after insert on public.comments
  for each row execute function public.on_comment_notify();

create or replace function public.on_tag_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify(new.user_id, (select user_id from public.posts where id = new.post_id), 'tag', new.post_id);
  else
    delete from public.notifications where type = 'tag' and user_id = old.user_id and post_id = old.post_id;
  end if;
  return null;
end;
$$;

create trigger post_tags_notify after insert or delete on public.post_tags
  for each row execute function public.on_tag_notify();

create or replace function public.on_follow_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify(new.followee_id, new.follower_id, 'follow');
  else
    delete from public.notifications
    where type = 'follow' and user_id = old.followee_id and actor_id = old.follower_id;
  end if;
  return null;
end;
$$;

create trigger follows_notify after insert or delete on public.follows
  for each row execute function public.on_follow_notify();

/**
 * "Arkadaşın gittiğin yeri puanladı": puanlayanı takip eden ve o mekânı daha önce puanlamış kişilere.
 * İşlem sonunda çalışır (puanlar `recompute_group_scores` ile kesinleştikten sonra).
 * Yeniden sıralamada tekrar bildirim gitmez (`notifications_once`).
 */
create or replace function public.on_ranking_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  follower uuid;
begin
  if not exists (select 1 from public.rankings where user_id = new.user_id and place_id = new.place_id) then
    return null;
  end if;
  for follower in
    select f.follower_id
    from public.follows f
    join public.rankings r on r.user_id = f.follower_id and r.place_id = new.place_id
    where f.followee_id = new.user_id
  loop
    perform public.notify(follower, new.user_id, 'friend_rated', null, null, new.place_id);
  end loop;
  return null;
end;
$$;

create constraint trigger rankings_notify after insert on public.rankings
  deferrable initially deferred
  for each row execute function public.on_ranking_notify();

-- ---------------------------------------------------------------------------
-- Push gönderimi (Expo Push API, pg_net ile; yanıt beklenmez)
-- ---------------------------------------------------------------------------

/** Puanı dile göre yazar: Türkçede "8,7", İngilizcede "8.7" */
create or replace function public.format_score(score numeric, locale text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when locale = 'tr' then replace(to_char(score, 'FM990.0'), '.', ',') else to_char(score, 'FM990.0') end
$$;

/** Bildirimin push metni (alıcının dilinde) */
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
  end case;
end;
$$;

/** Bildirime dokununca açılacak ekran (Expo Router yolu) */
create or replace function public.notification_path(n public.notifications)
returns text
language sql
immutable
set search_path = ''
as $$
  select case n.type
    when 'follow' then 'kullanici/' || n.actor_id
    when 'friend_rated' then 'mekan/' || n.place_id
    else 'gonderi/' || n.post_id
  end
$$;

create or replace function public.on_notification_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  messages jsonb;
  unread integer;
begin
  -- pg_net yoksa (test ortamı) push atlanır
  if not exists (
    select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'net' and p.proname = 'http_post'
  ) then
    return null;
  end if;
  if exists (select 1 from public.profile_private where user_id = new.user_id and new.type = any (push_muted)) then
    return null;
  end if;

  unread := (select count(*) from public.notifications where user_id = new.user_id and read_at is null);
  select jsonb_agg(jsonb_build_object(
    'to', t.token,
    'body', public.notification_text(new, t.locale),
    'sound', 'default',
    'badge', unread,
    'data', jsonb_build_object('path', public.notification_path(new), 'id', new.id)
  ))
  into messages
  from public.push_tokens t
  where t.user_id = new.user_id;

  if messages is not null then
    execute 'select net.http_post(url := $1, body := $2)'
    using 'https://exp.host/--/api/v2/push/send', messages;
  end if;
  return null;
end;
$$;

create trigger notifications_push after insert on public.notifications
  for each row execute function public.on_notification_push();

-- ---------------------------------------------------------------------------
-- Uygulama API'si
-- ---------------------------------------------------------------------------

/**
 * Bildirim merkezi: en yeniden eskiye, ekranda gereken her şeyle.
 * Engellenen kişilerden gelenler gösterilmez.
 */
create or replace function public.my_notifications(p_before timestamptz default null, p_limit integer default 30)
returns table (
  id uuid,
  type public.notification_type,
  created_at timestamptz,
  read_at timestamptz,
  actor jsonb,
  post_id uuid,
  place_id uuid,
  place_name text,
  photo text,
  comment text,
  score numeric,
  my_score numeric,
  following boolean
)
language sql
stable
set search_path = ''
as $$
  select
    n.id,
    n.type,
    n.created_at,
    n.read_at,
    public.profile_json(a),
    n.post_id,
    pl.id,
    pl.name,
    (select ph.path from public.post_photos ph where ph.post_id = n.post_id order by ph.position limit 1),
    (select c.body from public.comments c where c.id = n.comment_id),
    case when n.type = 'friend_rated'
      then (select r.score from public.rankings r where r.user_id = n.actor_id and r.place_id = n.place_id) end,
    case when n.type = 'friend_rated'
      then (select r.score from public.rankings r where r.user_id = n.user_id and r.place_id = n.place_id) end,
    exists (select 1 from public.follows f where f.follower_id = n.user_id and f.followee_id = n.actor_id)
  from public.notifications n
  join public.profiles a on a.id = n.actor_id
  left join public.places pl on pl.id = coalesce(n.place_id, (select p.place_id from public.posts p where p.id = n.post_id))
  where n.user_id = auth.uid()
    and (p_before is null or n.created_at < p_before)
    and not public.is_blocked_between(n.user_id, n.actor_id)
  order by n.created_at desc
  limit least(greatest(p_limit, 1), 50)
$$;

create or replace function public.unread_notification_count()
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer from public.notifications where user_id = auth.uid() and read_at is null
$$;

create or replace function public.mark_notifications_read()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null
$$;

/** Cihaz jetonunu oturumdaki kullanıcıya bağlar (cihaz başka hesaba geçtiyse devralır) */
create or replace function public.register_push_token(p_token text, p_locale text default 'tr')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Giriş yapman gerekiyor' using errcode = '42501';
  end if;
  insert into public.push_tokens (token, user_id, locale)
  values (p_token, auth.uid(), case when p_locale = 'en' then 'en' else 'tr' end)
  on conflict (token) do update
    set user_id = excluded.user_id, locale = excluded.locale, updated_at = now();
end;
$$;

/** Çıkışta cihaz artık bildirim almaz */
create or replace function public.unregister_push_token(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_tokens where token = p_token and user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- Erişim
-- ---------------------------------------------------------------------------

revoke all on public.notifications, public.push_tokens from anon, authenticated;
grant select on public.notifications to authenticated;

alter table public.notifications enable row level security;
alter table public.push_tokens enable row level security;

create policy "Bildirimlerini yalnızca alıcı görür" on public.notifications
  for select to authenticated using (user_id = auth.uid());

revoke execute on function
  public.notify(uuid, uuid, public.notification_type, uuid, uuid, uuid),
  public.on_like_notify(),
  public.on_comment_notify(),
  public.on_tag_notify(),
  public.on_follow_notify(),
  public.on_ranking_notify(),
  public.on_notification_push(),
  public.notification_text(public.notifications, text),
  public.notification_path(public.notifications),
  public.format_score(numeric, text)
from public, anon, authenticated;

revoke execute on function
  public.my_notifications(timestamptz, integer),
  public.unread_notification_count(),
  public.mark_notifications_read(),
  public.register_push_token(text, text),
  public.unregister_push_token(text)
from public, anon;

grant execute on function
  public.my_notifications(timestamptz, integer),
  public.unread_notification_count(),
  public.mark_notifications_read(),
  public.register_push_token(text, text),
  public.unregister_push_token(text)
to authenticated;
