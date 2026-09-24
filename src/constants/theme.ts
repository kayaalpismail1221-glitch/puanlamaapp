import { Platform } from 'react-native';

/**
 * Tasarım token'ları. Bileşenlerde sabit renk/ölçü yazma; hepsini buradan al.
 */

export const colors = {
  // Yüzeyler
  background: '#FFFFFF',
  surface: '#F5F6F8',
  border: '#E5E7EB',

  // Marka
  primary: '#0F1E3D',
  onPrimary: '#FFFFFF',

  // Metin
  text: '#111827',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',

  // Durumlar
  danger: '#DC2626',
  warning: '#D97706',
  like: '#E11D48',
  overlay: 'rgba(15, 30, 61, 0.45)',


  // Çizim tarzı dünya haritası (profildeki lezzet haritası)
  mapWater: '#EAF0F8',
  mapLand: '#D3D9E2',
  mapBorder: '#FFFFFF',
} as const;

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

/** Beyaz zemin üstünde okunaklı puan yazısı (sarı tonlar koyulaştırılır) */
export function scoreInk(score: number): string {
  return mix(scoreColor(score), '#000000', score >= 3.4 && score < 6.7 ? 0.38 : 0.2);
}

/** Puan rengiyle dolu yüzeyin (pin) üstündeki yazı rengi: açık tonlarda koyu, diğerlerinde beyaz */
export function onScoreColor(score: number): string {
  const [r, g, b] = hexToRgb(scoreColor(score)).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return luminance > 0.3 ? colors.text : colors.onPrimary;
}
