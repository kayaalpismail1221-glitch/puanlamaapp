# App Store'a çıkış rehberi

Bu belge Puanla'nın App Store incelemesinden geçmesi için gerekenleri toplar: kodda
yapılanlar, senin yapman gerekenler ve App Store Connect'e yapıştırılacak hazır metinler.

## 1. Kodda hazır olanlar

| Apple kuralı | Durum |
|---|---|
| 1.2 Kullanıcı içeriği: şikâyet | Gönderi, yorum ve profilde **… → Şikâyet et** (4 sebep). Kayıtlar `reports` tablosunda. |
| 1.2 Kullanıcı içeriği: engelleme | Gönderi, yorum ve profilde **Engelle**; **Ayarlar → Engellenen kişiler**'den kaldırılır. |
| 1.2 Kullanıcı içeriği: filtre | Veritabanı küfür/hakaret filtresi (TR+EN): gönderi, yorum, ad/kullanıcı adı, kullanıcının eklediği mekân. |
| 1.2 Şikâyetlerin işlenmesi | Sunucu fonksiyonları hazır (`admin_reports`, `admin_resolve_report`: ihlal yok / içeriği kaldır / hesabı yasakla). Yönetim için ayrı web paneli yapılacak. |
| 1.2 Kullanım koşulları (EULA) | Kayıtta "Hesap oluşturarak Kullanım Koşulları'nı (topluluk kuralları dahil) kabul edersin", sıfır tolerans maddesi. |
| 2.1 Uygulama bütünlüğü | Ayarlanmamış Apple ile giriş kapalı (`APPLE_SIGN_IN_ENABLED`). Onboarding'de zorunlu adımlar atlanabilir. |
| 2.3.8 Uygulama ikonu | Expo varsayılanı yerine Puanla ikonu ve açılış görseli. |
| 5.1.1 Hesap silme | **Ayarlar → Hesabı sil** (iki onay, tüm veriler silinir). |
| 5.1.1 Gereksiz veri | Telefon numarası isteğe bağlı ("Şimdilik geç"), amacı ekranda yazıyor: rehberden arkadaş bulma. Rehber eşleştirme gelene kadar zorunlu yapılmamalı. |
| 5.1.1 İzin açıklamaları | Konum, kamera, fotoğraf, rehber açıklamaları Türkçe + İngilizce. |
| 5.1.2 Rehber verisi | Rehber yalnızca kullanıcı isteyince okunur; numaralar sunucuda özet (hash) olarak saklanır, isimler cihazdan çıkmaz, davet mesajını kullanıcı kendi WhatsApp/Mesajlar'ından gönderir (uygulama kimseye kendiliğinden mesaj atmaz). Gizlilik politikasında anlatılıyor; Ayarlar'da "Rehberden bulunabilirim" kapatılabilir. |
| 5.1.2 Gizlilik bildirimi | `app.json` → `ios.privacyManifests` (izleme yok, toplanan veri türleri, API gerekçeleri). |
| Şifreleme beyanı | `ITSAppUsesNonExemptEncryption: false`, her yüklemede soru sorulmaz. |
| Gizlilik politikası | Uygulama içinde + herkese açık link (aşağıda). |
| Yerelleştirme | Türkçe + İngilizce; **Ayarlar → Dil** (Cihaz dili / Türkçe / English). |

## 2. Senin yapman gerekenler (sırasıyla)

1. **Destek e-postası.** `destek@puanla.app` şu an çalışmıyor. Apple inceleme ekibi bu adrese yazabilir, çalışan bir adres şart.
   Alan adını alıp e-postayı kur. Başka bir adres kullanacaksan `src/constants/app.ts` → `SUPPORT_EMAIL`'i değiştir,
   sonra `npm run legal:build -- --upload` çalıştır.
