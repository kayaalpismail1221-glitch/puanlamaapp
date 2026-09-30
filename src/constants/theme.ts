import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Appearance, DynamicColorIOS, Platform, PlatformColor, type ColorValue } from 'react-native';

import { androidColorName, dark, light, palettes, type Palette } from '@/constants/palettes';

/**
 * Tasarım token'ları. Bileşenlerde sabit renk/ölçü yazma; hepsini buradan al.
 *
 * Açık ve koyu görünüm: `colors` iOS'ta `DynamicColorIOS` değerleridir; sistem (ya da Ayarlar → Görünüm)
 * değişince her ekran yeniden çizilmeden anında uyum sağlar. Android'de `PlatformColor`: palet uygulamaya renk
 * kaynağı olarak gömülü (`values` / `values-night`, `plugins/with-android-theme.js`); görünüm değişince gezinme
 * ağacı yeniden kurulur ve renkler yeni görünümden okunur (bkz. `lib/appearance`). Renk metni gereken yerlerde
 * (SVG, gezinme teması, degrade) `usePalette()` ile o anki paletin düz değerleri alınır. Görünümden bağımsız
 * kalması gerekenler (fotoğraf üstü yazı, paylaşım kartları) `fixed` kullanır.
 */

export { palettes, type Palette };

export type Scheme = keyof typeof palettes;

/**
 * Koyu görünüm desteği: iOS'ta her zaman; Android'de renk kaynakları gömülü olan kendi derlememizde
 * (Expo Go'da kaynak yok, orada açık kalır); web açık.
 */
export const darkModeSupported =
  Platform.OS === 'ios' ||
  (Platform.OS === 'android' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient);

const androidColors = Platform.OS === 'android' && darkModeSupported;

/**
 * Görünüme göre değişen renk. iOS'ta sistem çözer; Android'de çağrıldığı anki görünümden seçilir (görünüm
 * değişince ağaç yeniden kurulduğu için çizim sırasında çağrılan değerler güncel kalır); web açık.
 */
export function dynamicColor(lightValue: string, darkValue: string): ColorValue {
  if (Platform.OS === 'ios') return DynamicColorIOS({ light: lightValue, dark: darkValue });
  return androidColors && Appearance.getColorScheme() === 'dark' ? darkValue : lightValue;
}

export const colors = Object.fromEntries(
  (Object.keys(light) as (keyof Palette)[]).map((key) => [
    key,
    androidColors ? PlatformColor(`@color/${androidColorName(key)}`) : dynamicColor(light[key], dark[key]),
  ]),
) as Record<keyof Palette, ColorValue>;

const androidKeyByName = new Map((Object.keys(light) as (keyof Palette)[]).map((key) => [androidColorName(key), key]));

/**
 * `colors` değerini düz renge çevirir: `PlatformColor` kabul etmeyen yerel bileşenler için (Android'de expo-image).
 * Tema rengi değilse olduğu gibi döner.
 */
export function plainColor(value: ColorValue | undefined, palette: Palette): ColorValue | undefined {
  if (value && typeof value === 'object' && 'resource_paths' in value) {
    const path = (value as { resource_paths: string[] }).resource_paths[0] ?? '';
    const key = androidKeyByName.get(path.replace('@color/', ''));
    return key ? palette[key] : value;
  }
  return value;
}

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

const android = Platform.OS === 'android';

/**
 * Sistem fontu (iOS'ta SF Pro, Android'de Roboto); fontFamily belirtmiyoruz. iOS ölçeği Apple'ın metin stilleri.
 * Android'de Material 3 ölçeğine yakın: Roboto aynı puntoda SF'ten geniş, gövde metni 16 (bodyLarge), başlıklar
 * bir kademe sıkı; büyük başlıklarda iOS'a özgü harf aralığı yok.
 */
export const typography = {
  largeTitle: { fontSize: android ? 32 : 34, fontWeight: '700', letterSpacing: android ? 0 : 0.4 },
  title: { fontSize: 28, fontWeight: '700', letterSpacing: android ? 0 : 0.3 },
  title2: { fontSize: 22, fontWeight: '700' },
  title3: { fontSize: 20, fontWeight: '600' },
  headline: { fontSize: android ? 16 : 17, fontWeight: '600' },
  body: { fontSize: android ? 16 : 17, fontWeight: '400' },
  callout: { fontSize: android ? 15 : 16, fontWeight: '400' },
  subhead: { fontSize: android ? 14 : 15, fontWeight: '400' },
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
