# Puanla

Türkiye için sosyal restoran sıralama uygulaması (Beli uyarlaması). Ürün ve tasarım kuralları: [CLAUDE.md](CLAUDE.md).

## Çalıştırma

İlk seferde Supabase bağlantısını kur: [SUPABASE.md](SUPABASE.md)

```bash
npm install
npx expo start
```

iPhone'da ya da Android telefonda Expo Go ile terminaldeki QR kodu okut. Bilgisayar ve telefon aynı Wi‑Fi'da değilse `npx expo start --tunnel` kullan.
Android derleme ve Google Play: [docs/android.md](docs/android.md).

## Yapı

- `src/app/`: Expo Router ekranları
  - `onboarding/`: karşılama → telefon → e-posta → ad → şifre (→ kod) → ilk puan → takip; `giris`, `sifre-sifirla`
  - `(tabs)/`: Feed, Ara, Harita, Listem, Profilim (native tabs)
  - `degerlendir/[id]`: Beli tarzı puanlama (izlenim + ikili karşılaştırma)
  - `mekan/[id]`, `mekan-ekle`, `kullanici/[id]`, `gonderi/[id]`, `gonderi-olustur`, `listeye-ekle`, `arkadas-bul`
- `src/api/`: Supabase çağrıları (`auth`, `me`, `content`, `storage`) ve satır → tip dönüştürücüler
- `src/data/entities.ts`: mekân, kişi ve gönderiler için ortak önbellek (`usePlace(id)` gibi)
- `src/hooks/queries.ts`: TanStack Query kancaları (feed, profil, arama, liderlik…)
- `src/store/app-store.tsx`: oturum ve kullanıcının kendi verisi (iyimser güncelleme + cihazda son hâl)
- `src/lib/ranking.ts`: sıralama ve 0–10 puan hesabı (sunucudaki `sentiment_score` ile birebir)
- `supabase/`: migration'lar, geliştirme verisi (`seed.sql`) ve veritabanı testleri (`npm run test:db`)

Test sırasında baştan başlamak için: Profilim → sağ üstteki dişli → Çıkış yap.
