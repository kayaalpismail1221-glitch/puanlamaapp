-- Birinci taraf büyüme ölçümü: paylaşımlar kaydedilir, viral katsayı (K) ve huni ölçülebilir olur.
-- Üçüncü taraf analiz SDK'sı yok (CLAUDE.md "Büyüme" 5. ilke). Kayıt yalnızca paylaşım anında ve yalnızca
-- ne paylaşıldığı (tür + kimlik), kanalın ne olduğu (sistem menüsü, WhatsApp…) ve paylaşımın tamamlanıp
-- tamamlanmadığı; mesaj metni ya da alıcı saklanmaz.

create table public.share_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in (
    'profile', 'post', 'place', 'list', 'taste', 'goal', 'invite', 'story', 'map'
  )),
  -- Paylaşılanın kimliği (gönderi, mekân, liste…) ya da hikâye kartının türü
  target text check (char_length(target) <= 100),
  channel text not null default 'sheet' check (channel in ('sheet', 'whatsapp', 'sms', 'messages', 'save', 'copy')),
  -- Sistem menüsü paylaşımın yapıldığını bildirdiyse true; bilinmiyorsa null
  completed boolean,
  created_at timestamptz not null default now()
);

create index share_events_user_idx on public.share_events (user_id, created_at desc);
create index share_events_created_idx on public.share_events (created_at);

alter table public.share_events enable row level security;
-- İstemci yalnızca `log_share` ile yazar; kimse okumaz (özet yönetim fonksiyonundan)
revoke all on public.share_events from public, anon, authenticated;

/** Paylaşımı kaydeder (günde en fazla 200; fazlası sessizce yok sayılır, paylaşımı hiç engellemez) */
create or replace function public.log_share(
  p_kind text,
  p_target text default null,
  p_channel text default 'sheet',
  p_completed boolean default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Giriş yapman gerekiyor' using errcode = '42501';
  end if;
  if (
    select count(*) from public.share_events
    where user_id = uid and created_at > now() - interval '1 day'
  ) >= 200 then
    return;
  end if;
  insert into public.share_events (user_id, kind, target, channel, completed)
  values (uid, p_kind, left(p_target, 100), coalesce(p_channel, 'sheet'), p_completed);
end;
$$;

/**
 * Yönetim: son `p_days` gündeki büyüme hunisi (tek JSON).
 * - aktif: dönemde puanlayan ya da gönderi paylaşan · yeni: dönemde katılan
 * - aktivasyon: yeni kullanıcılardan ilk 7 günde ≥ 3 puan ve ≥ 3 takip yapanların oranı
 * - paylaşım: toplam, tamamlanan, paylaşan kişi, türe göre · davet: gönderilen telefon davetleri
 * - davetle gelen: dönemde katılıp davet edeni bilinen (profildeki "Seni kim davet etti?" ya da telefon daveti)
 * - k: davetle gelen / aktif — bir aktif kullanıcının dönemde getirdiği yeni kullanıcı (viral katsayı tahmini)
 */
create or replace function public.growth_stats(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  since timestamptz := now() - make_interval(days => least(greatest(p_days, 1), 365));
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Yalnızca yöneticiler' using errcode = '42501';
  end if;

  with active as (
    select user_id from public.rankings where rated_at >= since
    union
    select user_id from public.posts where created_at >= since
  ),
  fresh as (
    select id, created_at from public.profiles where created_at >= since
  ),
  activated as (
    select f.id from fresh f
    where (select count(*) from public.rankings r
           where r.user_id = f.id and r.rated_at < f.created_at + interval '7 days') >= 3
      and (select count(*) from public.follows fo
           where fo.follower_id = f.id and fo.created_at < f.created_at + interval '7 days') >= 3
  ),
  invited as (
    select f.id from fresh f
    where exists (select 1 from public.profile_private pp where pp.user_id = f.id and pp.invited_by is not null)
       or exists (select 1 from public.invites i where i.joined_user_id = f.id)
  ),
  shares as (
    select * from public.share_events where created_at >= since
  )
  select jsonb_build_object(
    'days', least(greatest(p_days, 1), 365),
    'active_users', (select count(*) from active),
    'new_users', (select count(*) from fresh),
    'activated', (select count(*) from activated),
    'activation_rate', round((select count(*) from activated)::numeric / nullif((select count(*) from fresh), 0), 3),
    'shares', (select count(*) from shares),
    'shares_completed', (select count(*) from shares where completed),
    'sharers', (select count(distinct user_id) from shares),
    'shares_by_kind', coalesce(
      (select jsonb_object_agg(kind, n) from (select kind, count(*) as n from shares group by kind) k), '{}'
    ),
    'phone_invites', (select count(*) from public.invites where created_at >= since),
    'invited_joins', (select count(*) from invited),
    'k', round((select count(*) from invited)::numeric / nullif((select count(*) from active), 0), 3)
  ) into result;
  return result;
end;
$$;

revoke execute on function public.log_share(text, text, text, boolean), public.growth_stats(integer) from public, anon;
grant execute on function public.log_share(text, text, text, boolean), public.growth_stats(integer) to authenticated;
