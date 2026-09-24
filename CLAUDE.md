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
- Backend: Supabase (auth, Postgres + PostGIS, storage). Apple ile Giriş desteklenmeli. Kurulum: SUPABASE.md
- Mekân verisi: kendi `places` tablomuz; kullanıcılar mekân ekleyebilir (`mekan-ekle`). Toplu içe aktarım
  için Foursquare Open Places düşünülüyor (Google Places verisi lisans gereği kalıcı saklanamaz).

## Backend mimarisi (kalıcı ilke)
- Şema değişikliği her zaman yeni bir migration dosyasıyla (`supabase/migrations/`), eskileri düzenlenmez
  (canlıya çıkmadan önceki ilk sürüm hariç). Her değişiklikten sonra `npm run test:db` geçmeli; yeni kurala test eklenir.
- Güvenlik veritabanında: her tabloda RLS, türetilmiş alanlar (sayaçlar, puanlar) sütun yetkileriyle korunur.
  Uygulamadaki kontroller yalnızca kullanıcı deneyimi içindir.
- Karmaşık okumalar görünüm/fonksiyon (`post_view`, `feed_popular`, `place_details`…) ile tek istekte yapılır.
- İstemci katmanları: `src/api/*` (Supabase çağrıları) → `data/entities` (ortak önbellek) ve `hooks/queries`
  (TanStack Query) → ekranlar. Kullanıcının kendi verisi `store/app-store` içinde iyimser güncellenir.
- Ekranlar Supabase'i doğrudan çağırmaz; `src/api` üzerinden gider. `src/types/database.ts` şemayla aynı tutulur.
- Canlıya migration uygulama: Supabase CLI kurulu değil; yeni migration dosyası kullanıcıya panoya kopyalanır
  (`Get-Content -Raw -Encoding utf8 <dosya> | Set-Clipboard`), kullanıcı SQL Editor'de çalıştırır. Sonra
  publishable key ile canlıda doğrulanır (geçici test hesabı açılır, iş bitince `delete_account` ile silinir).