2. **Apple Developer Program** üyeliği (yıllık 99 $): developer.apple.com/programs.
3. **Bundle ID** seçimi. İlk `eas build` sırasında sorulur ve sonradan değişmez (ör. `com.puanla.app`).
4. **İnceleme hesabı.** Uygulamadan normal şekilde bir hesap aç (ör. `inceleme@…`), birkaç mekân puanla, bir gönderi paylaş.
   E-posta ve şifreyi App Store Connect → App Review Information'a yaz.
5. **Derleme ve yükleme:**
   ```
   npx eas-cli build -p ios --profile production
   npx eas-cli submit -p ios --latest
   ```
6. **Ekran görüntüleri.** 6,9" iPhone (1320×2868) için en az 3, en fazla 10 adet; iPhone'dan çekilebilir. Önerilen sıra:
   Feed, Harita (renkli pinler), Mekân sayfası, Puanlama (Hangisi daha iyiydi?), Profil / Lezzet haritası.
   Hazır set: `docs/app-store-screenshots/out/puanla-1…9.png` (6,9": 1320×2868, TR) ve `out/6.5/` (6,5": 1284×2778). Kaynağı `screens.html`
   (uygulama arayüzünün HTML kopyası, demo içerik); değiştirince `bash docs/app-store-screenshots/render.sh`.
7. **Demo verisi kararı.** `@demo.puanla.app` hesapları kurgusal. Herkese açık yayından önce gerçek kullanıcı içeriğine
   geçmek daha güvenli: TestFlight'taki test kullanıcılarından içerik toplanır, sonra demo silinir
   (`supabase/scripts/remove-demo-data.sql`).

## 3. App Store Connect metinleri

### Genel
- **Ad:** Puanla
- **Birincil kategori:** Yemek ve İçecek (Food & Drink) · **İkincil:** Sosyal Ağ (Social Networking)
- **Gizlilik Politikası URL:** https://kzedsqgegrzmngxvhmfk.supabase.co/storage/v1/object/public/legal/privacy-tr.txt
- **Destek URL:** https://kzedsqgegrzmngxvhmfk.supabase.co/storage/v1/object/public/legal/support-tr.txt
- **EULA:** App Store Connect'te "Standard Apple EULA" kalabilir; kendi koşullarımız uygulama içinde ve
  https://kzedsqgegrzmngxvhmfk.supabase.co/storage/v1/object/public/legal/terms-tr.txt
- (İngilizce sayfalar: aynı adreslerde `-tr` yerine `-en`.)

### Türkçe (tr)
- **Alt başlık (30):** Gittiğin yerleri puanla, sırala
- **Tanıtım metni (170):** Arkadaşlarının gerçekten sevdiği mekânları keşfet. Gittiğin her yeri puanla, kendi sıralı listeni oluştur, yakınındaki lezzetleri haritada gör.
- **Anahtar kelimeler (100):** restoran,kafe,yemek,mekan,puan,liste,kahvaltı,meyhane,kebap,lezzet,harita,arkadaş,öneri
- **Açıklama:**
  ```
  Puanla, gittiğin restoran ve kafeleri puanlayıp sıraladığın, arkadaşlarının gerçekten sevdiği yerleri keşfettiğin sosyal bir lezzet uygulaması.

  PUANLA VE SIRALA
  Beğendim, idare eder ya da beğenmedim de; ardından iki mekânı karşılaştır. Puanla her yeri senin zevkine göre 10 üzerinden sıralar.

  ARKADAŞLARINA GÜVEN
  Tanımadığın yorumcular yerine takip ettiğin kişilerin puanlarını gör. Kimlerle gittiğini etiketle, fotoğraflarını paylaş.

  HARİTADA KEŞFET
  Topluluğun puanladığı mekânlar haritada puan renginde: yeşil harika, sarı idare eder, kırmızı uzak dur.

  LİSTEM
  Instagram ya da TikTok'ta gördüğün mekânı bağlantısıyla kaydet, gittiğinde tek dokunuşla puanla.

  LEZZET HARİTAN
  Hangi şehirde, hangi mutfakta ne kadar yer denediğini gör; rozetler kazan, yıllık hedef koy.

  Güvenli topluluk: uygunsuz içerik filtrelenir, her paylaşım şikâyet edilebilir, istemediğin kişileri engelleyebilirsin.
  ```

