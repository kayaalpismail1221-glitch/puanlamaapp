# Proje: Türkiye için sosyal restoran sıralama uygulaması (Beli uyarlaması)

## Fikir
Kullanıcılar gittikleri restoranları puanlar ve sıralar, arkadaşlarının nerede yediğini görür,
arkadaş tavsiyesine dayalı öneriler alır. Hedef kitle: Türkiye'de 18–35 yaş, şehirli, genç kullanıcılar.
Uygulama dili Türkçe.

## Geliştirici ortamı
- Windows PC + iPhone 11 (Mac yok).
- Test: iPhone'da Expo Go (gerekirse EAS development build).
- iOS derlemesi: EAS Build (bulutta). Xcode'a veya Mac'e bağımlı adım önerme.
- Öncelik iOS. Tasarım iOS'a native hissettirmeli; Android sonra gelir.

## Teknoloji
- React Native + Expo (en güncel SDK), TypeScript
- Navigasyon: Expo Router (dosya tabanlı), alt bar için native tabs
- Harita: react-native-maps (iOS'ta Apple Haritalar)
- Animasyon ve his: react-native-reanimated, expo-haptics, expo-blur
- Backend: Supabase (auth, Postgres + PostGIS, storage). Apple ile Giriş desteklenmeli.
- Mekân verisi: Google Places veya Foursquare API (ileride karar verilecek; önce mock veri)

## Tasarım sistemi
- Arka plan: tamamen beyaz `#FFFFFF`. Yemek fotoğrafları öne çıksın diye ekranlar sade ve ferah kalmalı.
- Ana marka rengi (Primary): gece mavisi / lacivert `#0F1E3D`.
  Header'lar, alt bar, yapısal ikonlar, ana butonlar, puan rozetleri gibi işlevsel ve dekoratif öğelerde kullanılır.
- Metin: ana metin `#0F1E3D` veya `#111827`, ikincil metin `#6B7280`
- Ayırıcı çizgiler ve kart kenarları: `#E5E7EB`, açık gri yüzeyler: `#F5F6F8`
- Font: iOS sistem fontu (SF Pro), ayrı font yükleme yok
- Köşe yarıçapları: kartlar 16, butonlar 12, avatarlar tam yuvarlak
- Boşluklar 4'ün katları (4, 8, 12, 16, 24, 32)
- Renkleri ve ölçüleri tek bir `theme.ts` dosyasında token olarak tut. Bileşenlerde sabit renk yazma.
- Dokunmalarda hafif haptik geri bildirim, geçişler akıcı olmalı

## Ekranlar ve akış
### Onboarding
1. Karşılama ekranı
2. Giriş / kayıt (Apple ile Giriş öncelikli)
3. Kullanıcı adı ve profil fotoğrafı
4. **Son 3 deneyimini puanla:** kullanıcı en son gittiği mekânı (veya son 3 mekânı) arar, seçer ve puanlar.
   Puanlama Beli tarzı: önce "Beğendim / İdare eder / Beğenmedim", sonra önceki mekânlarla ikili
   karşılaştırma ("Hangisi daha iyiydi?") ile sıralamadaki yeri belirlenir. Puan 0–10 arası sıralamadan hesaplanır.
5. Arkadaş bul (rehber / kullanıcı adı ile arama). Bu adım atlanabilir.

### Alt bar (5 sekme)
- **Feed:** takip edilenlerin ve kullanıcının gönderileri. Gönderi = mekân + fotoğraflar (en fazla 5) + yorum
  + birlikte gidilen arkadaş etiketleri + puan. Beğenilir (çift dokunuş dahil), yorum yapılır, kaydedilir.
  Mekân sayfasında o mekânın gönderileri "Gönderiler" ızgarasında listelenir.
- **Ara:** mekân ve kişi araması tek yerde (Tümü / Mekânlar / Kişiler)
- **Harita:** gidilen mekânlar ve Listem harita üzerinde, puana göre renkli pinler
- **Listem:** gitmek istenen mekânlar. Instagram/TikTok'ta görülen mekân, gönderi bağlantısı ve notla kaydedilir
- **Profilim:** istatistikler (gidilen mekân sayısı, en sevilen mutfak), sıralı listem

## Türkiye'ye özgü notlar (ileride)
- Kategoriler: kahvaltıcı, esnaf lokantası, dürümcü, kokoreççi, ciğerci, balıkçı, meyhane
- İlk hedef tek bir şehir ve tek bir çevre (ör. bir üniversite)
- Paylaşılabilir "en iyi mekânlarım" kartı (Instagram hikâyesi için)

## Çalışma kuralları
- Önce mock veriyle çalışan arayüz, sonra Supabase bağlantısı
- Küçük adımlarla ilerle. Her adım sonunda `npx expo start` ile iPhone'da test edilebilir olsun
- Kod açıklamaları ve kullanıcıya görünen metinler Türkçe
