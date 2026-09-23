# Puanla

Türkiye için sosyal restoran sıralama uygulaması (Beli uyarlaması). Ürün ve tasarım kuralları: [CLAUDE.md](CLAUDE.md).

## Çalıştırma

```bash
npm install
npx expo start
```

iPhone'da Expo Go ile terminaldeki QR kodu okut. Bilgisayar ve telefon aynı Wi‑Fi'da değilse `npx expo start --tunnel` kullan.

## Yapı

- `src/app/` — Expo Router ekranları
  - `onboarding/` — karşılama → giriş → profil → ilk 3 puan → arkadaş bul
  - `(tabs)/` — Feed, Harita, Profilim (native tabs)
  - `degerlendir/[id]` — Beli tarzı puanlama (izlenim + ikili karşılaştırma)
  - `mekan/[id]`, `ara`, `arkadas-bul`
- `src/constants/theme.ts` — renk, boşluk, yarıçap ve yazı token'ları
- `src/lib/ranking.ts` — sıralama ve 0–10 puan hesabı
- `src/store/app-store.tsx` — uygulama durumu (şimdilik AsyncStorage)
- `src/data/mock.ts` — sahte mekân, kullanıcı ve feed verisi

Test sırasında baştan başlamak için: Profilim → sağ üstteki dişli → Çıkış yap.
