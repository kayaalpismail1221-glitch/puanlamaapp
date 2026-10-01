# Supabase kurulumu

Puanla'nın bütün verisi (hesaplar, profiller, mekânlar, puanlar, gönderiler, fotoğraflar) Supabase'te tutulur.
Bu rehberi bir kez uygulaman yeterli. Süresi yaklaşık 15 dakika.

## 1. Proje aç

1. [supabase.com](https://supabase.com) → **New project**
2. Region: **Central EU (Frankfurt)**. Türkiye'ye en yakın bölge bu.
3. Veritabanı şifresini güvenli bir yere kaydet.

## 2. Uygulamaya bağla

1. Proje klasöründe `.env.example` dosyasını kopyalayıp adını `.env.local` yap.
2. Supabase paneli → **Project Settings → API** sayfasından iki değeri al:
   - `Project URL` → `EXPO_PUBLIC_SUPABASE_URL`
   - `anon` / `publishable` anahtar → `EXPO_PUBLIC_SUPABASE_ANON_KEY`
3. `service_role` / `secret` anahtarını **asla** uygulamaya koyma ve kimseyle paylaşma.

`.env.local` git'e girmez (`.gitignore`'da).

## 3. Veritabanını kur

**Kolay yol (SQL Editor):** Supabase paneli → **SQL Editor**. Aşağıdaki dosyaları **bu sırayla** tek tek yapıştırıp çalıştır:

1. `supabase/migrations/20260924100000_schema.sql`: tablolar
2. `supabase/migrations/20260924100100_policies.sql`: güvenlik kuralları
3. `supabase/migrations/20260924100200_api.sql`: feed, arama, sıralama fonksiyonları
4. `supabase/migrations/20260924100300_storage.sql`: fotoğraf depolama

İstersen ardından `supabase/seed.sql` dosyasını da çalıştır. Bu dosya 26 kurgusal mekân, 6 demo hesap ve 19 gönderi ekler; feed boş görünmez.
**Gerçek kullanıcılara açılmadan önce** `supabase/scripts/remove-demo-data.sql` ile bu demo verisini sil.

**CLI ile (ileride şema değiştikçe daha rahat):**

```bash
npx supabase login
npx supabase init
npx supabase link --project-ref <proje-kimliği>
npx supabase db push
```

## 4. Giriş ayarları (Authentication)

> **Şu anki durum:** Kendi SMTP servisimiz henüz yok. Supabase, SMTP bağlanmadan şablonları düzenletmiyor ve
> varsayılan e-postası kod değil bağlantı gönderiyor. Bu yüzden *Confirm email* **kapalı** ve uygulamada
> `EMAIL_CODES_ENABLED = false` (`src/constants/features.ts`); "Şifremi unuttum" gizli.
> Alan adı alınınca: Resend'i SMTP olarak bağla → aşağıdaki şablonları yükle → *Confirm email*'i aç →
> `EMAIL_CODES_ENABLED = true` yap.

**Authentication → Sign In / Providers → Email**
- *Confirm email* açıkken başkası senin e-postanla hesap açamaz (SMTP bağlanınca açılacak).
- Uygulama doğrulamayı bağlantıyla değil **6 haneli kodla** yapar. Bu yüzden e-posta şablonlarına kod eklenmeli.

**Authentication → Emails → Templates**: markaya uygun Türkçe şablonlar `supabase/templates/` klasöründe.
Dosyanın baştaki `<!-- -->` açıklaması hariç tamamını "Message body" alanına yapıştır:
- **Confirm signup** ← `confirm-signup.html` · Konu: `Puanla doğrulama kodun: {{ .Token }}`
- **Magic Link** ← `magic-link.html` · Konu: `Puanla giriş kodun: {{ .Token }}` (şifremi unuttum akışı)

Konuya kodun eklenmesi, iPhone'un kodu bildirimden okuyup klavyede önermesini sağlar.

**E-posta gönderimi:** Supabase'in yerleşik e-posta servisi saatte yalnızca birkaç e-posta gönderir ve sadece test içindir.
Beta'dan önce **Authentication → Emails → SMTP Settings** bölümünden kendi SMTP servisini bağla (ör. Resend, Postmark, Amazon SES).

