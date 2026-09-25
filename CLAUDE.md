# Proje: Türkiye için sosyal restoran sıralama uygulaması (Beli uyarlaması)

## Fikir
Kullanıcılar gittikleri restoranları puanlar ve sıralar, arkadaşlarının nerede yediğini görür,
arkadaş tavsiyesine dayalı öneriler alır. Hedef kitle: Türkiye'de 18–35 yaş, şehirli, genç kullanıcılar.
Uygulama Türkçe ve İngilizce (kaynak dil Türkçe; bkz. "Çok dillilik").

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
- Mekân verisi: kendi `places` tablomuz; kullanıcılar mekân ekleyebilir (`mekan-ekle`). İstanbul verisi
  OpenStreetMap'ten (Overpass) içe aktarıldı — `scripts/osm/`: `npm run places:fetch` (0,2°'lik karelerle indirir,
  `scripts/.cache/osm/` önbelleği; Overpass IP başına ~4 sorgu sonra bekletir, ~20 dk) → `places:build` (ilçe/mahalle
  OSM sınırlarından nokta-çokgenle, kategori isim→`cuisine` etiketi→tür sırasıyla; kıraathane/ekmek fırını vb. ayıklanır)
  → `places:upload` (`source='osm'`, `external_id`=`node/123`, upsert; `.env.local`'da `SUPABASE_SERVICE_ROLE_KEY` ister).
  ODbL: Ayarlar'da "© OpenStreetMap" atfı zorunlu, kaldırma. OSM'de fotoğraf yok; kapsam Fatih/Kadıköy/Beyoğlu'da
  iyi, Şişli vb. zayıf → ileride Foursquare OS Places ile zenginleştirilebilir (Google Places kalıcı saklanamaz).

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

## Canlı ortam ve durum (2026-09-24 itibarıyla)
- Supabase projesi: `kzedsqgegrzmngxvhmfk` (Frankfurt). `.env.local` dolu (git'e girmez). Uygulanmış migration'lar:
  `20260924100000…100300` (şema, RLS, API, storage), `20260925100000_search_popularity` ve
  `20260926100000_osm_places` ('osm' kaynağı + 11 yeni kategori, toplam 23), `20260926110000_map_places`
  (harita topluluk katmanı), `20260927100000_moderation` (uygunsuz ifade filtresi + `blocked_users`).
  `20260928100000_recs_moderation_admin` (telefon o an kapatılmıştı, `is_admin` + şikâyet kuyruğu RPC'leri,
  `recommended_places`), `20260929100000_phone_optional`, `20260930100000_notifications` (bildirimler, 2026-09-25 canlıda doğrulandı). Eski demo silindi; canlıda 12.146 OSM
  mekânı ve gerçek mekânlar üzerine yeni demo var (`npm run demo:seed`: 7 `@demo.puanla.app` hesabı, 25 gönderi).
- Auth: e-posta/şifre açık, **Confirm email kapalı**. SMTP yok (Supabase SMTP'siz şablon düzenletmiyor ve
  varsayılan e-posta kod değil bağlantı gönderiyor). Bu yüzden `src/constants/features.ts` →
  `EMAIL_CODES_ENABLED = false` ("Şifremi unuttum" ve kod doğrulama gizli). Alan adı alınınca: Resend SMTP →
  `supabase/templates/` şablonlarını yükle (konuya `{{ .Token }}`) → Confirm email aç → bayrağı `true` yap.
- Apple ile giriş kodda hazır (`src/api/auth.ts`) ama `APPLE_SIGN_IN_ENABLED = false`: Apple Developer +
  Supabase Apple provider ayarlanınca açılır (yarım ayarlı buton inceleme reddi sebebi).
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
- Puanlama Beli tarzı kalır (kullanıcı kararı 2026-09-25; direkt 0–10 kaydırıcı denendi, vazgeçildi). Akış mantığı
  `hooks/use-rank-flow.ts`, görünüm `components/rank-steps.tsx` (`compact`). `degerlendir` tam ekran; gönderi ekranında
  aynı akış "Puanın" bölümüne gömülü ve zorunlu (puanlıysa rozet + "Değiştir"); yeni puan paylaşırken kaydedilir.
- İstemci: sahte veri tamamen kaldırıldı. Oturum/iyimser güncelleme/cihaz önbelleği `store/app-store.tsx`;
  gönderi paylaşımı yeni puanın yazılmasını bekler (`waitForRank`). Foto: telefonda 1440 px + 480 px küçük kopya
  (`<kullanıcı>/<gönderi>/<n>.jpg` ve `_t.jpg`).
- Özellikler: kayıt/giriş/Apple/şifre sıfırlama (kapalı), kod doğrulama ekranı (kapalı), mekân ekleme
  (`mekan-ekle`, haritadan konum + ters geokodlama), gönderi şikâyeti, kullanıcı engelleme, yorum silme,
  hesap silme, Listem, konum yokken feed İstanbul'a düşer + "konumunu aç" bandı.
- Profilde **Lezzet haritası** (Beli "Dining Map" esinli, kopya değil): Natural Earth'ten üretilen çizim tarzı
  dünya haritası (`npm run generate:world-map` → `constants/world-map.ts`, Miller projeksiyonu `lib/world-projection.ts`),
  şehir başına nokta, en fazla Marmara/bölge ölçeğine yakınlaşır (`MIN_MAP_VIEW_WIDTH`). İki çözünürlük: dünya 1:50m,
  Avrupa–Türkiye–Orta Doğu 1:10m (görünüm bölgedeyse; kıyı ve ülke sınırı ayrı çizilir). Görünüm: kâğıt tonunda kara +
  gölge, yumuşak deniz (enlem-boylam ağı yok: yakında tek çizgi kusur gibi duruyor); noktalar tek renk (puan değil,
  gidilen yer; kullanıcı kararı), çakışmayan şehir etiketleri (uygulama yazı tipiyle, SVG üstünde). Büyük hâli `gittigi-yerler/[id]`: şehir noktasına ya da
  Mutfaklar/Şehirler/İlçeler satırına dokununca o yerdeki gönderiler. Kart gönderilerin üstünde.

## Geliştirme notları
- Web'de hızlı akış testi: `npx expo start --web --port 8090` (8081 kullanıcının Expo Go sunucusu olabilir, dokunma).
  Web için: `metro.config.js` react-native-maps'i `src/shims/react-native-maps.web.tsx` yer tutucusuyla değiştirir;
  SwiftUI bileşeni `segmented-control.ios.tsx`'e ayrıldı; `app.json` web çıktısı `single`.
- Web'de Alert görünmez ve tarayıcı aracının tıklaması bazı Pressable'lara ulaşmaz; gerekirse düğmenin
  `onPress`'i React fiber'dan tetiklenir. Reanimated `entering` animasyonları web'de öğeyi gizli bırakabiliyor.
- `package.json`'daki `tunnel` betiği ve `@expo/ngrok` kullanıcının eklediği, commit edilmemiş değişiklik.

## Sıradaki işler (büyüme önceliğine göre; bkz. "Büyüme" ilkesi)
1. **Alan adı + web önizleme sayfaları** (`/p/<gönderi>`, `/m/<mekân>`, `/@<kullanıcı>`, OG görseli, App Store butonu)
   + Universal Links (`appLink` https'e geçer) + App Store `ct` kampanya parametresi. Aynı alan adıyla Resend SMTP →
   e-posta doğrulama/şifre sıfırlama; yasal sayfalar HTML.
2. **Birinci taraf ölçüm:** `events` tablosu, paylaşımlarda davet kodu/`sharer_id`, telefonla davet eşleştirme,
   uzak özellik bayrakları (A/B için). Gizlilik metnini güncelle.
3. **Masa döngüsü:** rehberden etiketleme (uygulamada olmayan dahil), "Sen kaç verirdin?" daveti, davet bağlamını
   koruyan onboarding, puan karşılaştırma ekranı. Rehber eşleştirme gelince telefon zorunlu olur.
4. Bildirimler: "arkadaşın katıldı" (rehber eşleştirme gelince) ve ölü jeton temizliği (Expo yanıtı `DeviceNotRegistered`).
5. Hikâye kartlarına link/CTA; paylaşılabilir listeler; damak uyumu %; grup oylaması; şehir içi "lezzet rotası" kartı.
6. App Store çıkışı (`docs/app-store.md`), web yönetim paneli (şikâyet kuyruğu; RPC'ler hazır),
   Foursquare OS Places ile mekân zenginleştirme.

## Büyüme: viralite ve ağ etkisi (kalıcı ilke)
Amaç: kullanıcı kazanımını ürünün kendisi üretsin, dağıtım pahalı olmasın. Her yeni özellik şu sorulardan geçer:
1. **Hangi döngüyü besliyor?** Kullanıcı → eylem → paylaşım → yeni kullanıcı → aktivasyon → tekrar. Hiçbir döngüye
   ya da ağ etkisine hizmet etmiyorsa önceliği düşük.
2. **Ağ etkisi yaratıyor mu?** Yeni kullanıcı geldikçe mevcut kullanıcının değeri artmalı (arkadaş puanları
   `friend_scores`, öneriler `recommended_places`, topluluk ortalaması `map_places`, feed yoğunluğu). Ağ etkisi yerel:
   büyüme İstanbul'da semt/kampüs kümelerinde yoğunlaşır, dağınık büyüme etkiyi sulandırır.
3. **Paylaşım temel eylemin yan ürünü mü?** Paylaşım puanlama/gönderi anına bağlanır (ör. gönderi sonrası hikâye
   önerisi). Doğal viralite: kullanıcı kendi isteğiyle paylaşır. Bazı özellikler ileride davetle açılabilir.
4. **Paylaşılan her şeyin gidecek yeri var mı?** Her dış paylaşım uygulaması olmayan kişiyi de karşılar (web sayfası +
   App Store) ve bir çağrı içerir ("Sen kaç verirdin?", "Listeyi kaydet"). Uygulamaya özel `puanla://` tek başına yetmez.
5. **Ölçülebilir mi?** Paylaşımlar kaynağını taşır (davet kodu/`sharer_id`, App Store `ct`). Ölçüm birinci taraf
   (Supabase); üçüncü taraf analiz SDK'sı yok. Huni: paylaşım oranı → link açılma → kurulum → kayıt → 7 günde
   aktivasyon (≥3 puan + ≥3 takip) → ikinci kuşak paylaşım; kohort bazlı K ve döngü süresi.
6. **Davet bağlamı korunur:** linkle gelen kişinin onboarding'i o mekânla (`ilk-puan`) ve davet edenle (`takip`) başlar.

Durum (2026-09-25): K ≈ 0. `puanla://` linkleri uygulaması olmayana açılmıyor, Ayarlar'daki davet mesajında link yok,
etiketleme yalnızca mevcut kullanıcılar arası ve bildirimsiz, ölçüm yok. En zayıf halka: link → karşılama.
Başlangıç dağıtımı kullanıcının ~180 bin takipçili gastronomi hesabı: bu bir kanal, döngü değil; döngüler onu çoğaltır.
Gerçekçi hedef K ≈ 0,3 (her kampanyanın etkisini ~1,4 katına çıkarmak), K > 1 beklenmez.

**Ana döngü, Masa döngüsü:** restorana genelde birlikte gidilir. Puanla → masadakileri rehberden etiketle →
"X, Y'ye 8,7 verdi. Sen kaç verirdin?" (sistem paylaşım menüsüyle WhatsApp/iMessage) → web sayfası (puan, sen
puanlayınca açılır) → kurulum → aynı mekânı puanla + davet edeni takip et → karşılaştırma → bir sonraki yemekte kendi
masasını etiketler. Atıf kayıttaki telefon numarasıyla (SDK'sız). Viral etkiyle ağ etkisini aynı eylemde birleştirir.

Diğer döngüler: hikâye kartları (var), paylaşılabilir listeler (içerik üreticisi → takipçi kaydeder → kendi listesi),
damak uyumu %, "Nerede yiyoruz?" grup oylaması (uygulamasız web), okul rekabeti kartı, web mekân sayfalarıyla SEO.
Tutunma tarafı: bildirimler ve rehber eşleştirme olmadan ağın ürettiği değer kullanıcıya ulaşmaz.

## Çok dillilik (kalıcı ilke)
- i18next + react-i18next + expo-localization. `src/i18n/index.ts`: uygulamaya özel örnek, dil tercihi
  (`system`/`tr`/`en`, AsyncStorage `puanla:language`), `useLanguagePreference`, `currentLanguage/currentLocale`.
  Varsayılan: cihaz Türkçe ise Türkçe, değilse İngilizce. **Ayarlar → Dil** anında uygular; açılış ekranı tercih
  okunana kadar bekler.
- **Kullanıcıya görünen her metin `t()` ile**: önce `locales/tr.ts` (kaynak), sonra `locales/en.ts`. `en.ts`
  `Translation` tipiyle tr'nin ağacını birebir karşılamak zorunda (eksik anahtar = tsc hatası). Çoğul: `_one/_other` + `count`.
  Cümle içi bağlantı/vurgu için `<Trans>` (ör. `LegalConsent`). Render dışındaki kod `i18n.t` kullanır.
- Veritabanı değerleri Türkçe kalır, ekranda çevrilir: `cuisineLabel`, `highlightLabel`, `mealLabel`,
  `t('sentiments.*')`, `t('badges.<id>.*')`. Veritabanı hata mesajları `api/errors.ts`'te `hint` ile çevrilir.
- Biçimlendirme dile göre: `formatScore` (8,7 / 8.7), `timeAgo`, `monthYear`, `formatDistance`. Bunları kullanan
  bileşen `useTranslation()` çağırmalı ki dil değişince yeniden çizilsin.
- iOS: `app.json` → `locales` (`assets/locales/{tr,en}.json`: izin açıklamaları), `CFBundleLocalizations`.
- Okul adları, mekân/semt adları özel isim: çevrilmez. `backend-setup.tsx` yalnızca geliştiriciye görünür.

## App Store ve kullanıcı güvenliği (kalıcı ilke)
- Kural 1.2: her gönderi/yorum/profilde şikâyet + engelle (`lib/moderation.ts`: `showMenu`, `openReportMenu`,
  `confirmBlock`); Ayarlar → Engellenen kişiler (`blocked_users` RPC, engel kaldırma). Yeni kullanıcı içeriği
  ekranı eklenirse aynı menü eklenmeli.
- Uygunsuz ifade filtresi veritabanında (`is_objectionable`, `hint = 'objectionable'`); İngilizceyle çakışan kısa
  kelimeler (got, pic, oc) listede yok — eklerken test yaz.
- Yasal metinler tek kaynak `src/constants/legal.ts` (terms/privacy/support, TR+EN, `{{email}}` yer tutucu).
  Uygulama içi `app/yasal/[belge]` (kosullar/gizlilik, kayıt öncesi de açılır). Herkese açık kopya:
  `npm run legal:build -- --upload` → Supabase Storage `legal/*.txt` (Supabase HTML sunmuyor; UTF-8 BOM'lu düz metin).
  İletişim adresi `constants/app.ts` → `SUPPORT_EMAIL` (şimdilik `destek@puanla.app`, henüz çalışmıyor).
- Kayıtta telefon isteğe bağlı ("Şimdilik geç"; `profile_private.phone`, yalnızca sahibi görür). Kullanıcı kararı: ileride
  rehberden arkadaş bulma gelince zorunlu yapılacak (o zamana kadar zorunlu olması 5.1.1 riski). Migration
  `20260929100000_phone_optional`. İlk puan ve takip adımları atlanabilir (2.1).
  Hesap silme Ayarlar'da.
- Şikâyet işleme **ayrı bir web yönetim panelinden** yapılacak (kullanıcı kararı; uygulamada moderasyon ekranı yok).
  Hazır RPC'ler: `admin_reports`, `admin_resolve_report` (dismiss/remove/ban; ban = `auth.users.banned_until =
  infinity`), yetki `profiles.is_admin` (yalnızca SQL ile). Panel gelene kadar şikâyetler Supabase → `reports`.
- `app.json`: `privacyManifests`, `ITSAppUsesNonExemptEncryption: false`. Özellik bayrakları `constants/features.ts`.
- İkon/açılış görseli `npm run icons:generate` (`scripts/generate-icons.py`, Georgia Bold "p" + puan yeşili nokta).

## Tasarım sistemi
- Arka plan: tamamen beyaz `#FFFFFF`. Yemek fotoğrafları öne çıksın diye ekranlar sade ve ferah kalmalı.
- Ana marka rengi (Primary): gece mavisi / lacivert `#0F1E3D`.
  Header'lar, alt bar, yapısal ikonlar, ana butonlar, puan rozetleri gibi işlevsel ve dekoratif öğelerde kullanılır.
- Metin: ana metin `#0F1E3D` veya `#111827`, ikincil metin `#6B7280`
- Ayırıcı çizgiler ve kart kenarları: `#E5E7EB`, açık gri yüzeyler: `#F5F6F8`
- Puan renkleri (her yerde: pin, rozet, ızgara, arkadaş puanı): kırmızı 0–3,3 → sarı 3,4–6,6 → yeşil 6,7–10,
  grup içinde uca doğru koyulaşır (10'a yaklaştıkça koyu yeşil). `theme.ts`: `scoreColor` (dolgu/kenar),
  `scoreInk` (beyaz zeminde yazı), `onScoreColor` (dolgu üstünde yazı).
- Font: iOS sistem fontu (SF Pro), ayrı font yükleme yok
- Köşe yarıçapları: kartlar 16, butonlar 12, avatarlar tam yuvarlak
- Boşluklar 4'ün katları (4, 8, 12, 16, 24, 32)
- Renkleri ve ölçüleri tek bir `theme.ts` dosyasında token olarak tut. Bileşenlerde sabit renk yazma.
- Dokunmalarda hafif haptik geri bildirim, geçişler akıcı olmalı
- Veri yüklenirken spinner değil, ekranın düzenini taklit eden iskelet (`components/skeleton.tsx`). Spinner yalnızca
  buton içi işlemler, sayfa sonu yükleme ve açılışta kullanılır. Yeni liste/ekran eklenirse iskeleti de eklenir.

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
2. Telefon (isteğe bağlı) → E-posta → 3. Ad ve soyad (kullanıcı adı otomatik türetilir, boşta mı kontrol edilir;
   istenirse aynı ekranda "Değiştir" ile elle seçilir, zorunlu değil) → 4. Şifre + koşulları kabul cümlesi →
   Supabase `signUp` (taslak AsyncStorage'da, şifre asla saklanmaz).
   Doğrulama açıksa `onboarding/dogrula` (6 haneli kod). Oturum açılınca kök düzen yarım kalan kuruluma
   (`ilk-puan`) yönlendirir; `profiles.onboarded_at` dolunca sekmelere geçilir.
   Her adımda tek soru, büyük giriş alanı, adım ikonu ve ince ilerleme çubuğu.
5. En son gidilen 1 restoranı Beli tarzı puanla ("Beğendim / İdare eder / Beğenmedim" + ikili karşılaştırma),
   ardından normal gönderi ekranı açılır (fotoğraf isteğe bağlı, "Şimdilik atla" var). Adım atlanabilir.
6. En az 5 kişiyi takip et ("Hepsini takip et" kısayolu) → Başla; "Şimdilik geç" ile atlanabilir.

### Alt bar (5 sekme)
- **Feed:** iki sekme. *Popüler* (varsayılan): konumun yakınındaki en popüler gönderiler (3→10→30 km,
  yoksa en yakın şehir); kullanıcı şehir/ilçe seçerse o bölgenin popüler feed'i. *Takip*: takip edilenlerin
  ve kullanıcının gönderileri. Gönderi = mekân + fotoğraflar (en fazla 5) + yorum
  + birlikte gidilen arkadaş etiketleri + puan. Beğenilir (çift dokunuş dahil), yorum yapılır, kaydedilir.
  Mekân sayfasında o mekânın gönderileri "Gönderiler" ızgarasında listelenir.
  Gönderide yapılandırılmış bilgiler (hepsi isteğe bağlı): öğün, öne çıkanlar (fiyat/performans, öğrenci dostu…).
  Mekân sayfası öne çıkanlardan "Puanla kullanıcılarına göre" özetini çıkarır.
  **Ürün kararı:** fiyat hiçbir yerde yok — mekânda ₺/$ fiyat seviyesi gösterilmez, kişi başı hesap ve
  "ne yedin" sorulmaz (Beli'deki statü/gösteriş eleştirisine karşı; kimse hesap vermek zorunda kalmasın).
  DB'deki `price_level`, `price_per_person`, `dishes` sütunları eski veri için duruyor, istemci kullanmıyor.
- **Ara:** mekân ve kişi araması tek yerde (Tümü / Mekânlar / Kişiler)
- **Harita:** Puanla (varsayılan; görünen bölgede topluluğun puanladığı mekânlar, topluluk ortalamasıyla — `map_places`) ·
  Gittiklerim · Listem; pinler puan renginde
- **Listem:** gitmek istenen mekânlar, iki bölüm:
  - *Sosyal medyadan*: Instagram/TikTok'ta görülen mekân, gönderi bağlantısı ve notla (panodaki link otomatik yakalanır)
  - *Kaydettiklerim*: uygulama içinde yer imiyle kaydedilen mekânlar ve gönderiler
  - Mutfak/kaynak filtresi, sıralama (en yeni, arkadaş puanı, A–Z), sola kaydır → Gittim / Sil, haritada gör
- **Profilim:** Beli tarzı istatistik satırı: Takipçi · Takip · Sıralama. Sıralama = paylaşılan değerlendirme
  (gönderi) sayısına göre liderlik tablosundaki yer (eşitlikte beğeni); ilk değerlendirmeye kadar kilitli.
  Liderlik tablosu: Genel / Arkadaşlar, Tüm zamanlar / Bu ay.
  Beli'nin kopyası değil, kendi karakteri var: Top 3'üm vitrini, Damak zevkin (mutfak payları),
  Türk mutfağına özel rozetler, Seri, yıllık hedef, Gönderilerim ızgarası. Sağ üstte paylaş + ⚙️ Ayarlar.

### Diğer ekranlar
- **Sana özel öneriler** (`oneriler`, profilde 10 puandan sonra açılır): `recommended_places` — gitmediğin, arkadaş
  (öncelikli) ya da topluluk ortalaması ≥ 6,7 mekânlar; sevdiğin mutfağa bonus, konum varsa uzaklık cezası.
- **Paylaşım** `lib/share.ts`: profil, gönderi (… menüsü), mekân (sağ üst) → metin + `appLink()` (`puanla://…`,
  Expo Router rotalarını doğrudan açar). Alan adı gelince `constants/app.ts` → `appLink` https evrensel bağlantıya çevrilir.
- **Bildirimler** (migration `20260930100000_notifications`): `notifications` tablosunu yalnızca tetikleyiciler yazar
  (beğeni, yorum, etiket, takip; "arkadaşın gittiğin yeri puanladı" = puanlayanı takip eden ve o mekânı puanlamış
  kişilere, işlem sonunda çalışan ertelenmiş tetikleyiciyle). Kendine, engelli çiftlere ve oturumsuz betiklere bildirim
  yok; `notifications_once` tekrarları yutar, beğeni/takip/etiket geri alınınca bildirim silinir. Push: bildirim eklenince
  `pg_net` ile Expo Push API'ye (alıcının dilinde metin `notification_text`, dokununca açılan yol `notification_path`,
  rozet = okunmamış sayısı); pg_net yoksa (testler) atlanır. Jetonlar `push_tokens` (yalnızca `register/unregister_push_token`),
  tür başına kapatma `profile_private.push_muted`. İstemci: `lib/notifications.ts` (izin öncesi açıklama, cihaz kaydı,
  dokununca yönlendirme, çıkışta jeton silme), `bildirimler` (Bugün/Bu hafta/Daha önce, açılınca okundu), `bildirim-ayarlari`,
  Feed'de zil + okunmamış rozeti. APNs anahtarı EAS build sırasında kurulur; yeni build gerekir.
- **Feed mekaniği (akıcılık):** FlashList (`getItemType` foto/fotosuz), `PostCard` memo ve yalnızca kendi beğeni/kaydetme
  durumunu dinler (`useAppSelector` / `useAppActions`; uzun listelerde `useAppStore` kullanma, her değişimde yeniden çizer).
  Popüler feed sabit anda sıralanır (`feed_popular(..., p_as_of)`, migration `20261001100000_feed_as_of`; yanıttaki `as_of`
  sonraki sayfalarda geri yollanır), istemci ayrıca tekrarları ayıklar. Yenileme yalnızca ilk sayfayı çeker (`restart`).
  Fotoğraf: küçük kopya `placeholder`, `recyclingKey`, yeni sayfanın görselleri diske önceden indirilir; karusel genişliği
  ekrandan. Açılışta açılış görseli yalnızca oturum/tercih okunana kadar; veri beklenirken `LaunchSkeleton`.
- **Yol tarifi** (`yol-tarifi/[id]`, mekân sayfasındaki haritaya dokununca): yerel Expo modülü `modules/puanla-directions`
  (Swift, Apple MKDirections; anahtar/ücret yok, EAS build'de derlenir, Expo Go ve web'de yok → `inAppDirections` false,
  kuş uçuşu + Apple Haritalar yedeği). Yürüyerek/arabayla rota çizgisi, süre, mesafe, varış, adımlar; Başlat: konum takibi,
  talimat bandı + sesli okuma (`expo-speech`), adım ilerletme/rotadan çıkınca yeniden hesaplama/varış (`lib/directions.ts`),
  ekran açık kalır. Toplu taşımada MapKit yalnızca süre verir; hat adımları için Apple Haritalar açılır.
- **Paylaş → Puanla** (`expo-share-intent`, iOS paylaşım uzantısı `app.puanla.share-extension`, App Group `group.app.puanla`):
  Reels/TikTok/Safari'den paylaşılan bağlantı → `+native-intent` (`dataUrl=` yolunu `paylasim-al`'a çevirir) →
  `listeye-ekle` (`baglanti` hazır, `ara`: paylaşımdaki 📍 mekân adı; TikTok'ta açıklama oEmbed'den, Instagram açıklama vermez).
  Sağlayıcı kök düzende en dışta; Expo Go ve web'de kapalı. Yeni build gerekir.
- **Lezzet haritası paylaşımı** (`harita-paylas/[id]`, profildeki harita kartının paylaş simgesi; kendi ve başkasının):
  degrade zeminde beyaz kart ("{Ad}'ın lezzet haritası" — `lib/possessive.ts` Türkçe iyelik eki —, şehir · mekân sayısı,
  harita, en çok gidilen mutfaklar), altta Paylaş / Kaydet (Fotoğraflar, yalnızca ekleme izni) / Mesajlar (görsel ekli) /
  Bağlantı. Dışa aktarma `lib/story-export.ts`; `expo-media-library` ve `expo-sms` yalnızca düğmeye basınca yüklenir
  (yerel modül yoksa dosya yüklenirken hata veriyor). Beli'den esinli, birebir kopya değil (App Store 4.1/4.3);
  Instagram/TikTok logoları kullanılmaz.
- **Hikâye kartları** (`hikaye`, 1080×1920 PNG, `react-native-view-shot` + `expo-sharing`): Favori 5, Lezzet haritası,
  Bu ay (aylık özet; bu ay boşsa geçen ay), tek gönderi. Kartlar `components/story-cards.tsx` (540×960 çizilir,
  Instagram güvenli alanı içinde), veri `lib/story.ts`. Giriş: Profil → Paylaş menüsü, kendi gönderisinin … menüsü,
  lezzet haritası paylaş ikonu, gönderi paylaşıldıktan sonra öneri (onboarding hariç).
- **Gönderi düzenleme** (`gonderi-duzenle`, kendi gönderinde … → Düzenle): açıklama, öğün, öne çıkanlar;
  fotoğraf ve puan değişmez. Öğün/öne çıkan seçicileri `components/post-fields.tsx` (oluşturma ile ortak).

## Türkiye'ye özgü notlar (ileride)
- Kategoriler: kahvaltıcı, esnaf lokantası, dürümcü, kokoreççi, ciğerci, balıkçı, meyhane
- İlk hedef tek bir şehir ve tek bir çevre (ör. bir üniversite)
- Paylaşılabilir "en iyi mekânlarım" kartı (Instagram hikâyesi için)

## Çalışma kuralları
- Küçük adımlarla ilerle. Her adım sonunda `npx expo start` ile iPhone'da test edilebilir olsun
- Kullanıcı Türkçe ve gündelik konuşur ("bro"); Beli'den ilham alınır ama ekranlar birebir kopyalanmaz
- Kod açıklamaları Türkçe; kullanıcıya görünen metinler i18n'de (Türkçe kaynak + İngilizce çeviri)
