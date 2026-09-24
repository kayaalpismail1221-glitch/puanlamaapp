-- 1) Telefon numarası artık toplanmıyor (hiçbir özellik kullanmıyordu; App Store 5.1.1 veri minimizasyonu)
-- 2) Yönetici moderasyonu: şikâyet kuyruğu, içerik kaldırma, hesap yasaklama
-- 3) Kişisel öneriler: arkadaşların ve topluluğun beğendiği, henüz gitmediğin mekânlar

-- ---------------------------------------------------------------------------
-- 1) Telefon
-- ---------------------------------------------------------------------------

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
begin
  insert into public.profiles (id, name, username)
  values (
    new.id,
    left(coalesce(display_name, nullif(email_name, ''), 'Puanla kullanıcısı'), 60),
    public.unique_username(coalesce(nullif(meta ->> 'username', ''), display_name, email_name, 'puanla'))
  );
  -- Satır ileride başka özel bilgiler için duruyor; telefon yazılmaz
  insert into public.profile_private (user_id) values (new.id);
  return new;
end;
$$;

-- Daha önce toplanmış numaralar silinir
update public.profile_private set phone = null where phone is not null;

-- ---------------------------------------------------------------------------
-- 2) Yönetici moderasyonu
-- ---------------------------------------------------------------------------

-- Kullanıcı değiştiremez (profiles güncelleme yetkisi listesinde yok); yalnızca SQL ile atanır
alter table public.profiles add column is_admin boolean not null default false;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false)
$$;

/**
 * Bekleyen şikâyetler: her içerik için bir satır (en yeni şikâyet + toplam şikâyet sayısı),
 * içerik önizlemesiyle. Yalnızca yöneticiler.
 */
