-- Bildirim ve push spamına karşı (güvenlik taraması 2026-10-09, kullanıcı onayladı).
--
-- Sorun: beğeni, takip, yorum beğenisi, etiket ve "arkadaşın puanladı" geri alınınca bildirim siliniyor; tekrar
-- yapılınca yeni bildirim ve push gidiyordu. Beğen-geri al / takip et-bırak / puanla-kaldır döngüsüyle bir kişiye
-- (puanlamada tüm takipçilere) sınırsız push atılabiliyordu. Takip ve beğenide günlük sınır da yoktu.
--
-- Çözüm:
--   * Aynı kişiden aynı kişiye, aynı türde ve aynı hedef (gönderi/yorum/mekân) için push 24 saatte bir kez
--     (`notification_throttle`). Bildirim kutusundaki kayıt eskisi gibi oluşur (geri alınca silinir, tekrar yapınca
--     yine görünür); yalnızca push gitmez. Yorum ve yanıt her biri ayrı içerik olduğundan sınırlanmaz (günde 300 yorum).
--   * Günlük sınır: takip 300, gönderi beğenisi 1000.

create table public.notification_throttle (
  user_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid not null references public.profiles (id) on delete cascade,
  type public.notification_type not null,
  target uuid not null,
  last_at timestamptz not null default now(),
  primary key (user_id, actor_id, type, target)
);

create index notification_throttle_actor_idx on public.notification_throttle (actor_id);
create index notification_throttle_last_idx on public.notification_throttle (last_at);
alter table public.notification_throttle enable row level security;
revoke all on public.notification_throttle from public, anon, authenticated;

/**
 * 20260930100000_notifications'taki tanımın aynısı; ek olarak tekrarlanabilen türlerde son 24 saatte push gittiyse
 * bu işlemde push'u kapatır (işlem yerel ayarı; push tetikleyicisi okur, ekleme bitince sıfırlanır).
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
declare
  throttled boolean := false;
begin
  if auth.uid() is null or p_user_id is null or p_user_id = p_actor_id
     or public.is_blocked_between(p_user_id, p_actor_id) then
    return;
  end if;

  if p_type not in ('comment', 'reply') then
    insert into public.notification_throttle as t (user_id, actor_id, type, target, last_at)
    values (
      p_user_id, p_actor_id, p_type,
      coalesce(p_comment_id, p_post_id, p_place_id, '00000000-0000-0000-0000-000000000000'::uuid),
      now()
    )
    on conflict (user_id, actor_id, type, target) do update set last_at = now()
      where t.last_at < now() - interval '24 hours';
    -- Satır eklenmedi ve güncellenmediyse son 24 saatte push gitmiş
    throttled := not found;
  end if;

  perform set_config('expeat.push_throttled', case when throttled then 'on' else '' end, true);
  insert into public.notifications (user_id, actor_id, type, post_id, comment_id, place_id)
  values (p_user_id, p_actor_id, p_type, p_post_id, p_comment_id, p_place_id)
  on conflict do nothing;
  perform set_config('expeat.push_throttled', '', true);
end;
$$;

revoke execute on function public.notify(uuid, uuid, public.notification_type, uuid, uuid, uuid) from public, anon, authenticated;

-- Push: 20261019100000_push_token_cleanup'taki tanımın aynısı; ek olarak notify'ın işaretlediği tekrarlar atlanır
create or replace function public.on_notification_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  messages jsonb;
  tokens text[];
  unread integer;
  request bigint;
begin
  -- Son 24 saatte aynı bildirim gittiyse (geri alıp tekrar yapma) kayıt durur ama push gitmez (notify işaretler)
  if coalesce(current_setting('expeat.push_throttled', true), '') = 'on' then
    return null;
  end if;
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
  select
    jsonb_agg(jsonb_build_object(
      'to', t.token,
      'body', public.notification_text(new, t.locale),
      'sound', 'default',
      'badge', unread,
      'data', jsonb_build_object('path', public.notification_path(new), 'id', new.id)
    ) order by t.token),
    array_agg(t.token order by t.token)
  into messages, tokens
  from public.push_tokens t
  where t.user_id = new.user_id;

  if messages is not null then
    execute 'select net.http_post(url := $1, body := $2)'
    into request
    using 'https://exp.host/--/api/v2/push/send', messages;
    insert into public.push_sends (request_id, tokens) values (request, tokens);
  end if;
  return null;
end;
$$;

revoke execute on function public.on_notification_push() from public, anon, authenticated;

create trigger follows_daily_limit before insert on public.follows
  for each row execute function public.enforce_daily_limit('follower_id', '300', 'takip');

create trigger post_likes_daily_limit before insert on public.post_likes
  for each row execute function public.enforce_daily_limit('user_id', '1000', 'beğeni');

/** Bir günden eski sınır kayıtları gereksiz: temizlik */
create or replace function public.notification_throttle_cleanup()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.notification_throttle where last_at < now() - interval '2 days';
$$;

revoke execute on function public.notification_throttle_cleanup() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    execute $cron$select cron.schedule('notification-throttle-cleanup', '17 4 * * *', 'select public.notification_throttle_cleanup()')$cron$;
  end if;
end;
$$;
