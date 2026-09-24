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
  like: '#E11D48',
  overlay: 'rgba(15, 30, 61, 0.45)',

  // Puan renkleri (harita pinleri ve rozet vurguları)
  scoreHigh: '#0F1E3D',
  scoreMid: '#5B6B8C',
  scoreLow: '#A7B0C2',
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

/** Puana göre pin/rozet rengi */
export function scoreColor(score: number): string {
  if (score >= 6.7) return colors.scoreHigh;
  if (score >= 3.4) return colors.scoreMid;
  return colors.scoreLow;
}
