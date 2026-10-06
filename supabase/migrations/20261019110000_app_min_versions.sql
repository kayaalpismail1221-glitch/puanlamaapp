-- Zorunlu güncelleme: platform başına en düşük desteklenen uygulama sürümü. Yüklü sürümü (`app.json` → version,
-- ör. "1.0.1") bunun altında kalan uygulama yalnızca "Güncelle" ekranını gösterir (`hooks/use-update-required`).
-- Oturum gerekmez (karşılama ekranında da çalışır). Yalnızca SQL Editor'den değişir, ör. 1.0.2 yayınlanıp
-- mağazada herkese açıldıktan SONRA:
--   update public.app_min_versions set min_version = '1.0.2', updated_at = now() where platform = 'ios';
-- Mağazada olmayan bir sürüm yazılırsa o platformdaki herkes kilitlenir.

create table public.app_min_versions (
  platform text primary key check (platform in ('ios', 'android')),
  min_version text not null check (min_version ~ '^[0-9]+(\.[0-9]+){0,2}$'),
  updated_at timestamptz not null default now()
);

insert into public.app_min_versions (platform, min_version) values ('ios', '1.0.0'), ('android', '1.0.0');

alter table public.app_min_versions enable row level security;
revoke all on public.app_min_versions from public, anon, authenticated;
grant select on public.app_min_versions to anon, authenticated;

create policy "En düşük sürümü herkes okur" on public.app_min_versions
  for select to anon, authenticated using (true);
