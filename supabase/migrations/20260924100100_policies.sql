-- Puanla: erişim kuralları
-- İlke: giriş yapmamış (anon) kullanıcı içerik göremez; herkes yalnızca kendi verisini değiştirir.
-- Sayaçlar ve puanlar gibi türetilmiş alanlar sütun yetkileriyle korunur.

-- ---------------------------------------------------------------------------
-- Tablo yetkileri
-- Supabase varsayılan olarak her tabloda anon ve authenticated'a tam yetki verir;
-- burada bunu daraltıyoruz. RLS ayrıca satır bazında süzer.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;

grant select on public.cuisines to anon, authenticated;

grant select on public.profiles to authenticated;
grant update (name, username, avatar_path, school_id, year_goal, onboarded_at) on public.profiles to authenticated;

grant select, insert, update on public.profile_private to authenticated;

grant select on public.places to authenticated;
grant insert (name, cuisine, neighborhood, district, city, price_level, latitude, longitude)
  on public.places to authenticated;

-- Sıralamalar yalnızca rank_place / unrank_place ile yazılır
grant select on public.rankings to authenticated;

grant select, insert, update, delete on public.saved_places to authenticated;

grant select, insert, delete on public.follows to authenticated;
grant select, insert, delete on public.blocks to authenticated;

grant select, delete on public.posts to authenticated;
grant insert (id, place_id, caption, price_per_person, meal, dishes, highlights) on public.posts to authenticated;
grant update (caption, price_per_person, meal, dishes, highlights) on public.posts to authenticated;

grant select, insert, delete on public.post_photos to authenticated;
grant select, insert, delete on public.post_tags to authenticated;
grant select, insert, delete on public.post_likes to authenticated;
grant select, insert, delete on public.post_saves to authenticated;

grant select, delete on public.comments to authenticated;
grant insert (post_id, body) on public.comments to authenticated;

grant insert (post_id, comment_id, user_id, reason, details) on public.reports to authenticated;

-- ---------------------------------------------------------------------------
-- Satır düzeyi güvenlik
-- ---------------------------------------------------------------------------

alter table public.cuisines enable row level security;
alter table public.profiles enable row level security;
alter table public.profile_private enable row level security;
alter table public.places enable row level security;
alter table public.rankings enable row level security;
alter table public.saved_places enable row level security;
alter table public.follows enable row level security;
alter table public.blocks enable row level security;
alter table public.posts enable row level security;
alter table public.post_photos enable row level security;
alter table public.post_tags enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_saves enable row level security;
alter table public.comments enable row level security;
alter table public.reports enable row level security;

create policy "Mutfaklar herkese açık" on public.cuisines
  for select to anon, authenticated using (true);

-- Profiller
create policy "Profiller üyelere açık" on public.profiles
  for select to authenticated using (true);

create policy "Kendi profilini düzenler" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "İletişim bilgisini yalnızca sahibi görür" on public.profile_private
  for select to authenticated using (user_id = (select auth.uid()));

create policy "İletişim bilgisini sahibi ekler" on public.profile_private
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy "İletişim bilgisini sahibi günceller" on public.profile_private
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Mekânlar
create policy "Mekânlar üyelere açık" on public.places
  for select to authenticated using (true);

create policy "Üyeler mekân ekler" on public.places
  for insert to authenticated with check (created_by = (select auth.uid()));

-- Sıralamalar herkese açık (Beli gibi); yazma fonksiyonlarla
create policy "Sıralamalar üyelere açık" on public.rankings
  for select to authenticated using (true);

-- Listem
create policy "Listem yalnızca sahibine" on public.saved_places
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Takip
create policy "Takipler üyelere açık" on public.follows
  for select to authenticated using (true);

create policy "Kendi adına takip eder" on public.follows
  for insert to authenticated
  with check (
    follower_id = (select auth.uid())
    and not public.is_blocked_between(follower_id, followee_id)
  );

create policy "Takipten çıkar ya da takipçisini çıkarır" on public.follows
  for delete to authenticated
  using ((select auth.uid()) in (follower_id, followee_id));

-- Engelleme
create policy "Engellediklerini görür" on public.blocks
  for select to authenticated using (blocker_id = (select auth.uid()));

create policy "Engeller" on public.blocks
  for insert to authenticated with check (blocker_id = (select auth.uid()));

create policy "Engeli kaldırır" on public.blocks
  for delete to authenticated using (blocker_id = (select auth.uid()));

-- Gönderiler
create policy "Gönderiler üyelere açık" on public.posts
  for select to authenticated
  using (not public.is_blocked_between((select auth.uid()), user_id));

create policy "Kendi gönderisini paylaşır" on public.posts
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy "Kendi gönderisini düzenler" on public.posts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Kendi gönderisini siler" on public.posts
  for delete to authenticated using (user_id = (select auth.uid()));

/** Gönderinin sahibi mevcut kullanıcı mı */
create or replace function public.owns_post(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.posts where id = p_post_id and user_id = auth.uid())
$$;

create policy "Fotoğraflar üyelere açık" on public.post_photos
  for select to authenticated using (true);

-- Fotoğraf yolu kullanıcının kendi klasöründe olmalı
create policy "Kendi gönderisine fotoğraf ekler" on public.post_photos
  for insert to authenticated
  with check (
    public.owns_post(post_id)
    and path like (select auth.uid())::text || '/' || post_id::text || '/%'
  );

create policy "Kendi gönderisinden fotoğraf siler" on public.post_photos
  for delete to authenticated using (public.owns_post(post_id));

create policy "Etiketler üyelere açık" on public.post_tags
  for select to authenticated using (true);

create policy "Kendi gönderisinde arkadaş etiketler" on public.post_tags
  for insert to authenticated
  with check (
    public.owns_post(post_id)
    and user_id <> (select auth.uid())
    and not public.is_blocked_between((select auth.uid()), user_id)
  );

-- Gönderi sahibi etiketi kaldırabilir, etiketlenen kişi de kendini çıkarabilir
create policy "Etiketi kaldırır" on public.post_tags
  for delete to authenticated
  using (public.owns_post(post_id) or user_id = (select auth.uid()));

create policy "Beğeniler üyelere açık" on public.post_likes
  for select to authenticated using (true);

create policy "Kendi adına beğenir" on public.post_likes
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy "Beğenisini geri alır" on public.post_likes
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "Kaydettikleri yalnızca sahibine" on public.post_saves
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Yorumlar
create policy "Yorumlar üyelere açık" on public.comments
  for select to authenticated
  using (not public.is_blocked_between((select auth.uid()), user_id));

create policy "Kendi adına yorum yapar" on public.comments
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and not public.is_blocked_between(
      (select auth.uid()),
      (select p.user_id from public.posts p where p.id = post_id)
    )
  );

-- Yorumu yazan ya da gönderinin sahibi silebilir
create policy "Yorumu siler" on public.comments
  for delete to authenticated
  using (user_id = (select auth.uid()) or public.owns_post(post_id));

-- Şikâyetler: yalnızca eklenir, moderasyon panelden yapılır
create policy "Şikâyet eder" on public.reports
  for insert to authenticated with check (reporter_id = (select auth.uid()));
