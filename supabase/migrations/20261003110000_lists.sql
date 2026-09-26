-- Puanla: paylaşılabilir listeler
-- "Kadıköy'de en iyi dürümcülerim" gibi, kullanıcının kendi sıralamasından seçtiği mekânlar.
-- Sıra her zaman listenin sahibinin güncel puanına göredir (yeniden puanlayınca liste de güncellenir).
-- Listeler tüm üyelere açıktır (profilde "İsmail'in listeleri"); engelli kişi görmez.
-- Başkaları listeyi "kaydeder" (list_saves); kayıt sayısı sahibine sosyal kanıt olarak görünür.

-- ---------------------------------------------------------------------------
-- Tablolar
-- ---------------------------------------------------------------------------

create table public.lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null
    constraint list_title_length check (char_length(btrim(title)) between 1 and 80),
  description text
    constraint list_description_length check (char_length(description) <= 300),
  -- Tetikleyiciyle tutulur; kullanıcı doğrudan değiştiremez
  save_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lists_user_idx on public.lists (user_id, updated_at desc);

create trigger lists_touch before update on public.lists
  for each row execute function public.touch_updated_at();

create trigger lists_daily_limit before insert on public.lists
  for each row execute function public.enforce_daily_limit('user_id', '20', 'liste');

create trigger lists_objectionable before insert or update of title, description on public.lists
  for each row execute function public.reject_objectionable('title', 'description');

/** Listedeki mekânlar; `position` sahibin seçtiği sıra (puanı olmayanlar ve eşitlikler için) */
create table public.list_places (
  list_id uuid not null references public.lists (id) on delete cascade,
  place_id uuid not null references public.places (id) on delete cascade,
  position smallint not null,
  note text
    constraint list_note_length check (char_length(note) <= 200),
  primary key (list_id, place_id)
);

create index list_places_place_idx on public.list_places (place_id);

create trigger list_places_objectionable before insert or update of note on public.list_places
  for each row execute function public.reject_objectionable('note');

create table public.list_saves (
  list_id uuid not null references public.lists (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (list_id, user_id)
);

create index list_saves_user_idx on public.list_saves (user_id, created_at desc);

create or replace function public.on_list_save_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.lists set save_count = save_count + 1 where id = new.list_id;
  else
    update public.lists set save_count = greatest(save_count - 1, 0) where id = old.list_id;
  end if;
  return null;
end;
$$;

create trigger list_saves_count after insert or delete on public.list_saves
  for each row execute function public.on_list_save_change();

-- ---------------------------------------------------------------------------
-- Şikâyet: listeler de şikâyet edilebilir (App Store 1.2)
-- ---------------------------------------------------------------------------

alter table public.reports add column list_id uuid references public.lists (id) on delete cascade;
alter table public.reports drop constraint reports_check;
alter table public.reports add constraint reports_one_target
  check (num_nonnulls(post_id, comment_id, user_id, list_id) = 1);

-- ---------------------------------------------------------------------------
-- Erişim kuralları
-- ---------------------------------------------------------------------------

revoke all on public.lists, public.list_places, public.list_saves from anon, authenticated;

-- Liste ve mekânları yalnızca save_list ile yazılır; silmek doğrudan
grant select, delete on public.lists to authenticated;
grant select on public.list_places to authenticated;
grant select, insert, delete on public.list_saves to authenticated;
grant insert (list_id) on public.reports to authenticated;

alter table public.lists enable row level security;
alter table public.list_places enable row level security;
alter table public.list_saves enable row level security;

create policy "Listeler üyelere açık" on public.lists
  for select to authenticated
  using (not public.is_blocked_between((select auth.uid()), user_id));

create policy "Kendi listesini siler" on public.lists
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "Liste mekânları liste görünüyorsa açık" on public.list_places
  for select to authenticated
  using (exists (select 1 from public.lists l where l.id = list_id));

-- Kimin kaydettiği gizli: herkes yalnızca kendi kayıtlarını görür (sayı listede)
create policy "Kaydettiği listeleri görür" on public.list_saves
  for select to authenticated using (user_id = (select auth.uid()));

create policy "Başkasının listesini kaydeder" on public.list_saves
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.lists l where l.id = list_id and l.user_id <> (select auth.uid()))
  );

