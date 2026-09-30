-- XP sayaçları: lig ve profildeki "Sıralama" artık her çağrıda tüm puan/gönderi/beğeniyi toplamıyor.
--
-- Neden: `xp_totals` her açılışta tüm tabloları topluyordu (yük testinde 20 bin kullanıcıyla 1–1,75 sn, veriyle
-- doğrusal artıyor); lig ekranı ilk kırılacak yerdi. Artık XP bileşenleri olay anında tetikleyicilerle
-- `xp_all` (tüm zamanlar) ve `xp_monthly` (İstanbul ayı) sayaçlarına yazılır, lig ve sıra indeksten okunur.
--
-- Kurallar değişmedi (20261008100000_xp ve `src/lib/xp.ts`): puanlama +10 (günde en fazla 20), gönderi +20,
-- fotoğraflı gönderi +20 ek, başkasından gelen beğeni +2, davet +100, davetle katılana +50. Silinen olayın
-- XP'si yine düşer (sayaç geri alınır). `xp_totals` doğruluk referansı olarak kalır; testler sayaçların onunla
-- birebir tuttuğunu denetler.

begin;

create table public.xp_all (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  ratings integer not null default 0,
  posts integer not null default 0,
  photo_posts integer not null default 0,
  likes integer not null default 0,
  invites integer not null default 0,
  welcome integer not null default 0,
  xp integer generated always as (
    ratings * 10 + posts * 20 + photo_posts * 20 + likes * 2 + invites * 100 + welcome * 50
  ) stored
);

create index xp_all_rank_idx on public.xp_all (xp desc) where xp > 0;

/** `month`: İstanbul saatiyle ayın ilk günü */
create table public.xp_monthly (
  month date not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  ratings integer not null default 0,
  posts integer not null default 0,
  photo_posts integer not null default 0,
  likes integer not null default 0,
  invites integer not null default 0,
  welcome integer not null default 0,
  xp integer generated always as (
    ratings * 10 + posts * 20 + photo_posts * 20 + likes * 2 + invites * 100 + welcome * 50
  ) stored,
  primary key (month, user_id)
);

create index xp_monthly_rank_idx on public.xp_monthly (month, xp desc) where xp > 0;
create index xp_monthly_user_idx on public.xp_monthly (user_id);

/** Günlük puanlama sayısı (günde 20 sınırı için) */
create table public.xp_rating_days (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  n integer not null default 0,
  primary key (user_id, day)
);

/** XP'ye sayılan davetler: davetli ilk puanını verince eklenir, koşul bozulunca silinir */
create table public.xp_invite_credits (
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  at timestamptz not null,
  primary key (inviter_id, invitee_id)
);

create index xp_invite_credits_invitee_idx on public.xp_invite_credits (invitee_id);

/** Davetle katılanın hoş geldin XP'si */
create table public.xp_welcome_credits (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  at timestamptz not null
);

-- Sayaçları yalnızca tetikleyiciler yazar; kimse doğrudan okumaz (lig fonksiyonları tanımlayıcı yetkisiyle)
alter table public.xp_all enable row level security;
alter table public.xp_monthly enable row level security;
alter table public.xp_rating_days enable row level security;
alter table public.xp_invite_credits enable row level security;
alter table public.xp_welcome_credits enable row level security;
revoke all on public.xp_all, public.xp_monthly, public.xp_rating_days, public.xp_invite_credits,
  public.xp_welcome_credits from public, anon, authenticated;

/** Olay anının İstanbul ayı (aylık tablo `month_start()` ile aynı sınırı kullanır) */
create or replace function public.xp_month_of(p_at timestamptz)
returns date
language sql
stable
parallel safe
set search_path = ''
as $$
  select date_trunc('month', p_at at time zone 'Europe/Istanbul')::date
$$;

/**
 * XP bileşenlerini hem tüm zamanlar hem olayın ayı için artırır/azaltır. Profil silinirken (zincirleme
 * silmelerde) sayaç yazılmaz: satırları zaten silinir.
 */
