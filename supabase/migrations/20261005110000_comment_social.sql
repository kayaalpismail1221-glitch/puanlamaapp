-- Yorumlarda etkileşim ve "tanıyor olabileceğin kişiler".
--
-- 1) Yanıtlar: `comments.parent_id` yanıtlanan yorumu tutar (yanıtın yanıtı da olabilir; uygulama ilk yoruma göre
--    gruplar). Yanıtlanan yorumun yazarına 'reply' bildirimi gider; gönderi sahibi ayrıca 'comment' alır.
-- 2) Yorum beğenme: `comment_likes`, sayaç `comments.like_count`, yazara 'comment_like' bildirimi.
-- 3) Tanıyor olabileceğin kişiler (bildirim merkezi): seni takip edenler, rehberindekiler, birlikte etiketlendiklerin,
--    ortak arkadaşlar, gönderilerinle etkileşenler, okul arkadaşları; gerekçesiyle birlikte. ✕ ile gizlenen kişi
--    (`suggestion_dismissals`) bir daha hiçbir öneri listesinde çıkmaz.

-- ---------------------------------------------------------------------------
-- Yanıtlar
-- ---------------------------------------------------------------------------

alter table public.comments
  add column parent_id uuid references public.comments (id) on delete cascade,
  add column like_count integer not null default 0;

create index comments_parent_idx on public.comments (parent_id) where parent_id is not null;

/** Yanıt aynı gönderideki bir yoruma verilir; engelli çiftler birbirine yanıt veremez */
create or replace function public.check_comment_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent public.comments;
begin
  if new.parent_id is null then
    return new;
  end if;
  select * into parent from public.comments where id = new.parent_id;
  if not found or parent.post_id <> new.post_id then
    raise exception 'Yanıtlanan yorum bulunamadı' using errcode = 'P0002';
  end if;
  if public.is_blocked_between(new.user_id, parent.user_id) then
    raise exception 'Bu yoruma yanıt veremezsin' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger comments_parent before insert on public.comments
  for each row execute function public.check_comment_parent();

-- ---------------------------------------------------------------------------
-- Yorum beğenme
-- ---------------------------------------------------------------------------

create table public.comment_likes (
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index comment_likes_user_idx on public.comment_likes (user_id, created_at);

create trigger comment_likes_daily_limit before insert on public.comment_likes
  for each row execute function public.enforce_daily_limit('user_id', '1000', 'yorum beğenme');

/** Sayaç ve bildirim; beğeni geri alınınca bildirimi de kalkar */
create or replace function public.on_comment_like_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.comments;
begin
  if tg_op = 'INSERT' then
    update public.comments set like_count = like_count + 1 where id = new.comment_id returning * into c;
    perform public.notify(c.user_id, new.user_id, 'comment_like', c.post_id, c.id);
  else
    update public.comments set like_count = greatest(like_count - 1, 0) where id = old.comment_id;
    delete from public.notifications
    where type = 'comment_like' and actor_id = old.user_id and comment_id = old.comment_id;
  end if;
  return null;
end;
$$;

create trigger comment_likes_change after insert or delete on public.comment_likes
  for each row execute function public.on_comment_like_change();

alter table public.comment_likes enable row level security;

-- Kimin beğendiği gösterilmez; herkes yalnızca kendi beğenisini görür (sayı `like_count`'ta)
create policy "Kendi yorum beğenilerini görür" on public.comment_likes
  for select to authenticated using (user_id = (select auth.uid()));

create policy "Kendi adına yorum beğenir" on public.comment_likes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.comments c
      where c.id = comment_id and not public.is_blocked_between((select auth.uid()), c.user_id)
    )
  );

create policy "Yorum beğenisini geri alır" on public.comment_likes
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Bildirimler
-- ---------------------------------------------------------------------------

-- Tekrar koruması yorum bazında (aynı kişinin aynı gönderideki iki yorumu beğenmesi iki bildirim);
-- yorumlar ve yanıtlar her seferinde ayrı bildirim
drop index public.notifications_once;
create unique index notifications_once on public.notifications (
  user_id, actor_id, type, coalesce(comment_id, post_id, place_id, '00000000-0000-0000-0000-000000000000'::uuid)
) where type not in ('comment', 'reply');

/** Yanıt: yanıtlanan yorumun yazarına 'reply'; gönderi sahibine (o değilse) 'comment' */
create or replace function public.on_comment_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_owner uuid := (select user_id from public.posts where id = new.post_id);
  parent_author uuid := (select user_id from public.comments where id = new.parent_id);
