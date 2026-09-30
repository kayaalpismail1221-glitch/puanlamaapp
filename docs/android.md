# Android rehberi

Puanla iOS örnek alınarak Android'e uyarlandı: aynı ekranlar ve akışlar, ama her yerde Android'in kendi dili
(Material ikonlar, alt sayfa menüler, Material 3 sekme çubuğu, geri tuşu, Google Haritalar). Bu belge
kodda hazır olanları ve derleme/yayın için senin yapman gerekenleri toplar.

## 1. Hızlı deneme (build gerekmez)

- **Android telefonda:** Play Store'dan **Expo Go**'yu kur → `npx expo start` → Expo Go'dan QR'ı okut.
  Harita Expo Go'da anahtarsız çalışır. Push bildirimi, "Paylaş → Puanla" ve rehber seçici Expo Go'da yok.
- **Telefon yoksa (Windows):** Android Studio → Device Manager → bir Pixel emülatörü aç → `npx expo start` → terminalde `a`.

## 2. Kodda hazır olanlar

| Konu | iOS | Android |
|---|---|---|
| İkonlar | SF Symbols (`icon.ios.tsx`) | Material Icons (`icon.tsx`, eşleme `constants/icons.ts`; dolu/boş hâller ayrı: beğeni, kaydet) |
| Seçenek menüleri | Sistem ActionSheet | Material alt sayfa (`components/dialog-host.tsx`); Android Alert'i en fazla 3 düğme gösterdiği için şart |
| Metin sorma (yıllık hedef) | `Alert.prompt` | Material diyalog (`showPrompt`) |
| Sekme çubuğu | UITabBar / Liquid Glass | Material 3 gezinme çubuğu, seçili sekmede açık lacivert gösterge |
| Cam yüzeyler (harita panelleri) | Liquid Glass / blur | Gölgeli opak yüzey (`GlassSurface`) |
| Modal sayfalar | Kart görünümlü sayfa | Aşağıdan kayan tam ekran sayfa |
| Geri | Kaydırma hareketi | Geri tuşu/hareketi; kayıt sonrası adımlarda kapalı, puanlamada bir adım geri (`useHardwareBack`) |
| Haptik | Taptic Engine | Sistem dokunma geri bildirimi (titreşim izni istemez) |
| Harita | Apple Haritalar | Google Haritalar; POI'ler gizli, pinler çizildikten sonra dondurulur (`ViewMarker`) |
| Yol tarifi | Uygulama içi rota (MKDirections) | Kuş uçuşu mesafe + **Google Haritalar'da aç** (ücretsiz Android rota servisi yok) |
| Paylaş → Puanla | Paylaşım uzantısı | Paylaşım menüsünde "Puanla" (intent), `paylasim-al`'a yönlenir |
| Klavye | RN `KeyboardAvoidingView` | react-native-keyboard-controller (kenardan kenara çizimde pencere küçülmüyor) |
| Apple ile giriş | Bayrakla | Gizli (Android'de Apple yok) |
| Bildirimler | APNs | FCM + `default` kanalı (Android 8+) |

Yeni kod yazarken:
- İkon: `import { Icon } from '@/components/icon'`. Yeni SF Symbol → önce `constants/icons.ts`'e Material karşılığını ekle
  (eklemezsen `tsc` hata verir).
- Menü: `showMenu` (`lib/dialogs.ts` ya da `lib/moderation.ts`), seçeneklere `icon` ver (Android'de görünür).
  `ActionSheetIOS`/`Alert.prompt`'u doğrudan kullanma; 3'ten fazla düğmeli `Alert.alert` yazma.
- Tam ekran haritada `fullScreenMapProps`/`quietMapProps` (`constants/map.ts`), özel pinde `ViewMarker`.
- `headerShown: false` modal ekranda Android'de üst güvenli alanı (insets.top) ekle; iOS'ta sayfa zaten durum çubuğunun altında.

## 3. Senin yapman gerekenler (sırasıyla)

1. **Google Haritalar anahtarı** (derlemede harita için şart; Expo Go'da gerekmez)
   - [Google Cloud Console](https://console.cloud.google.com/) → yeni proje → **Maps SDK for Android**'i etkinleştir →
     Kimlik bilgileri → API anahtarı oluştur. Mobil SDK'da harita görüntüleme şu an ücretsiz (güncel fiyatı Google'dan kontrol et).
   - Anahtarı kısıtla: *Android uygulamaları* → paket `app.puanla` + SHA-1 parmak izi
     (`eas credentials -p android` → production keystore'daki SHA-1; Play'e yükleyince Play Console → Uygulama bütünlüğü'ndeki
     "Uygulama imzalama anahtarı" SHA-1'ini de ekle).
   - EAS'ta ortam değişkeni: expo.dev → proje → Environment variables → `GOOGLE_MAPS_ANDROID_API_KEY`
     (görünürlük *Secret*, ortamlar: preview + production). `app.config.js` bunu okur.
2. **Push bildirimleri (Firebase)**
   - [Firebase Console](https://console.firebase.google.com/) → proje ekle → Android uygulaması ekle, paket `app.puanla` →
     `google-services.json`'u indir.
   - EAS'ta ortam değişkeni: `GOOGLE_SERVICES_JSON`, tür **File**, dosya olarak yükle (git'e girmez; yerelde köke koyarsan da okunur).
   - Firebase → Proje ayarları → Hizmet hesapları → yeni özel anahtar (JSON) → `eas credentials -p android` →
     *Google Service Account* → **FCM V1** için yükle. Sunucu bildirimleri Expo Push API'den gönderdiği için başka değişiklik gerekmez.
3. **İlk Android derlemesi**
   - Deneme (APK, telefona doğrudan kurulur): `eas build -p android --profile preview` → bağlantıyı telefonda aç, kur.
   - Mağaza (AAB): `eas build -p android --profile production`.
   - Sonra JS değişiklikleri `npm run update` ile iOS'la birlikte Android'e de gider (aynı `runtimeVersion`).
4. **Google Play**
   - [Play Console](https://play.google.com/console) geliştirici hesabı (tek seferlik 25 $), yeni uygulama "Puanla".
   - İlk AAB elle yüklenir (Dahili test kanalı önerilir); sonrası için `eas submit -p android` (Play hizmet hesabı JSON'u ister).
   - **Veri güvenliği formu:** toplanan veriler App Store gizlilik bildirimiyle aynı (ad, e-posta, telefon — isteğe bağlı,
     kullanıcı kimliği, fotoğraflar, kullanıcı içeriği, rehber — özet olarak; izleme/reklam yok). Hesap silme: uygulama içinde
     Ayarlar → Hesabı sil; Play ayrıca web'den silme bağlantısı ister → alan adı gelene kadar destek e-postası yazılabilir.
   - **İçerik derecelendirmesi:** kullanıcı içeriği var, şikâyet/engelleme var.
   - **Hedef kitle:** yetişkin/genç yetişkin yaş grupları (uygulama çocuklara yönelik değil).
   - Mağaza görselleri: telefon ekran görüntüleri (en az 2), 512×512 ikon, 1024×500 öne çıkan görsel.
5. Yayınlanınca `src/constants/app.ts` → Play Store bağlantısını davet mesajına eklemek istersen `inviteLink`'i
   güncelle (şimdilik mesaj "App Store'da ya da Google Play'de ara" diyor).

## 4. Bilinen farklar / sonraya kalanlar

- Uygulama içi yol tarifi yalnızca iOS'ta. Android için ücretli bir rota servisi (Google Routes API) ya da açık kaynak
  bir sunucu (OSRM) gerekir; şimdilik Google Haritalar'a devrediliyor.
- Google ile giriş yok (Android'de Apple ile giriş karşılığı). Eklenirse Supabase Google sağlayıcısı + `@react-native-google-signin`.
- Harita paylaşımında "Mesajlar" düğmesi SMS uygulamasına görsel ekler; bazı SMS uygulamaları eki desteklemez.