### English (en-US)
- **Subtitle (30):** Rate & rank places you eat
- **Promotional text (170):** Discover the places your friends actually love. Rate every spot you eat, build your own ranked list and see great food near you on the map.
- **Keywords (100):** restaurant,cafe,food,foodie,rating,ranking,list,breakfast,kebab,istanbul,map,friends
- **Description:**
  ```
  Puanla is a social food app for rating and ranking the restaurants and cafés you visit — and discovering the places your friends truly love.

  RATE AND RANK
  Say whether you liked it, then compare it with places you've been. Puanla ranks every spot by your own taste on a 10-point scale.

  TRUST YOUR FRIENDS
  See scores from people you follow instead of strangers. Tag who you were with and share your photos.

  DISCOVER ON THE MAP
  Places rated by the community show up on the map in score colors: green is great, yellow is okay, red is a pass.

  MY LIST
  Save places you spot on Instagram or TikTok with the link, then rate them with one tap once you've been.

  YOUR FOOD MAP
  See how many cities, cuisines and places you've tried; earn badges and set a yearly goal.

  A safe community: objectionable content is filtered, any post can be reported, and you can block anyone.
  ```

### App Privacy (Gizlilik etiketi) cevapları
- **Verileri izleme (tracking) için kullanıyor musunuz?** Hayır.
- **Toplanan veriler.** Hepsi *kullanıcıya bağlı*, amaç *App Functionality*, izleme *hayır*:
  - Contact Info → Name, Email Address, Phone Number
  - Contacts → Contacts (rehberdeki numaraların özeti; arkadaş bulma ve davet eşleştirme)
  - User Content → Photos or Videos, Other User Content (puan, yorum, gönderi)
  - Identifiers → User ID
- **Konum:** toplanmıyor. Yakındaki gönderiler için anlık sorguda kullanılıyor, saklanmıyor.
  Apple'ın tanımında gerçek zamanlı kullanılıp tutulmayan veri "toplanan veri" sayılmaz.
- Analiz, reklam, satın alma, sağlık, finans: yok.

### Yaş sınırı anketi
- Kullanıcı tarafından oluşturulan içerik: **Evet** (moderasyon, şikâyet ve engelleme var)
- Alkol, tütün, uyuşturucu atıfları: **Seyrek/Hafif** (meyhane, bar kategorileri)
- Diğerleri (şiddet, cinsellik, kumar vb.): **Yok**
- Beklenen sonuç: 13+ civarı.

### App Review notları (İngilizce yapıştır)
```
Puanla is a social app for rating restaurants. Sign-in is required to use it; please use the demo account below.

User-generated content safeguards (Guideline 1.2):
- Terms of Use with zero tolerance for objectionable content are accepted at sign-up (links on the welcome and password screens; also Settings > Terms of Use).
- Objectionable language is filtered server-side for posts, comments, names and user-added places.
- Report: "…" menu on any post, on comments (… button or long press) and on user profiles (… in the top right).
- Block: same menus; blocked users can be managed in Settings > Blocked people.
- Reports are reviewed within 24 hours.

Account deletion: Settings > Delete account.
Location is optional; without it the feed falls back to a city. Language: Settings > Language (Turkish / English).
```

## 4. Yayından sonra

- **Şikâyetler.** Web yönetim paneli gelene kadar: Supabase → Table Editor → `reports` (`resolved_at` boş olanlar).
  24 saat içinde bakılmalı. Panelin kullanacağı yönetici yetkisi SQL ile verilir:
  `update profiles set is_admin = true where id = '<kullanıcı id>';`
- **Alan adı gelince** yasal sayfaları HTML olarak barındır. `scripts/.cache/legal/*.html` hazır, Cloudflare Pages
  ya da GitHub Pages'e koyulabilir. Sonra `legalUrl` ve App Store Connect linklerini güncelle.
