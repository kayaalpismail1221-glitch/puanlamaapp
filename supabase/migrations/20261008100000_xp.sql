-- XP sistemi: liderlik tablosu gönderi sayısı yerine XP'ye göre.
--
-- Kurallar (uygulamadaki `src/lib/xp.ts` ile aynı):
--   mekân puanla +10 (günde en fazla 20 puanlama sayılır) · gönderi +20 · fotoğraflı gönderi +20 ek ·
--   gönderine gelen beğeni +2 (kendi beğenin sayılmaz) · davet ettiğin arkadaş katılıp ilk puanını verince +100 ·
--   davetle katılana (ilk puanından sonra) hoş geldin +50.
-- XP ayrı tutulmaz, mevcut veriden hesaplanır: gönderi silinince XP'si de düşer, sayaç şişirilemez.
--
-- Davet eden: yeni kullanıcı ilk 30 gün içinde "Seni kim davet etti?" ile kullanıcı adını bir kez yazar
-- (`set_inviter`, `profile_private.invited_by`, yalnızca sahibi görür). Telefonla davet (`invites.joined_user_id`)
-- SMS doğrulaması açılınca aynı kurala girer.

alter table public.profile_private add column invited_by uuid references public.profiles (id) on delete set null;

/**
 * Kullanıcı başına XP ve kırılımı; `p_since` verilirse o andan sonra kazanılanlar (aylık tablo).
 * Tanımlayıcı yetkisiyle çalışır (davetler ve gizli davet eden bilgisi); yalnızca toplamlar döner.
 */