create or replace function public.xp_add(
  p_user_id uuid,
  p_at timestamptz,
  p_ratings integer default 0,
  p_posts integer default 0,
  p_photo_posts integer default 0,
  p_likes integer default 0,
  p_invites integer default 0,
  p_welcome integer default 0
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or not exists (select 1 from public.profiles where id = p_user_id) then
    return;
  end if;

  insert into public.xp_all as x (user_id, ratings, posts, photo_posts, likes, invites, welcome)
  values (p_user_id, p_ratings, p_posts, p_photo_posts, p_likes, p_invites, p_welcome)
  on conflict (user_id) do update set
    ratings = x.ratings + excluded.ratings,
    posts = x.posts + excluded.posts,
    photo_posts = x.photo_posts + excluded.photo_posts,
    likes = x.likes + excluded.likes,
    invites = x.invites + excluded.invites,
    welcome = x.welcome + excluded.welcome;

  insert into public.xp_monthly as x (month, user_id, ratings, posts, photo_posts, likes, invites, welcome)
  values (public.xp_month_of(p_at), p_user_id, p_ratings, p_posts, p_photo_posts, p_likes, p_invites, p_welcome)
  on conflict (month, user_id) do update set
    ratings = x.ratings + excluded.ratings,
    posts = x.posts + excluded.posts,
    photo_posts = x.photo_posts + excluded.photo_posts,
    likes = x.likes + excluded.likes,
    invites = x.invites + excluded.invites,
    welcome = x.welcome + excluded.welcome;
end;
$$;

/**
 * Davetlinin XP'ye sayılan davetlerini ve hoş geldin XP'sini günceller. Koşul `xp_totals` ile aynı: davet eden
 * (profildeki "Seni kim davet etti?" ya da telefonla davet) ve davetli en az bir mekân puanlamış.
 * Kredi satırı eklenince/silinince XP tetikleyiciyle değişir (profil silinince de).
 */
create or replace function public.sync_invite_xp(p_invitee uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  active boolean;
begin
  if p_invitee is null or not exists (select 1 from public.profiles where id = p_invitee) then
    return;
  end if;
  active := exists (select 1 from public.rankings where user_id = p_invitee);

  with desired as (
    select j.inviter_id, min(j.at) as at
    from (
      select pp.invited_by as inviter_id, pr.created_at as at
      from public.profile_private pp
      join public.profiles pr on pr.id = pp.user_id
      where pp.user_id = p_invitee and pp.invited_by is not null
      union all
      select i.inviter_id, i.joined_at
      from public.invites i
      where i.joined_user_id = p_invitee
    ) j
    where active and j.inviter_id <> p_invitee
    group by j.inviter_id
  ),
  gone as (
    delete from public.xp_invite_credits c
    where c.invitee_id = p_invitee and not exists (select 1 from desired d where d.inviter_id = c.inviter_id)
  )
  insert into public.xp_invite_credits (inviter_id, invitee_id, at)
  select d.inviter_id, p_invitee, d.at from desired d
  on conflict (inviter_id, invitee_id) do nothing;

  if active and exists (
    select 1 from public.profile_private where user_id = p_invitee and invited_by is not null
  ) then
    insert into public.xp_welcome_credits (user_id, at)
    select p_invitee, pr.created_at from public.profiles pr where pr.id = p_invitee
    on conflict (user_id) do nothing;
  else
    delete from public.xp_welcome_credits where user_id = p_invitee;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Olay tetikleyicileri
-- ---------------------------------------------------------------------------

/** Puanlama: günlük sayı; ilk 20'si XP; ilk/son puan davet koşulunu değiştirir */
create or replace function public.xp_on_ranking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date;
  v_count integer;
begin
  -- Güncelleme (tarih/kişi değişimi) eskinin silinip yeninin eklenmesi gibi işlenir
  if tg_op in ('DELETE', 'UPDATE') then
    v_day := (old.rated_at at time zone 'Europe/Istanbul')::date;
    update public.xp_rating_days d set n = d.n - 1
    where d.user_id = old.user_id and d.day = v_day
    returning d.n into v_count;
    if found and v_count < 20 then
      perform public.xp_add(old.user_id, old.rated_at, p_ratings => -1);
    end if;
    -- Son puan silindi: davet koşulu bozuldu
    if not exists (select 1 from public.rankings where user_id = old.user_id) then
      perform public.sync_invite_xp(old.user_id);
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') and exists (select 1 from public.profiles where id = new.user_id) then
    v_day := (new.rated_at at time zone 'Europe/Istanbul')::date;
    insert into public.xp_rating_days as d (user_id, day, n) values (new.user_id, v_day, 1)
    on conflict (user_id, day) do update set n = d.n + 1
    returning d.n into v_count;
    if v_count <= 20 then
      perform public.xp_add(new.user_id, new.rated_at, p_ratings => 1);
    end if;
    -- Davetle gelen kişi puanlayınca davet koşulu sağlanır (kredi eklemek tekrarlanabilir, çift saymaz)
    if exists (select 1 from public.profile_private where user_id = new.user_id and invited_by is not null)
       or exists (select 1 from public.invites where joined_user_id = new.user_id) then
      perform public.sync_invite_xp(new.user_id);
    end if;
  end if;
  return null;
end;
$$;

create trigger rankings_xp after insert or delete on public.rankings
  for each row execute function public.xp_on_ranking();
create trigger rankings_xp_update after update of rated_at, user_id on public.rankings
  for each row
  when (old.rated_at is distinct from new.rated_at or old.user_id is distinct from new.user_id)
  execute function public.xp_on_ranking();

/** Gönderi: +20. Silinirken (fotoğraflar ve beğeniler zincirleme silinmeden önce) tüm XP'si geri alınır */
create or replace function public.xp_on_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if tg_op = 'INSERT' then
    perform public.xp_add(new.user_id, new.created_at, p_posts => 1);
    return null;
  end if;

  perform public.xp_add(
    old.user_id,
    old.created_at,
    p_posts => -1,
    p_photo_posts => case when exists (select 1 from public.post_photos where post_id = old.id) then -1 else 0 end
  );
  for r in
    select min(l.created_at) as at, count(*)::int as n
    from public.post_likes l
    where l.post_id = old.id and l.user_id <> old.user_id
    group by public.xp_month_of(l.created_at)
  loop
    perform public.xp_add(old.user_id, r.at, p_likes => -r.n);
  end loop;
  return old;
end;
$$;

create trigger posts_xp_insert after insert on public.posts
  for each row execute function public.xp_on_post();
create trigger posts_xp_delete before delete on public.posts
  for each row execute function public.xp_on_post();

/**
 * Fotoğraflı gönderi: gönderiye ilk fotoğraf(lar) eklenince +20, son fotoğraf silinince −20 (gönderi silinirken
 * değil). Fotoğraflar tek komutla birden çok eklendiği için komut düzeyinde, eklenen/silinen tüm satırlarla bakılır.
 */
create or replace function public.xp_on_photos_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select p.user_id, p.created_at
    from (select distinct post_id from added) a
    join public.posts p on p.id = a.post_id
    -- Bu komuttan önce hiç fotoğrafı yoktu
    where (select count(*) from public.post_photos ph where ph.post_id = a.post_id)
        = (select count(*) from added x where x.post_id = a.post_id)
  loop
    perform public.xp_add(r.user_id, r.created_at, p_photo_posts => 1);
  end loop;
  return null;
end;
$$;

create or replace function public.xp_on_photos_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select p.user_id, p.created_at
    from (select distinct post_id from removed) d
    join public.posts p on p.id = d.post_id
    where not exists (select 1 from public.post_photos ph where ph.post_id = d.post_id)
  loop
    perform public.xp_add(r.user_id, r.created_at, p_photo_posts => -1);
  end loop;
  return null;
end;
$$;

create trigger post_photos_xp_insert after insert on public.post_photos
  referencing new table as added
  for each statement execute function public.xp_on_photos_added();
create trigger post_photos_xp_delete after delete on public.post_photos
  referencing old table as removed
  for each statement execute function public.xp_on_photos_removed();

/** Başkasından gelen beğeni: gönderi sahibine +2 (gönderi silinirken değil) */
create or replace function public.xp_on_like()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  author uuid;
begin
  if tg_op = 'INSERT' then
    select user_id into author from public.posts where id = new.post_id;
    if author is not null and author <> new.user_id then
      perform public.xp_add(author, new.created_at, p_likes => 1);
    end if;
  else
    select user_id into author from public.posts where id = old.post_id;
    if author is not null and author <> old.user_id then
      perform public.xp_add(author, old.created_at, p_likes => -1);
    end if;
  end if;
  return null;
end;
$$;

create trigger post_likes_xp after insert or delete on public.post_likes
  for each row execute function public.xp_on_like();

/** Davet kredileri XP'ye yansır */
create or replace function public.xp_on_invite_credit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.xp_add(new.inviter_id, new.at, p_invites => 1);
  else
    perform public.xp_add(old.inviter_id, old.at, p_invites => -1);
  end if;
  return null;
end;
$$;

create or replace function public.xp_on_welcome_credit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.xp_add(new.user_id, new.at, p_welcome => 1);
  else
    perform public.xp_add(old.user_id, old.at, p_welcome => -1);
  end if;
  return null;
end;
$$;

/** Davet eden değişince (ya da silinince) davetlinin kredileri yeniden hesaplanır */
create or replace function public.xp_on_inviter_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'profile_private' then
    perform public.sync_invite_xp(coalesce(new.user_id, old.user_id));
  else
    if tg_op <> 'INSERT' and old.joined_user_id is not null then
      perform public.sync_invite_xp(old.joined_user_id);
    end if;
    if tg_op <> 'DELETE' and new.joined_user_id is not null
       and new.joined_user_id is distinct from (case when tg_op = 'UPDATE' then old.joined_user_id end) then
      perform public.sync_invite_xp(new.joined_user_id);
    end if;
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Mevcut veriden doldurma (tetikleyiciler kurulmadan önce, aynı işlemde)
-- ---------------------------------------------------------------------------

insert into public.xp_rating_days (user_id, day, n)
select user_id, (rated_at at time zone 'Europe/Istanbul')::date, count(*)::int
from public.rankings
group by 1, 2;

insert into public.xp_invite_credits (inviter_id, invitee_id, at)
select j.inviter_id, j.invitee_id, min(j.at)
from (
  select pp.invited_by as inviter_id, pp.user_id as invitee_id, pr.created_at as at
  from public.profile_private pp
  join public.profiles pr on pr.id = pp.user_id
  where pp.invited_by is not null
  union all
  select i.inviter_id, i.joined_user_id, i.joined_at
  from public.invites i
  where i.joined_user_id is not null
) j
where j.inviter_id <> j.invitee_id
  and exists (select 1 from public.rankings r where r.user_id = j.invitee_id)
group by j.inviter_id, j.invitee_id;

insert into public.xp_welcome_credits (user_id, at)
select pp.user_id, pr.created_at
from public.profile_private pp
join public.profiles pr on pr.id = pp.user_id
where pp.invited_by is not null
  and exists (select 1 from public.rankings r where r.user_id = pp.user_id);

insert into public.xp_all (user_id, ratings, posts, photo_posts, likes, invites, welcome)
select t.user_id, t.ratings, t.posts, t.photo_posts, t.likes, t.invites, t.welcome
from public.xp_totals(null) t;

-- Aylık tablo yalnızca bu ay için doldurulur (lig yalnızca bu ayı gösterir)
insert into public.xp_monthly (month, user_id, ratings, posts, photo_posts, likes, invites, welcome)
select public.xp_month_of(now()), t.user_id, t.ratings, t.posts, t.photo_posts, t.likes, t.invites, t.welcome
from public.xp_totals(public.month_start()) t;

create trigger xp_invite_credits_xp after insert or delete on public.xp_invite_credits
  for each row execute function public.xp_on_invite_credit();
create trigger xp_welcome_credits_xp after insert or delete on public.xp_welcome_credits
  for each row execute function public.xp_on_welcome_credit();
create trigger profile_private_inviter_xp after insert or update of invited_by on public.profile_private
  for each row execute function public.xp_on_inviter_change();
create trigger invites_joined_xp after insert or update of joined_user_id or delete on public.invites
  for each row execute function public.xp_on_inviter_change();

-- ---------------------------------------------------------------------------
-- Lig ve sıra: sayaçlardan, indeksle
-- ---------------------------------------------------------------------------

/**
 * Liderlik tablosu (imza ve sonuç 20261008100000_xp'deki ile aynı; yarışma usulü sıra: 1, 2, 2, 4).
 * Arkadaşlar/okul: küçük üye kümesi, sıra küme içinde (engellenenler hariç). Genel: yalnızca ilk sıralar
 * indeksten okunur (eşikteki eşitler dahil); sıra = senden fazla XP'si olanların sayısı + 1 — profildeki
 * `user_rank` ile aynı; engellenenler listede gösterilmez. Kullanıcının kendi satırı her zaman döner.
 */
create or replace function public.leaderboard(
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
security definer
set search_path = ''
as $$
  with lim as (select least(greatest(p_limit, 1), 500) as n),
  -- Dönemin sayaçları; birleşim satır içi kalır ki her kullanımda indeks seçilsin
  src as not materialized (
    select a.user_id, a.xp, a.ratings, a.posts, a.photo_posts, a.likes, a.invites, a.welcome
    from public.xp_all a
    where p_period <> 'month'
    union all
    select mo.user_id, mo.xp, mo.ratings, mo.posts, mo.photo_posts, mo.likes, mo.invites, mo.welcome
    from public.xp_monthly mo
    where p_period = 'month' and mo.month = public.xp_month_of(now())
  ),
  members as (
    select pr.id from public.profiles pr
    where p_scope in ('friends', 'school')
      and case p_scope
        when 'friends' then pr.id = auth.uid()
          or pr.id in (select f.followee_id from public.follows f where f.follower_id = auth.uid())
        else p_school_id is not null and pr.school_id = p_school_id
      end
      and not public.is_blocked_between(auth.uid(), pr.id)
  ),
  group_ranked as (
    select
      m.id as user_id,
      coalesce(s.xp, 0) as xp,
      rank() over (order by coalesce(s.xp, 0) desc)::int as rank,
      coalesce(s.ratings, 0) as ratings,
      coalesce(s.posts, 0) as posts,
      coalesce(s.photo_posts, 0) as photo_posts,
      coalesce(s.likes, 0) as likes,
      coalesce(s.invites, 0) as invites,
      coalesce(s.welcome, 0) as welcome
    from members m
    left join src s on s.user_id = m.id
  ),
  cutoff as (
    select s.xp from src s
    where p_scope not in ('friends', 'school') and s.xp > 0
    order by s.xp desc
    offset (select n from lim) - 1
    limit 1
  ),
  -- İlk sıralar (eşikteki eşitler dahil): senden fazla XP'si olan herkes bu kümede, sıra küme içinden
  top as (
    select s.user_id, s.xp, s.ratings, s.posts, s.photo_posts, s.likes, s.invites, s.welcome,
      rank() over (order by s.xp desc)::int as rank
    from src s
    where p_scope not in ('friends', 'school') and s.xp > 0 and s.xp >= coalesce((select c.xp from cutoff c), 1)
  ),
  -- Kendi satırın ilk sıralarda değilse: senden fazla XP'si olanların sayısı + 1 (tek sayım, indeksten)
  mine as (
    select auth.uid() as user_id, coalesce(s.xp, 0) as xp, coalesce(s.ratings, 0) as ratings,
      coalesce(s.posts, 0) as posts, coalesce(s.photo_posts, 0) as photo_posts, coalesce(s.likes, 0) as likes,
      coalesce(s.invites, 0) as invites, coalesce(s.welcome, 0) as welcome
    from (select 1) one
    left join src s on s.user_id = auth.uid()
    where p_scope not in ('friends', 'school') and auth.uid() is not null
      and not exists (select 1 from top t where t.user_id = auth.uid())
  ),
  general_ranked as (
    select t.user_id, t.xp, t.rank, t.ratings, t.posts, t.photo_posts, t.likes, t.invites, t.welcome
    from top t
    where not public.is_blocked_between(auth.uid(), t.user_id)
    union all
    select m.user_id, m.xp, (1 + (select count(*) from src o where o.xp > 0 and o.xp > m.xp))::int,
      m.ratings, m.posts, m.photo_posts, m.likes, m.invites, m.welcome
    from mine m
  ),
  ranked as (
    select * from group_ranked
    union all
    select * from general_ranked
  )
  select r.user_id, r.xp, r.rank, public.profile_json(p),
    r.ratings, r.posts, r.photo_posts, r.likes, r.invites, r.welcome
  from ranked r
  join public.profiles p on p.id = r.user_id
  where r.rank <= (select n from lim) or r.user_id = auth.uid()
  order by r.rank, p.name
$$;

/** Genel (tüm zamanlar) XP sıralamasındaki yer; hiç XP'si yoksa null (profildeki "Sıralama") */
create or replace function public.user_rank(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (1 + (select count(*) from public.xp_all o where o.xp > 0 and o.xp > me.xp))::int
  from public.xp_all me
  where me.user_id = p_user_id and me.xp > 0 and auth.uid() is not null
$$;

revoke execute on function
  public.xp_month_of(timestamptz),
  public.xp_add(uuid, timestamptz, integer, integer, integer, integer, integer, integer),
  public.sync_invite_xp(uuid),
  public.xp_on_ranking(),
  public.xp_on_post(),
  public.xp_on_photos_added(),
  public.xp_on_photos_removed(),
  public.xp_on_like(),
  public.xp_on_invite_credit(),
  public.xp_on_welcome_credit(),
  public.xp_on_inviter_change()
from public, anon, authenticated;
revoke execute on function public.leaderboard(text, text, text, integer), public.user_rank(uuid) from public, anon;
grant execute on function public.leaderboard(text, text, text, integer), public.user_rank(uuid) to authenticated;

commit;
