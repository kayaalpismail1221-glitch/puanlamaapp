# Puanla web sayfaları

Uygulaması olmayan kişinin paylaşılan bağlantıyı açabilmesi için sunucuda çizilen sayfalar.
Şimdilik yalnızca listeler: `/l/<liste-kimliği>` → `api/list.js` → Supabase `public_list` RPC'si.

- Sayfa sunucuda çizilir, çünkü WhatsApp/Instagram bağlantı önizlemesi JavaScript çalıştırmaz (OG etiketleri HTML'de).
- "Listeyi kaydet": uygulama yüklüyse `puanla://liste/<id>` açılır; değilse (`APP_STORE_URL` varsa) App Store'a gider.
- Mekân adları OSM'den geldiği için altta "© OpenStreetMap katkıcıları" atfı var (ODbL). Kaldırma.
- Supabase HTML sunmadığı için (Storage ve Edge Functions HTML'i düz metne çevirir) ayrı bir sunucu gerekiyor: Vercel (ücretsiz).

## Kurulum (Vercel, bir kez, Windows'tan tarayıcıyla)

1. vercel.com → GitHub ile giriş → **Add New… → Project** → `puanlamaapp` deposunu seç.
2. **Root Directory**: `web` (Edit'e basıp seç). Framework Preset: **Other**. Build ayarlarına dokunma.
3. **Environment Variables**:
   - `SUPABASE_URL` = `.env.local`'daki `EXPO_PUBLIC_SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY` = `.env.local`'daki `EXPO_PUBLIC_SUPABASE_ANON_KEY` (publishable/anon anahtar; service role DEĞİL)
   - `APP_STORE_URL` (isteğe bağlı): App Store ya da herkese açık TestFlight bağlantısı
   - `APP_STORE_ID` (isteğe bağlı, uygulama yayınlanınca): Safari'deki akıllı uygulama bandı için
4. **Deploy**. Adres ör. `https://puanla.vercel.app` olur (proje adına göre).
5. Uygulamada `src/constants/app.ts` → `WEB_URL` bu adres (sonunda `/` yok) → `npm run update`.
   Bundan sonra paylaşılan liste mesajlarında `puanla://` yerine web bağlantısı gider.

Alan adı alınınca: Vercel → Settings → Domains'e ekle, `WEB_URL`'i güncelle. Universal Links için
`/.well-known/apple-app-site-association` dosyası da buraya eklenecek (CLAUDE.md "Sıradaki işler" 1).

Her `main` push'unda Vercel kendiliğinden yeniden yayınlar.

## Test

`npm run test:web` (depo kökünde): çizim, HTML kaçışı, dil seçimi, istek işleyici.
Veritabanı tarafı (`public_list` yalnızca kimliği bilinen listeyi, girişsiz döner) `npm run test:db` içinde.
