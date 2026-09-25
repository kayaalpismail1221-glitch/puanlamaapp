/**
 * Uygulama geneli sabitler. Alan adı alınınca yalnızca buradaki değerler güncellenir.
 */

/** Destek, şikâyet ve gizlilik talepleri için iletişim adresi (yasal metinlerde de geçer) */
export const SUPPORT_EMAIL = 'destek@puanla.app';

/**
 * Herkese açık yasal metinler: Supabase Storage "legal" klasörü (`npm run legal:build -- --upload`).
 * Supabase HTML sunmadığı için düz metin; alan adı alınınca HTML sürümü oraya taşınıp burası güncellenir.
 * App Store Connect'teki Privacy Policy URL alanına `legalUrl('privacy', 'tr')` yazılır.
 */
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

export const legalUrl = (doc: 'terms' | 'privacy' | 'support', lang: 'tr' | 'en') =>
  `${SUPABASE_URL}/storage/v1/object/public/legal/${doc}-${lang}.txt`;

/**
 * Uygulamayı ilgili ekranda açan bağlantı (ör. `puanla://mekan/<id>`; Expo Router rotaları doğrudan eşler).
 * Uygulama yüklü olanlarda açılır. Alan adı alınınca https evrensel bağlantıya (Universal Links) geçilir;
 * paylaşım metinleri yalnızca bu fonksiyonu kullandığı için tek yerden değişir.
 */
export const APP_SCHEME = 'puanla';
export const appLink = (path: string) => `${APP_SCHEME}://${path}`;

/**
 * Davet mesajlarındaki indirme bağlantısı. Şimdilik App Store sayfası (yayınlanınca) ya da herkese açık
 * TestFlight bağlantısı buraya yazılır; boşsa mesaj "App Store'da Puanla'yı arat" der.
 * Alan adı gelince web önizleme sayfasına çevrilir (ör. `https://puanla.app/indir`) — tek yer burası.
 */
export const APP_STORE_URL = '';
export const inviteLink = () => APP_STORE_URL;