**Apple ile giriş** (isteğe bağlı, App Store'a çıkmadan önce gerekli):
1. Apple Developer hesabında *Sign in with Apple* yetkisini aç.
2. Supabase → **Authentication → Providers → Apple** → etkinleştir.
3. *Client IDs* alanına uygulamanın bundle kimliğini yaz (ör. `com.puanla.app`). Expo Go'da denemek için
   `host.exp.Exponent` kimliğini de ekle.

**Android: Google ile giriş ve push.** (Harita anahtar istemez: MapLibre + OpenFreeMap.) İkisi de aynı Google Cloud projesinde (Firebase projesi açınca
otomatik bir Google Cloud projesi de açılır; hepsini onda yap). Değişkenler eksikse ilgili özellik gizlenir,
uygulama çökmez. Değişkenler derlemeye girer: ekledikten sonra **yeni Android build** gerekir (`npm run update` yetmez).
1. **İmza parmak izleri (SHA-1):** `eas credentials -p android` → production keystore'un SHA-1'i. Play Console'a
   yükleyince Play kendi anahtarıyla yeniden imzalar: **Play Console → Test and release → App integrity → App signing**
   sayfasındaki SHA-1 de eklenmeli. Yerel emülatör derlemesi için `android/app/debug.keystore`'un SHA-1'i
   (`keytool -list -v -keystore android/app/debug.keystore -storepass android`).
2. **Google ile giriş:** Google Cloud → APIs & Services → **OAuth consent screen** (uygulama adı Puanla, destek
   e-postası, gizlilik bağlantısı) → **Credentials → Create OAuth client ID**:
   - Bir tane **Web application** istemcisi → kimliği `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (EAS production + preview
     ortamları, yerelde `.env.local`). Gizli anahtarı (client secret) Supabase'e girilir, uygulamaya girmez.
   - Her SHA-1 için bir **Android** istemcisi: paket `app.puanla` + SHA-1. Uygulamaya yazılmaz; Google bu eşleşmeyle
     uygulamayı tanır (eksikse giriş `DEVELOPER_ERROR` verir).
   - Supabase → **Authentication → Sign In / Providers → Google** → etkinleştir; *Client ID* alanına Web istemci
     kimliği, *Client Secret*'a onun gizli anahtarı.
3. **Push (FCM):** Firebase → projeye Android uygulaması ekle (`app.puanla`) → `google-services.json`'u indir →
   `eas env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --environment production`
   (preview için de). Firebase → Project settings → **Service accounts → Generate new private key** →
   `eas credentials -p android` → *Google Service Account → Push Notifications (FCM V1)* → bu JSON'u yükle.
   `google-services.json` depoya girmez (`.gitignore`); yerel derlemede `.env.local`'a
   `GOOGLE_SERVICES_JSON=./google-services.json`. Hizmet hesabı anahtarı gizlidir, yalnızca EAS'a yüklenir.

**Telefon doğrulaması (SMS)** — rehberden arkadaş bulma bunun için gerekli:

> **Şu anki durum:** SMS sağlayıcısı yok, uygulamada `PHONE_VERIFICATION_ENABLED = false`
> (`src/constants/features.ts`). Kapalıyken "Rehberinden bul" ve kayıttaki kod adımı gizli; gönderide rehberden
> davet yine çalışır (davet edilen, numarasını doğruladığı gün eşleşir).

1. Bir SMS sağlayıcısında hesap aç: Supabase'in doğrudan desteklediği **Twilio** (ya da Twilio Verify, Vonage,
   MessageBird). SMS başına ücretlidir; Türkiye fiyatını ve Türkiye'ye gönderim kurallarını (gönderici adı kaydı)
   sağlayıcının sayfasından kontrol et. Netgsm gibi yerli bir sağlayıcı istenirse **Auth Hooks → Send SMS** ile
   bir Edge Function üzerinden bağlanabilir.
2. Supabase → **Authentication → Sign In / Providers → Phone** → etkinleştir, sağlayıcıyı seç, anahtarları gir.
3. **Authentication → Rate Limits → SMS** sınırını beklenen kayıt sayısına göre ayarla (saatlik gönderim sınırı).
4. Uygulamada `PHONE_VERIFICATION_ENABLED = true` yap ve `npm run update` ile yayınla.
5. Dene: Ayarlar → Arkadaş bul → **Numaranı doğrula** → gelen kodu gir → **Rehberini tara**.

Nasıl çalışır: uygulama `auth.updateUser({ phone })` ile kod ister, `verifyOtp(type: 'phone_change')` ile doğrular.
Supabase Auth `auth.users.phone_confirmed_at` alanını doldurunca `on_auth_user_phone` tetikleyicisi numarayı
`profile_private`'a onaylı olarak yazar; rehberinde bu numara olanlara ve davet edenlere "arkadaşın katıldı" gider.
Eşleşmede yalnızca doğrulanmış numaralar kullanılır; bir numara tek hesaba bağlıdır.

## 5. Dene

```bash
npx expo start --clear
```

iPhone'da Expo Go ile aç → **Başla** → kayıt ol. Demo verisini yüklediysen feed ve arama dolu gelir.

## Güvenlik özeti

- Her tabloda **RLS** açık. Giriş yapmamış kişi hiçbir içeriği göremez, herkes yalnızca kendi verisini değiştirebilir.
- Beğeni, yorum ve takipçi sayaçları ile puanlar veritabanında hesaplanır; uygulama bu değerleri değiştiremez.
- Fotoğraflar `post-photos/<kullanıcı>/…` ve `avatars/<kullanıcı>/…` klasörlerine yüklenir. Herkes yalnızca kendi klasörüne yazabilir.
- Telefon numarası `profile_private` tablosunda durur ve yalnızca sahibi görebilir; doğrulama alanlarını yalnızca
  sunucu yazar. Rehber numaraları ve davetler yalnızca SHA-256 özetiyle saklanır (`contact_hashes`, `invites`) ve
  yalnızca fonksiyonlarla okunur; rehber eşleştirme günde 30 istek / istek başına 3000 numarayla sınırlı.
- Kötüye kullanıma karşı günlük sınırlar var: 30 mekân, 30 gönderi, 300 yorum, 50 şikâyet, 50 davet.
- App Store kuralları için gönderi şikâyeti, kullanıcı engelleme ve uygulama içinden hesap silme hazır.
  Şikâyetler `reports` tablosunda birikir; panelden incelenir.

## Veritabanı testleri

Şema değişince testleri çalıştır. Supabase hesabı gerekmez, testler bilgisayarda gömülü bir Postgres (PGlite + PostGIS) üzerinde çalışır:

```bash
npm run test:db
```
