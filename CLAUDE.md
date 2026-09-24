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

## Kalite ve premium his (kalıcı ilke)
- Uygulama premium hissettirmeli; güncel iOS tasarım dili ve yetenekleri tercih edilir.
- Mümkün olan her yerde native bileşen: native tabs (iOS 26'da Liquid Glass), native stack başlıkları,
  SwiftUI bileşenleri (`@expo/ui/swift-ui`, ör. segmented Picker), cam yüzeyler (`expo-glass-effect`,
  eski iOS'ta `expo-blur` yedeği → `components/glass-surface.tsx`), SF Symbols, sistem paylaşım menüsü.
- Her etkileşimde haptik + yay animasyonu (`PressableScale`); stil doğrudan dokunma alanına uygulanır.
- Kod kalitesi: tip güvenliği, tek sorumluluklu bileşenler, mantık `lib/` altında ve test edilebilir.
  Her adım sonunda `tsc`, `expo lint` ve iOS bundle temiz olmalı.

## Ekranlar ve akış
### Onboarding
1. Karşılama: süzülen İstanbul haritası ve puan pinleri, beyaza eriyen geçiş, serif "puanla" logosu,
   otomatik ilerleyen 3 slayt (Hatırla · Güven · Keşfet), "Başla" (oksuz) ve "Giriş yap".
2. Telefon (+90, 5XX XXX XX XX) → 3. E-posta → 4. Ad ve soyad (kullanıcı adı otomatik türetilir)
   → 5. Şifre (güç göstergesi; şifre cihazda asla saklanmaz, Supabase Auth'a gidecek).
   Her adımda tek soru, büyük giriş alanı, adım ikonu ve ince ilerleme çubuğu.
6. En son gidilen 1 restoranı Beli tarzı puanla ("Beğendim / İdare eder / Beğenmedim" + ikili karşılaştırma),
   ardından normal gönderi ekranı açılır (fotoğraf isteğe bağlı, "Şimdilik atla" var).
7. En az 5 kişiyi takip et ("Hepsini takip et" kısayolu) → Başla.

### Alt bar (5 sekme)
- **Feed:** iki sekme. *Popüler* (varsayılan): konumun yakınındaki en popüler gönderiler (3→10→30 km,
  yoksa en yakın şehir); kullanıcı şehir/ilçe seçerse o bölgenin popüler feed'i. *Takip*: takip edilenlerin
  ve kullanıcının gönderileri. Gönderi = mekân + fotoğraflar (en fazla 5) + yorum
  + birlikte gidilen arkadaş etiketleri + puan. Beğenilir (çift dokunuş dahil), yorum yapılır, kaydedilir.
  Mekân sayfasında o mekânın gönderileri "Gönderiler" ızgarasında listelenir.
  Gönderide yapılandırılmış bilgiler (hepsi isteğe bağlı): kişi başı hesap aralığı, öğün, ne yenildi,
  öne çıkanlar (fiyat/performans, öğrenci dostu…). Mekân sayfası bunlardan "Puanla kullanıcılarına göre"
  özetini çıkarır (genel kişi başı, en çok yenilenler, öne çıkanlar).
- **Ara:** mekân ve kişi araması tek yerde (Tümü / Mekânlar / Kişiler)
- **Harita:** gidilen mekânlar ve Listem harita üzerinde, puana göre renkli pinler
- **Listem:** gitmek istenen mekânlar, iki bölüm:
  - *Sosyal medyadan*: Instagram/TikTok'ta görülen mekân, gönderi bağlantısı ve notla (panodaki link otomatik yakalanır)
  - *Kaydettiklerim*: uygulama içinde yer imiyle kaydedilen mekânlar ve gönderiler
  - Mutfak/kaynak filtresi, sıralama (en yeni, arkadaş puanı, A–Z), sola kaydır → Gittim / Sil, haritada gör
- **Profilim:** Beli tarzı istatistik satırı: Takipçi · Takip · Sıralama. Sıralama = paylaşılan değerlendirme
  (gönderi) sayısına göre liderlik tablosundaki yer (eşitlikte beğeni); ilk değerlendirmeye kadar kilitli.
  Liderlik tablosu: Genel / Arkadaşlar, Tüm zamanlar / Bu ay.
  Beli'nin kopyası değil, kendi karakteri var: Top 3'üm vitrini, Damak zevkin (mutfak payları),
  Türk mutfağına özel rozetler, Seri, yıllık hedef, Gönderilerim ızgarası. Sağ üstte paylaş + ⚙️ Ayarlar.

## Türkiye'ye özgü notlar (ileride)
- Kategoriler: kahvaltıcı, esnaf lokantası, dürümcü, kokoreççi, ciğerci, balıkçı, meyhane
- İlk hedef tek bir şehir ve tek bir çevre (ör. bir üniversite)
- Paylaşılabilir "en iyi mekânlarım" kartı (Instagram hikâyesi için)

## Çalışma kuralları
- Önce mock veriyle çalışan arayüz, sonra Supabase bağlantısı
- Küçük adımlarla ilerle. Her adım sonunda `npx expo start` ile iPhone'da test edilebilir olsun
- Kod açıklamaları ve kullanıcıya görünen metinler Türkçe
