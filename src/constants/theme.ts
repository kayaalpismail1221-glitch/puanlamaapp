import { DynamicColorIOS, Platform, type ColorValue } from 'react-native';

/**
 * Tasarım token'ları. Bileşenlerde sabit renk/ölçü yazma; hepsini buradan al.
 *
 * Açık ve koyu görünüm: `colors` iOS'ta `DynamicColorIOS` değerleridir; sistem (ya da Ayarlar → Görünüm)
 * değişince her ekran yeniden çizilmeden anında uyum sağlar. Renk metni gereken yerlerde (SVG, gezinme
 * teması, degrade) `usePalette()` ile o anki paletin düz değerleri alınır. Görünümden bağımsız kalması
 * gerekenler (fotoğraf üstü yazı, paylaşım kartları) `fixed` kullanır.
 */

const light = {
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
const dark: Palette = {
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
export type Scheme = keyof typeof palettes;

/** iOS'ta görünüme göre değişen renk; Android ve web şimdilik açık görünümde */
export function dynamicColor(lightValue: string, darkValue: string): ColorValue {
  return Platform.OS === 'ios' ? DynamicColorIOS({ light: lightValue, dark: darkValue }) : lightValue;
}

export const colors = Object.fromEntries(
  Object.keys(light).map((key) => [key, dynamicColor(light[key as keyof Palette], dark[key as keyof Palette])]),
) as Record<keyof Palette, ColorValue>;

/** Görünümden bağımsız renkler: fotoğraf ve renkli zemin üstü yazı, paylaşım kartları */
export const fixed = {
  white: '#FFFFFF',
  navy: '#0F1E3D',
  ink: '#111827',
  /** Paylaşım kartlarındaki (hikâye, harita) çizim haritası: her zaman açık */
  map: {
    water: light.mapWater,
    land: light.mapLand,
    coast: light.mapCoast,
    border: light.mapBorder,
    shadow: light.mapShadow,
  },
} as const;

/** Paylaşım kartlarının zemini: marka lacivertinden açık maviye */
export const gradients = {
  share: ['#0F1E3D', '#22386A', '#5670AE'] as const,
  shareStops: [0, 0.55, 1] as const,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  card: 16,
  button: 12,
  full: 999,
} as const;

// iOS sistem fontu (SF Pro) kullanılır; fontFamily belirtmiyoruz.
export const typography = {
  largeTitle: { fontSize: 34, fontWeight: '700', letterSpacing: 0.4 },
  title: { fontSize: 28, fontWeight: '700', letterSpacing: 0.3 },
  title2: { fontSize: 22, fontWeight: '700' },
  title3: { fontSize: 20, fontWeight: '600' },
  headline: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 17, fontWeight: '400' },
  callout: { fontSize: 16, fontWeight: '400' },
  subhead: { fontSize: 15, fontWeight: '400' },
  footnote: { fontSize: 13, fontWeight: '400' },
  caption: { fontSize: 12, fontWeight: '500' },
} as const;

export type TypographyVariant = keyof typeof typography;

/** Sistem font aileleri (ayrı font yüklenmez): iOS'ta New York serif ve SF Rounded */
export const fonts = {
  serif: Platform.select({ ios: 'ui-serif', default: 'serif' }),
  rounded: Platform.select({ ios: 'ui-rounded', default: undefined }),
} as const;

export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 } as const;

/**
 * Puan renk skalası: kırmızı (beğenmedim) → sarı (idare eder) → yeşil (beğendim).
 * Her grup kendi içinde uca doğru koyulaşır: 10'a yaklaştıkça yeşil derinleşir, 0'a yaklaştıkça kırmızı.
 * Grup sınırları `lib/ranking.ts` SENTIMENT_RANGES ile aynı.
 */
const SCORE_BANDS: { min: number; max: number; from: string; to: string }[] = [
  { min: 6.7, max: 10, from: '#65B32E', to: '#1E7B3C' },
  { min: 3.4, max: 6.6, from: '#F2A516', to: '#F5C518' },
  { min: 0, max: 3.3, from: '#B42318', to: '#EF4B3C' },
];

const hexToRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** "#RRGGBB" → yarı saydam "rgba(…)" (degradelerde zemine erime için) */
export const withAlpha = (hex: string, alpha: number) => `rgba(${hexToRgb(hex).join(', ')}, ${alpha})`;
const rgbToHex = (rgb: number[]) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
const mix = (a: string, b: string, t: number) => {
  const [x, y] = [hexToRgb(a), hexToRgb(b)];
  return rgbToHex(x.map((c, i) => c + (y[i]! - c) * t));
};

/** Puana göre pin/rozet dolgu ve kenar rengi */
export function scoreColor(score: number): string {
  const band = SCORE_BANDS.find((b) => score >= b.min) ?? SCORE_BANDS[SCORE_BANDS.length - 1]!;
  const t = Math.min(1, Math.max(0, (score - band.min) / (band.max - band.min)));
  return mix(band.from, band.to, t);
}

/**
 * Zemin üstünde okunaklı puan yazısı: açık görünümde koyulaştırılır (sarı tonlar daha çok),
 * koyu görünümde biraz açılır.
 */
export function scoreInk(score: number): ColorValue {
  return dynamicColor(
    mix(scoreColor(score), '#000000', score >= 3.4 && score < 6.7 ? 0.38 : 0.2),
    mix(scoreColor(score), '#FFFFFF', 0.12),
  );
}

/** Puan rengiyle dolu yüzeyin (pin) üstündeki yazı rengi: açık tonlarda koyu, diğerlerinde beyaz */
export function onScoreColor(score: number): string {
  const [r, g, b] = hexToRgb(scoreColor(score)).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return luminance > 0.3 ? fixed.ink : fixed.white;
}
