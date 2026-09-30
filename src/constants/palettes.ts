/**
 * Açık ve koyu görünümün renk değerleri. Yalnızca veri (React Native içe aktarmaz): `theme.ts` ve Android renk
 * kaynaklarını yazan config eklentisi (`plugins/with-android-theme.js`, `app.config.ts` üzerinden) ortak kullanır.
 */

export const light = {
  // Yüzeyler
  background: '#FFFFFF',
  surface: '#F5F6F8',
  border: '#E5E7EB',
  /** Harita ve fotoğraf üstünde yüzen yarı saydam düğme/etiket zemini */
  floating: 'rgba(255, 255, 255, 0.92)',
  /** Gruplu liste ekranının zemini (Ayarlar gibi); satırlar `card` */
  grouped: '#F5F6F8',
  /** Zeminden bir kat yukarıdaki yüzey: gruplu satırlar, açılır pencere, alttan çıkan panel */
  card: '#FFFFFF',
  /** `card` üstündeki düğme/alan dolgusu */
  fill: '#F2F3F6',

  // Marka: açıkta lacivert mürekkep, koyuda beyaza yakın; dolu düğmelerde yazı onPrimary
  primary: '#0F1E3D',
  onPrimary: '#FFFFFF',
  /** Açık anahtar (Toggle) rengi */
  toggle: '#0F1E3D',
  /** Android alt çubuğunda seçili sekmenin hap göstergesi (Material 3 active indicator) */
  navIndicator: '#E3E8F1',

  // Metin
  text: '#111827',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',

  // Durumlar
  danger: '#DC2626',
  /** Silme gibi yıkıcı düğmelerin açık zemini */
  dangerSoft: '#FDECEC',
  warning: '#D97706',
  like: '#E11D48',
  overlay: 'rgba(15, 30, 61, 0.45)',

  // Çizim tarzı dünya haritası (profildeki lezzet haritası): kâğıt tonunda kara, yumuşak mavi deniz
  mapWater: '#DCE7F3',
  mapLand: '#FBFCFE',
  mapCoast: '#AFC0D4',
  mapBorder: '#D9E1EB',
  mapShadow: 'rgba(15, 30, 61, 0.10)',
};

export type Palette = Record<keyof typeof light, string>;

/**
 * Koyu görünüm: iOS'un koyu katmanlarıyla (sekme çubuğu, arama alanı, segment, anahtar) aynı nötr tonlar;
 * zemin siyaha yakın, bir kat yukarısı #1C1C1E. Marka mürekkebi beyaza yakın, anahtarlar puan yeşili.
 */
export const dark: Palette = {
  background: '#0B0B0D',
  surface: '#1C1C1E',
  border: '#2E2E32',
  floating: 'rgba(28, 28, 30, 0.9)',
  grouped: '#000000',
  card: '#1C1C1E',
  fill: '#2C2C2F',

  primary: '#F2F4F8',
  onPrimary: '#0F1E3D',
  toggle: '#3BA55C',
  navIndicator: '#2A3242',

  text: '#F5F5F7',
  textSecondary: '#A1A1A8',
  textTertiary: '#6D6D74',

  danger: '#FF6B6B',
  dangerSoft: '#3A1719',
  warning: '#FFB840',
  like: '#FF4F6F',
  overlay: 'rgba(0, 0, 0, 0.62)',

  mapWater: '#18212E',
  mapLand: '#2A3039',
  mapCoast: '#46505F',
  mapBorder: '#3A414C',
  mapShadow: 'rgba(0, 0, 0, 0.45)',
};

export const palettes = { light, dark } as const;

/** Android renk kaynağının adı: `textSecondary` → `puanla_text_secondary` (`@color/…`) */
export const androidColorName = (key: string) => `puanla_${key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)}`;
