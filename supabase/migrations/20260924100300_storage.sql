-- Puanla: fotoğraf depolama
-- Dosyalar herkese açık URL ile sunulur (CDN); her kullanıcı yalnızca kendi klasörüne yazabilir:
--   post-photos/<kullanıcı>/<gönderi>/<sıra>.jpg  (ve küçük kopyası <sıra>_t.jpg)
--   avatars/<kullanıcı>/<zaman>.jpg

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('post-photos', 'post-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Kendi klasörünü listeler" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('post-photos', 'avatars')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Kendi klasörüne yükler" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('post-photos', 'avatars')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Kendi dosyasını değiştirir" on storage.objects
  for update to authenticated
  using (
    bucket_id in ('post-photos', 'avatars')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Kendi dosyasını siler" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('post-photos', 'avatars')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