create policy "Kaydını geri alır" on public.list_saves
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Yazma
-- ---------------------------------------------------------------------------

/**
 * Listeyi oluşturur (p_id null) ya da günceller; mekânları verilen sırayla tamamen değiştirir.
 * p_notes[i], p_place_ids[i] için isteğe bağlı kısa not. 1–50 mekân. Liste kimliğini döner.
 */
create or replace function public.save_list(
  p_id uuid,
  p_title text,
  p_description text,
  p_place_ids uuid[],
  p_notes text[] default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_id uuid;
  n int := coalesce(array_length(p_place_ids, 1), 0);
begin
  if uid is null then
    raise exception 'Giriş yapman gerekiyor' using errcode = '42501';
  end if;
  if n = 0 or n > 50 then
    raise exception 'Listede 1–50 mekân olmalı' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.lists (user_id, title, description)
    values (uid, btrim(p_title), nullif(btrim(p_description), ''))
    returning id into v_id;
  else
    update public.lists
    set title = btrim(p_title), description = nullif(btrim(p_description), '')
    where id = p_id and user_id = uid
    returning id into v_id;
    if v_id is null then
      raise exception 'Liste bulunamadı' using errcode = 'P0002';
    end if;
    delete from public.list_places where list_id = v_id;
  end if;

  insert into public.list_places (list_id, place_id, position, note)
  select v_id, u.place_id, (u.ord - 1)::smallint, nullif(btrim(p_notes[u.ord]), '')
  from unnest(p_place_ids) with ordinality as u (place_id, ord)
  on conflict do nothing;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Okuma
-- ---------------------------------------------------------------------------

/** Liste kartı: başlık, sahibi, mekân sayısı, en iyi 3 mekânın kapak fotoğrafı, kaydetme durumu */
create or replace function public.list_json(l public.lists)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', l.id,
    'title', l.title,
    'description', l.description,
    'save_count', l.save_count,
    'created_at', l.created_at,
    'updated_at', l.updated_at,
    'author', (select public.profile_json(p) from public.profiles p where p.id = l.user_id),
    'place_count', (select count(*)::int from public.list_places lp where lp.list_id = l.id),
    'covers', coalesce(
      (
        select jsonb_agg(c.photo)
        from (
          select v.photo
          from public.list_places lp
          join public.place_view v on v.id = lp.place_id
          left join public.rankings r on r.user_id = l.user_id and r.place_id = lp.place_id
          where lp.list_id = l.id and v.photo is not null
          order by r.score desc nulls last, lp.position
          limit 3
        ) c
      ),
      '[]'::jsonb
    ),
    'saved_by_me', exists (select 1 from public.list_saves s where s.list_id = l.id and s.user_id = auth.uid())
  )
$$;

/** Bir kullanıcının listeleri, en son güncellenen önce */
create or replace function public.user_lists(p_user_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.list_json(l) order by l.updated_at desc), '[]'::jsonb)
  from public.lists l
  where l.user_id = p_user_id
$$;

/** Kaydettiğin listeler, en son kaydedilen önce */
create or replace function public.saved_lists()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.list_json(l) order by s.created_at desc), '[]'::jsonb)
  from public.list_saves s
  join public.lists l on l.id = s.list_id
  where s.user_id = auth.uid()
$$;

/**
 * Liste sayfası: { list, items: [{ place, score, note }] }. Mekânlar sahibin güncel puanına göre
 * (puanı olmayanlar sonda, sahibin sırasıyla). Liste yoksa ya da engelliyse null.
 */