create or replace function public.admin_reports()
returns table (
  id uuid,
  reason public.report_reason,
  details text,
  created_at timestamptz,
  reporter_username text,
  target_type text,
  target_id uuid,
  post_id uuid,
  author_id uuid,
  author_name text,
  author_username text,
  preview text,
  photo text,
  place_name text,
  report_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Yalnızca yöneticiler' using errcode = '42501';
  end if;
  return query
  select latest.*
  from (
    select distinct on (coalesce(r.post_id, r.comment_id, r.user_id))
      r.id,
      r.reason,
      r.details,
      r.created_at,
      rep.username,
      case when r.post_id is not null then 'post' when r.comment_id is not null then 'comment' else 'user' end,
      coalesce(r.post_id, r.comment_id, r.user_id),
      coalesce(r.post_id, c.post_id),
      au.id,
      au.name,
      au.username,
      coalesce(p.caption, c.body, au.name),
      (select ph.path from public.post_photos ph where ph.post_id = coalesce(r.post_id, c.post_id) and ph.position = 0),
      (select pl.name from public.posts pp join public.places pl on pl.id = pp.place_id where pp.id = coalesce(r.post_id, c.post_id)),
      (
        select count(*)::int from public.reports r2
        where r2.resolved_at is null
          and r2.post_id is not distinct from r.post_id
          and r2.comment_id is not distinct from r.comment_id
          and r2.user_id is not distinct from r.user_id
      )
    from public.reports r
    left join public.profiles rep on rep.id = r.reporter_id
    left join public.posts p on p.id = r.post_id
    left join public.comments c on c.id = r.comment_id
    left join public.profiles au on au.id = coalesce(p.user_id, c.user_id, r.user_id)
    where r.resolved_at is null
    order by coalesce(r.post_id, r.comment_id, r.user_id), r.created_at desc
  ) latest
  order by latest.created_at;
end;
$$;

/**
 * Şikâyeti sonuçlandırır:
 * - dismiss: kural ihlali yok, aynı içeriğin tüm şikâyetleri kapanır
 * - remove:  şikâyet edilen gönderi/yorum silinir
 * - ban:     içerik silinir ve yazarın hesabı kalıcı olarak yasaklanır (giriş yapamaz)
 */
create or replace function public.admin_resolve_report(p_report_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rep public.reports;
  author uuid;
begin
  if not public.is_admin() then
    raise exception 'Yalnızca yöneticiler' using errcode = '42501';
  end if;
  if p_action not in ('dismiss', 'remove', 'ban') then
    raise exception 'Geçersiz işlem' using errcode = '22023';
  end if;
  select * into rep from public.reports where id = p_report_id;
  if not found then
    raise exception 'Şikâyet bulunamadı' using errcode = 'P0002';
  end if;
  author := coalesce(
    (select user_id from public.posts where id = rep.post_id),
    (select user_id from public.comments where id = rep.comment_id),
    rep.user_id
  );

  if p_action = 'ban' and author = auth.uid() then
    raise exception 'Kendi hesabını yasaklayamazsın' using errcode = '22023';
  end if;

  if p_action in ('remove', 'ban') then
    -- Gönderi/yorum silinince ona bağlı şikâyetler de silinir (on delete cascade)
    delete from public.posts where id = rep.post_id;
    delete from public.comments where id = rep.comment_id;
  end if;

  if p_action = 'ban' and author is not null then
    update auth.users set banned_until = 'infinity' where id = author;
    update public.reports set resolved_at = now()
    where resolved_at is null
      and (
        user_id = author
        or post_id in (select id from public.posts where user_id = author)
        or comment_id in (select id from public.comments where user_id = author)
      );
  end if;

  update public.reports set resolved_at = now()
  where resolved_at is null
    and post_id is not distinct from rep.post_id
    and comment_id is not distinct from rep.comment_id
    and user_id is not distinct from rep.user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Kişisel öneriler
-- ---------------------------------------------------------------------------

/**
 * Henüz puanlamadığın, arkadaşlarının (takip ettiklerin) ya da topluluğun beğendiği (ort. ≥ 6,7) mekânlar.
 * Sıralama: arkadaş ortalaması varsa o, yoksa topluluk ortalaması; puan sayısı arttıkça güven artar;
 * en sevdiğin mutfaklara küçük bir bonus; konum verilirse uzaklık cezası (10 km'de 1 puan, en fazla 1,5).
 * Engellediğin/engelleyen kişilerin puanları sayılmaz.
 */
create or replace function public.recommended_places(
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_limit integer default 30
)
returns table (
  id uuid,
  name text,
  cuisine text,
  neighborhood text,
  district text,
  city text,
  price_level smallint,
  latitude double precision,
  longitude double precision,
  photo text,
  friend_average double precision,
  friend_count integer,
  community_average double precision,
  community_count integer,
  distance_km double precision
)
language sql
stable
set search_path = ''
as $$
  with me as (select auth.uid() as id),
  origin as (
    select case
      when p_latitude is not null and p_longitude is not null
      then extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography
    end as g
  ),
  taste as (
    select pl.cuisine, avg(r.score) as avg_score
    from public.rankings r
    join public.places pl on pl.id = r.place_id
    join me on r.user_id = me.id
    group by pl.cuisine
  ),
  stats as (
    select
      r.place_id,
      (avg(r.score) filter (where f.follower_id is not null))::double precision as friend_average,
      (count(*) filter (where f.follower_id is not null))::int as friend_count,
      avg(r.score)::double precision as community_average,
      count(*)::int as community_count
    from public.rankings r
    cross join me
    left join public.follows f on f.follower_id = me.id and f.followee_id = r.user_id
    where r.user_id <> me.id
      and not public.is_blocked_between(me.id, r.user_id)
      and not exists (select 1 from public.rankings mine where mine.user_id = me.id and mine.place_id = r.place_id)
    group by r.place_id
  ),
  scored as (
    select
      s.*,
      case when o.g is not null then extensions.st_distance(pl.location, o.g) / 1000 end as distance,
      coalesce(s.friend_average, s.community_average)
        * (0.75 + 0.25 * least(s.friend_count * 2 + s.community_count, 4) / 4.0)
        + case when t.avg_score >= 7 then 0.4 else 0 end
        - case when o.g is not null then least(extensions.st_distance(pl.location, o.g) / 10000, 1.5) else 0 end
        as rank_score
    from stats s
    join public.places pl on pl.id = s.place_id
    cross join origin o
    left join taste t on t.cuisine = pl.cuisine
    where coalesce(s.friend_average, s.community_average) >= 6.7
  )
  select
    v.id, v.name, v.cuisine, v.neighborhood, v.district, v.city, v.price_level, v.latitude, v.longitude, v.photo,
    sc.friend_average, sc.friend_count, sc.community_average, sc.community_count, sc.distance::double precision
  from scored sc
  join public.place_view v on v.id = sc.place_id
  order by sc.rank_score desc, sc.community_count desc
  limit least(greatest(p_limit, 1), 50)
$$;

-- ---------------------------------------------------------------------------
-- Yetkiler
-- ---------------------------------------------------------------------------

revoke execute on function
  public.is_admin(),
  public.admin_reports(),
  public.admin_resolve_report(uuid, text),
  public.recommended_places(double precision, double precision, integer)
from public, anon;

grant execute on function
  public.admin_reports(),
  public.admin_resolve_report(uuid, text),
  public.recommended_places(double precision, double precision, integer)
to authenticated;