create or replace function public.xp_totals(p_since timestamptz default null)
returns table (
  user_id uuid,
  xp integer,
  ratings integer,
  posts integer,
  photo_posts integer,
  likes integer,
  invites integer,
  welcome integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with rating_days as (
    select r.user_id, least(count(*), 20)::int as n
    from public.rankings r
    where p_since is null or r.rated_at >= p_since
    group by r.user_id, (r.rated_at at time zone 'Europe/Istanbul')::date
  ),
  ratings as (
    select d.user_id, sum(d.n)::int as n from rating_days d group by d.user_id
  ),
  posts as (
    select
      p.user_id,
      count(*)::int as n,
      (count(*) filter (where exists (select 1 from public.post_photos ph where ph.post_id = p.id)))::int as photo
    from public.posts p
    where p_since is null or p.created_at >= p_since
    group by p.user_id
  ),
  likes as (
    select p.user_id, count(*)::int as n
    from public.post_likes l
    join public.posts p on p.id = l.post_id
    where l.user_id <> p.user_id and (p_since is null or l.created_at >= p_since)
    group by p.user_id
  ),
  -- Davetli ancak ilk puanını verince sayılır (sahte hesapla XP toplanmasın)
  active as (
    select distinct r.user_id from public.rankings r
  ),
  joined as (
    select pp.invited_by as inviter_id, pp.user_id as invitee_id, pr.created_at as at
    from public.profile_private pp
    join public.profiles pr on pr.id = pp.user_id
    where pp.invited_by is not null
    union
    select i.inviter_id, i.joined_user_id, i.joined_at
    from public.invites i
    where i.joined_user_id is not null
  ),
  invites as (
    select j.inviter_id as user_id, count(distinct j.invitee_id)::int as n
    from joined j
    join active a on a.user_id = j.invitee_id
    where j.inviter_id <> j.invitee_id and (p_since is null or j.at >= p_since)
    group by j.inviter_id
  ),
  welcome as (
    select pp.user_id, 1 as n
    from public.profile_private pp
    join public.profiles pr on pr.id = pp.user_id
    join active a on a.user_id = pp.user_id
    where pp.invited_by is not null and (p_since is null or pr.created_at >= p_since)
  ),
  everyone as (
    select ratings.user_id from ratings
    union select posts.user_id from posts
    union select likes.user_id from likes
    union select invites.user_id from invites
    union select welcome.user_id from welcome
  )
  select
    e.user_id,
    (
      coalesce(r.n, 0) * 10
      + coalesce(p.n, 0) * 20
      + coalesce(p.photo, 0) * 20
      + coalesce(l.n, 0) * 2
      + coalesce(i.n, 0) * 100
      + coalesce(w.n, 0) * 50
    )::int,
    coalesce(r.n, 0),
    coalesce(p.n, 0),
    coalesce(p.photo, 0),
    coalesce(l.n, 0),
    coalesce(i.n, 0),
    coalesce(w.n, 0)
  from everyone e
  left join ratings r on r.user_id = e.user_id
  left join posts p on p.user_id = e.user_id
  left join likes l on l.user_id = e.user_id
  left join invites i on i.user_id = e.user_id
  left join welcome w on w.user_id = e.user_id
$$;

/** Ayın başı (İstanbul saatiyle); aylık tablo bu andan sonraki XP'yi sayar */
create or replace function public.month_start()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select date_trunc('month', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul'
$$;

/**
 * Liderlik tablosu, XP'ye göre (yarışma usulü sıra: 1, 2, 2, 4). Kapsam: genel (XP'si olanlar), arkadaşlar
 * (takip ettiklerin ve sen), okul. Dönem: tüm zamanlar ya da bu ay. Kullanıcının kendi satırı her zaman döner.
 */
drop function public.leaderboard(text, text, text, integer);

create function public.leaderboard(
  p_scope text default 'all',
  p_period text default 'all',
  p_school_id text default null,
  p_limit integer default 100
)
returns table (
  user_id uuid,
  xp integer,
  rank integer,
  profile jsonb,
  ratings integer,
  posts integer,
  photo_posts integer,
  likes integer,
  invites integer,
  welcome integer
)
language sql
stable
set search_path = ''
as $$
  with totals as (
    select * from public.xp_totals(case when p_period = 'month' then public.month_start() end)
  ),
  members as (
    select pr.id from public.profiles pr
    where case p_scope
      when 'friends' then pr.id = auth.uid()
        or pr.id in (select f.followee_id from public.follows f where f.follower_id = auth.uid())
      when 'school' then p_school_id is not null and pr.school_id = p_school_id
      else pr.id = auth.uid() or pr.id in (select t.user_id from totals t where t.xp > 0)
    end
  ),
  ranked as (
    select
      m.id as user_id,
      coalesce(t.xp, 0) as xp,
      rank() over (order by coalesce(t.xp, 0) desc)::int as rank,
      coalesce(t.ratings, 0) as ratings,
      coalesce(t.posts, 0) as posts,
      coalesce(t.photo_posts, 0) as photo_posts,
      coalesce(t.likes, 0) as likes,
      coalesce(t.invites, 0) as invites,
      coalesce(t.welcome, 0) as welcome
    from members m
    left join totals t on t.user_id = m.id
    where not public.is_blocked_between(auth.uid(), m.id)
  )
  select
    r.user_id, r.xp, r.rank, public.profile_json(p),
    r.ratings, r.posts, r.photo_posts, r.likes, r.invites, r.welcome
  from ranked r
  join public.profiles p on p.id = r.user_id
  where r.rank <= least(greatest(p_limit, 1), 500) or r.user_id = auth.uid()
  order by r.rank, p.name
$$;

/** Genel (tüm zamanlar) XP sıralamasındaki yer; hiç XP'si yoksa null (profildeki "Sıralama") */
create or replace function public.user_rank(p_user_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  with totals as (select * from public.xp_totals(null))
  select (1 + (select count(*) from totals t where t.xp > me.xp))::int
  from totals me
  where me.user_id = p_user_id and me.xp > 0
$$;

/**
 * "Seni kim davet etti?": ilk 30 gün içinde, bir kez. Davet eden senden önce katılmış olmalı.
 * Davet edenin profil bilgisini döner.
 */
create or replace function public.set_inviter(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles;
  inviter public.profiles;
begin
  select * into me from public.profiles where id = auth.uid();
  if not found then
    raise exception 'Giriş yapman gerekiyor' using errcode = '42501';
  end if;
  if exists (select 1 from public.profile_private where user_id = me.id and invited_by is not null) then
    raise exception 'Seni davet eden zaten kayıtlı' using errcode = 'P0001', hint = 'already_set';
  end if;
  if me.created_at < now() - interval '30 days' then
    raise exception 'Davet eden yalnızca katıldığın ilk 30 günde eklenebilir' using errcode = 'P0001', hint = 'too_late';
  end if;
  select * into inviter from public.profiles where username = lower(btrim(ltrim(coalesce(p_username, ''), ' @')));
  if not found or inviter.id = me.id or public.is_blocked_between(me.id, inviter.id) then
    raise exception 'Bu kullanıcı adı bulunamadı' using errcode = 'P0002';
  end if;
  if inviter.created_at >= me.created_at then
    raise exception 'Senden sonra katılan biri seni davet etmiş olamaz' using errcode = 'P0001', hint = 'newer';
  end if;

  insert into public.profile_private (user_id, invited_by) values (me.id, inviter.id)
  on conflict (user_id) do update set invited_by = excluded.invited_by;
  return public.profile_json(inviter);
end;
$$;

revoke execute on function public.xp_totals(timestamptz), public.month_start() from public, anon;
grant execute on function public.xp_totals(timestamptz), public.month_start() to authenticated;
revoke execute on function public.set_inviter(text) from public, anon;
grant execute on function public.set_inviter(text) to authenticated;
-- Yeniden oluşturulan fonksiyonun yetkileri (Supabase varsayılanı anon'a da açar)
revoke execute on function public.leaderboard(text, text, text, integer) from public, anon;
grant execute on function public.leaderboard(text, text, text, integer) to authenticated;