create or replace function public.list_details(p_list_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'list', public.list_json(l),
    'items', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('place', to_jsonb(v), 'score', r.score, 'note', lp.note)
          order by r.score desc nulls last, lp.position
        )
        from public.list_places lp
        join public.place_view v on v.id = lp.place_id
        left join public.rankings r on r.user_id = l.user_id and r.place_id = lp.place_id
        where lp.list_id = l.id
      ),
      '[]'::jsonb
    )
  )
  from public.lists l
  where l.id = p_list_id
$$;

-- ---------------------------------------------------------------------------
-- Yönetim: şikâyet kuyruğu listeleri de kapsar
-- ---------------------------------------------------------------------------

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
    select distinct on (coalesce(r.post_id, r.comment_id, r.list_id, r.user_id))
      r.id,
      r.reason,
      r.details,
      r.created_at,
      rep.username,
      case
        when r.post_id is not null then 'post'
        when r.comment_id is not null then 'comment'
        when r.list_id is not null then 'list'
        else 'user'
      end,
      coalesce(r.post_id, r.comment_id, r.list_id, r.user_id),
      coalesce(r.post_id, c.post_id),
      au.id,
      au.name,
      au.username,
      coalesce(p.caption, c.body, li.title || coalesce(' — ' || li.description, ''), au.name),
      (select ph.path from public.post_photos ph where ph.post_id = coalesce(r.post_id, c.post_id) and ph.position = 0),
      (select pl.name from public.posts pp join public.places pl on pl.id = pp.place_id where pp.id = coalesce(r.post_id, c.post_id)),
      (
        select count(*)::int from public.reports r2
        where r2.resolved_at is null
          and r2.post_id is not distinct from r.post_id
          and r2.comment_id is not distinct from r.comment_id
          and r2.list_id is not distinct from r.list_id
          and r2.user_id is not distinct from r.user_id
      )
    from public.reports r
    left join public.profiles rep on rep.id = r.reporter_id
    left join public.posts p on p.id = r.post_id
    left join public.comments c on c.id = r.comment_id
    left join public.lists li on li.id = r.list_id
    left join public.profiles au on au.id = coalesce(p.user_id, c.user_id, li.user_id, r.user_id)
    where r.resolved_at is null
    order by coalesce(r.post_id, r.comment_id, r.list_id, r.user_id), r.created_at desc
  ) latest
  order by latest.created_at;
end;
$$;

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
    (select user_id from public.lists where id = rep.list_id),
    rep.user_id
  );

  if p_action = 'ban' and author = auth.uid() then
    raise exception 'Kendi hesabını yasaklayamazsın' using errcode = '22023';
  end if;

  if p_action in ('remove', 'ban') then
    -- İçerik silinince ona bağlı şikâyetler de silinir (on delete cascade)
    delete from public.posts where id = rep.post_id;
    delete from public.comments where id = rep.comment_id;
    delete from public.lists where id = rep.list_id;
  end if;

  if p_action = 'ban' and author is not null then
    update auth.users set banned_until = 'infinity' where id = author;
    update public.reports set resolved_at = now()
    where resolved_at is null
      and (
        user_id = author
        or post_id in (select id from public.posts where user_id = author)
        or comment_id in (select id from public.comments where user_id = author)
        or list_id in (select id from public.lists where user_id = author)
      );
  end if;

  update public.reports set resolved_at = now()
  where resolved_at is null
    and post_id is not distinct from rep.post_id
    and comment_id is not distinct from rep.comment_id
    and list_id is not distinct from rep.list_id
    and user_id is not distinct from rep.user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fonksiyon yetkileri
-- ---------------------------------------------------------------------------

revoke execute on function
  public.on_list_save_change(),
  public.save_list(uuid, text, text, uuid[], text[]),
  public.list_json(public.lists),
  public.user_lists(uuid),
  public.saved_lists(),
  public.list_details(uuid)
from public, anon;

grant execute on function
  public.save_list(uuid, text, text, uuid[], text[]),
  public.list_json(public.lists),
  public.user_lists(uuid),
  public.saved_lists(),
  public.list_details(uuid)
to authenticated;