begin
  if parent_author is not null then
    perform public.notify(parent_author, new.user_id, 'reply', new.post_id, new.id);
  end if;
  if post_owner is distinct from parent_author then
    perform public.notify(post_owner, new.user_id, 'comment', new.post_id, new.id);
  end if;
  return null;
end;
$$;

/** Push metni; yeni türler: comment_like, reply */
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
  body text := (select c.body from public.comments c where c.id = n.comment_id);
  theirs numeric;
  mine numeric;
begin
  if char_length(body) > 80 then body := left(body, 79) || '…'; end if;
  case n.type
    when 'friend_joined' then
      if place is not null then
        return case when locale = 'tr' then 'Davet ettiğin ' || actor || ' Puanla''ya katıldı. Bakalım ' || place || '''a kaç verecek?'
                    else actor || ' joined Puanla from your invite. Let''s see what they give ' || place || '.' end;
      end if;
      return case when locale = 'tr' then 'Rehberindeki ' || actor || ' Puanla''ya katıldı'
                  else actor || ' from your contacts joined Puanla' end;
    when 'like' then
      return case when locale = 'tr' then actor || ' gönderini beğendi · ' || place
                  else actor || ' liked your post · ' || place end;
    when 'comment' then
      return case when locale = 'tr' then actor || ' yorum yaptı: “' || body || '”'
                  else actor || ' commented: “' || body || '”' end;
    when 'reply' then
      return case when locale = 'tr' then actor || ' yorumuna yanıt verdi: “' || body || '”'
                  else actor || ' replied to your comment: “' || body || '”' end;
    when 'comment_like' then
      return case when locale = 'tr' then actor || ' yorumunu beğendi: “' || body || '”'
                  else actor || ' liked your comment: “' || body || '”' end;
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

-- ---------------------------------------------------------------------------
-- Yorum görünümü
-- ---------------------------------------------------------------------------

/** Yorum ve yazarı; yanıtlanan yorum, beğeni sayısı ve benim beğenim (yeni sütunlar sonda) */
create or replace view public.comment_view with (security_invoker = true) as
select
  c.id,
  c.post_id,
  c.user_id,
  c.body,
  c.created_at,
  (select public.profile_json(u) from public.profiles u where u.id = c.user_id) as author,
  c.parent_id,
  c.like_count,
  exists (
    select 1 from public.comment_likes l where l.comment_id = c.id and l.user_id = (select auth.uid())
  ) as liked_by_me
from public.comments c;

-- ---------------------------------------------------------------------------
-- Tanıyor olabileceğin kişiler
-- ---------------------------------------------------------------------------

/** ✕ ile gizlenen öneriler (yalnızca sahibi görür) */
create table public.suggestion_dismissals (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  dismissed_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, dismissed_id),
  check (user_id <> dismissed_id)
);

alter table public.suggestion_dismissals enable row level security;

create policy "Gizlediği önerileri görür" on public.suggestion_dismissals
  for select to authenticated using (user_id = (select auth.uid()));

create policy "Öneri gizler" on public.suggestion_dismissals
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy "Gizlemeyi geri alır" on public.suggestion_dismissals
  for delete to authenticated using (user_id = (select auth.uid()));

/**
 * Tanıyor olabileceğin kişiler, en güçlü bağ önce. Sinyaller (puan):
 * seni takip ediyor (100), rehberinde ve bulunabilir (80), birlikte etiketlendiniz (30/gönderi, en çok 3),
 * ortak arkadaş (10/kişi, en çok 5), gönderilerini beğendi/yorumladı (5/etkileşim, en çok 4), aynı okul (15).
 * Hiç bağ yoksa Puanla'da popüler olanlarla tamamlanır. Takip ettiklerin, gizlediklerin ve engelli çiftler çıkmaz.
 * `reason`: follows_you | contact | together | mutual | engaged | school | popular.
 * Rehber ve etiket verisine eriştiği için tanımlayıcı yetkisiyle çalışır; yalnızca oturumdaki kullanıcı için.
 */
create or replace function public.people_you_may_know(p_limit integer default 10)
returns table (profile jsonb, reason text, mutual_count integer, mutual_name text)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select p.id, p.school_id from public.profiles p where p.id = auth.uid()
  ),
  follows_me as (
    select f.follower_id as id from me join public.follows f on f.followee_id = me.id
  ),
  contacts as (
    select distinct pp.user_id as id
    from me
    join public.contact_hashes c on c.owner_id = me.id
    join public.profile_private pp on pp.verified_phone_hash = c.phone_hash and pp.discoverable
  ),
  together as (
    -- Gönderimde etiketlediklerim, beni etiketleyenler ve aynı gönderide birlikte etiketlendiklerim
    select id, count(*)::int as n from (
      select pt.user_id as id
      from me join public.posts p on p.user_id = me.id join public.post_tags pt on pt.post_id = p.id
      union all
      select p.user_id
      from me join public.post_tags pt on pt.user_id = me.id join public.posts p on p.id = pt.post_id
      union all
      select other.user_id
      from me
      join public.post_tags mine on mine.user_id = me.id
      join public.post_tags other on other.post_id = mine.post_id and other.user_id <> me.id
    ) t
    group by id
  ),
  mutual as (
    select f2.followee_id as id, count(*)::int as n, min(friend.name) as friend_name
    from me
    join public.follows f1 on f1.follower_id = me.id
    join public.follows f2 on f2.follower_id = f1.followee_id
    join public.profiles friend on friend.id = f1.followee_id
    group by f2.followee_id
  ),
  engaged as (
    select id, count(*)::int as n from (
      select l.user_id as id
      from me join public.posts p on p.user_id = me.id join public.post_likes l on l.post_id = p.id
      union all
      select c.user_id
      from me join public.posts p on p.user_id = me.id join public.comments c on c.post_id = p.id
    ) e
    group by id
  ),
  candidates as (
    select id from follows_me
    union select id from contacts
    union select id from together
    union select id from mutual
    union select id from engaged
    union (select p.id from public.profiles p join me on p.school_id = me.school_id limit 200)
    union (select p.id from public.profiles p order by p.follower_count desc, p.post_count desc limit 50)
  ),
  scored as (
    select
      u as prof,
      u.post_count,
      u.follower_count,
      exists (select 1 from follows_me x where x.id = u.id) as follows,
      exists (select 1 from contacts x where x.id = u.id) as in_contacts,
      coalesce(t.n, 0) as together_n,
      coalesce(m.n, 0) as mutual_n,
      m.friend_name,
      coalesce(e.n, 0) as engaged_n,
      coalesce(u.school_id is not null and u.school_id = me.school_id, false) as same_school
    from candidates cand
    join public.profiles u on u.id = cand.id
    cross join me
    left join together t on t.id = u.id
    left join mutual m on m.id = u.id
    left join engaged e on e.id = u.id
    where u.id <> me.id
      and not exists (select 1 from public.follows f where f.follower_id = me.id and f.followee_id = u.id)
      and not exists (select 1 from public.suggestion_dismissals d where d.user_id = me.id and d.dismissed_id = u.id)
      and not public.is_blocked_between(me.id, u.id)
  )
  select
    public.profile_json(s.prof),
    case
      when s.follows then 'follows_you'
      when s.in_contacts then 'contact'
      when s.together_n > 0 then 'together'
      when s.mutual_n > 0 then 'mutual'
      when s.engaged_n > 0 then 'engaged'
      when s.same_school then 'school'
      else 'popular'
    end,
    s.mutual_n,
    s.friend_name
  from scored s
  order by
    (case when s.follows then 100 else 0 end)
      + (case when s.in_contacts then 80 else 0 end)
      + 30 * least(s.together_n, 3)
      + 10 * least(s.mutual_n, 5)
      + 5 * least(s.engaged_n, 4)
      + (case when s.same_school then 15 else 0 end) desc,
    s.post_count desc,
    s.follower_count desc
  limit least(greatest(p_limit, 1), 50)
$$;

/** Arama ve onboarding'deki takip önerileri; gizlenen kişiler artık çıkmaz */
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
    and not exists (
      select 1 from public.suggestion_dismissals d where d.user_id = auth.uid() and d.dismissed_id = v.id
    )
  order by
    (v.school_id is not null and v.school_id = me.school_id) desc,
    coalesce(m.n, 0) desc,
    v.post_count desc,
    v.follower_count desc
  limit least(greatest(p_limit, 1), 100)
$$;

-- ---------------------------------------------------------------------------
-- Yetkiler
-- ---------------------------------------------------------------------------

revoke all on public.comment_likes, public.suggestion_dismissals from anon, authenticated;
grant select, insert, delete on public.comment_likes to authenticated;
grant select, insert, delete on public.suggestion_dismissals to authenticated;

-- Yorum eklerken yanıtlanan yorum da yazılabilir; sayaç (`like_count`) yazılamaz
revoke insert on public.comments from authenticated;
grant insert (post_id, body, parent_id) on public.comments to authenticated;

revoke execute on function public.people_you_may_know(integer) from public, anon;
grant execute on function public.people_you_may_know(integer) to authenticated;

revoke execute on function
  public.check_comment_parent(),
  public.on_comment_like_change()
from public, anon, authenticated;