## Canlı ortam ve durum (2026-09-25 itibarıyla)
- Supabase projesi: `kzedsqgegrzmngxvhmfk` (Frankfurt). `.env.local` dolu (git'e girmez). Uygulanmış migration'lar:
  `20260924100000…100300` (şema, RLS, API, storage) ve `20260925100000_search_popularity`. Demo seed yüklü
  (26 kurgusal mekân, 6 `@demo.puanla.app` hesabı, 19 gönderi) → gerçek kullanıcılara açılmadan önce
  `supabase/scripts/remove-demo-data.sql` ile silinmeli.
- Auth: e-posta/şifre açık, **Confirm email kapalı**. SMTP yok (Supabase SMTP'siz şablon düzenletmiyor ve
  varsayılan e-posta kod değil bağlantı gönderiyor). Bu yüzden `src/constants/features.ts` →
  `EMAIL_CODES_ENABLED = false` ("Şifremi unuttum" ve kod doğrulama gizli). Alan adı alınınca: Resend SMTP →
  `supabase/templates/` şablonlarını yükle (konuya `{{ .Token }}`) → Confirm email aç → bayrağı `true` yap.
- Apple ile giriş kodda hazır (`src/api/auth.ts`); Apple Developer hesabı ve Supabase Apple provider ayarı bekliyor.
- Uçtan uca doğrulandı: canlıda 22 adımlık API testi (kayıt→puan→foto yükleme→gönderi→feed→hesap silme) ve
  web'de tüm ekran akışı. iPhone'da henüz doğrulanmayan: galeriden fotoğraf seçip yükleme, react-native-maps
  haritaları, avatar değiştirme.
- Kullanıcı ve bir yakını (İsmail/İbrahim Kayaalp) telefondan gerçek hesap açtı; test verisi üretirken onları
  kirletme, test hesaplarını mutlaka sil.

## Yapılanlar (özet)
- Backend: Supabase şeması (profiller, mekânlar/PostGIS, sıralamalar, Listem, takip/engelleme, gönderi/foto/etiket/
  beğeni/kaydetme/yorum, şikâyet), RLS + sütun yetkileri, günlük sınırlar, sayaç tetikleyicileri; RPC'ler:
  `rank_place`, `create_post`, `feed_popular` (3→10→30 km, yoksa en yakın şehir), `feed_following`,
  `place_details`, `search_places` (Türkçe katlama + trigram + popülerlik), `search_users`, `suggested_users`,
  `leaderboard`/`user_rank`, `saved_posts`, `delete_account`. PGlite+PostGIS ile 30 DB testi (`npm run test:db`).
- Puan formülü istemci (`lib/ranking.ts` `scoreAt`) ve sunucu (`sentiment_score`) birebir aynı (tam sayı onda birlik).
- İstemci: sahte veri tamamen kaldırıldı. Oturum/iyimser güncelleme/cihaz önbelleği `store/app-store.tsx`;
  gönderi paylaşımı yeni puanın yazılmasını bekler (`waitForRank`). Foto: telefonda 1440 px + 480 px küçük kopya
  (`<kullanıcı>/<gönderi>/<n>.jpg` ve `_t.jpg`).
- Özellikler: kayıt/giriş/Apple/şifre sıfırlama (kapalı), kod doğrulama ekranı (kapalı), mekân ekleme
  (`mekan-ekle`, haritadan konum + ters geokodlama), gönderi şikâyeti, kullanıcı engelleme, yorum silme,
  hesap silme, Listem, konum yokken feed İstanbul'a düşer + "konumunu aç" bandı.
- Profilde **Lezzet haritası** (Beli "Dining Map" esinli, kopya değil): Natural Earth'ten üretilen çizim tarzı
  dünya haritası (`npm run generate:world-map` → `constants/world-map.ts`, Miller projeksiyonu `lib/world-projection.ts`),
  şehir başına nokta, en az ülke ölçeğine yakınlaşır. Büyük hâli `gittigi-yerler/[id]`: şehir noktasına ya da
  Mutfaklar/Şehirler/İlçeler satırına dokununca o yerdeki gönderiler. Kart gönderilerin üstünde.

## Geliştirme notları
- Web'de hızlı akış testi: `npx expo start --web --port 8090` (8081 kullanıcının Expo Go sunucusu olabilir, dokunma).
  Web için: `metro.config.js` react-native-maps'i `src/shims/react-native-maps.web.tsx` yer tutucusuyla değiştirir;
  SwiftUI bileşeni `segmented-control.ios.tsx`'e ayrıldı; `app.json` web çıktısı `single`.
- Web'de Alert görünmez ve tarayıcı aracının tıklaması bazı Pressable'lara ulaşmaz; gerekirse düğmenin
  `onPress`'i React fiber'dan tetiklenir. Reanimated `entering` animasyonları web'de öğeyi gizli bırakabiliyor.
- `package.json`'daki `tunnel` betiği ve `@expo/ngrok` kullanıcının eklediği, commit edilmemiş değişiklik.

## Sıradaki işler
1. Gerçek mekân verisi (İstanbul) toplu içe aktarım (Foursquare Open Places ya da benzeri) + demo verisini silme.
2. Alan adı + Resend SMTP → e-posta doğrulama ve şifre sıfırlamayı aç.
3. Apple Developer: Apple ile giriş, bundle id, EAS Build, TestFlight beta.
4. Bildirimler (beğeni/yorum/takip), paylaşılabilir "en iyi mekânlarım" hikâye kartı.

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
   otomatik ilerleyen 3 slayt (Hatırla · Güven · Keşfet), "Başla" (oksuz) ve "Giriş yap" (`onboarding/giris`).
2. Telefon (+90, 5XX XXX XX XX) → 3. E-posta → 4. Ad ve soyad (kullanıcı adı otomatik türetilir, boşta mı
   kontrol edilir) → 5. Şifre → Supabase `signUp` (taslak AsyncStorage'da, şifre asla saklanmaz).
   Doğrulama açıksa `onboarding/dogrula` (6 haneli kod). Oturum açılınca kök düzen yarım kalan kuruluma
   (`ilk-puan`) yönlendirir; `profiles.onboarded_at` dolunca sekmelere geçilir.
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
- **Harita:** gidilen mekânlar ve Listem harita üzerinde, puana göre renkli pinler (puan renkleri lacivert tonları)
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
- Küçük adımlarla ilerle. Her adım sonunda `npx expo start` ile iPhone'da test edilebilir olsun
- Kullanıcı Türkçe ve gündelik konuşur ("bro"); Beli'den ilham alınır ama ekranlar birebir kopyalanmaz
- Kod açıklamaları ve kullanıcıya görünen metinler Türkçe
