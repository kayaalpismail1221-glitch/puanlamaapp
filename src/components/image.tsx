import { Image as ExpoImage, type ImageProps } from 'expo-image';
import { Platform, StyleSheet, type ImageStyle } from 'react-native';

import { plainColor } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';

const COLOR_KEYS = ['backgroundColor', 'borderColor', 'tintColor'] as const;

/**
 * expo-image. Android'de görünümü yerel stil olarak gittiği için tema renklerini (`PlatformColor`) kabul etmez
 * ("Cannot set prop 'backgroundColor'"); stildeki tema renkleri o anki paletin düz değerine çevrilir.
 * Uygulamada görseller buradan kullanılır.
 */
export function Image({ style, ...props }: ImageProps) {
  const palette = usePalette();
  if (Platform.OS !== 'android' || !style) return <ExpoImage style={style} {...props} />;
  const flat = { ...(StyleSheet.flatten(style) as ImageStyle) };
  for (const key of COLOR_KEYS) {
    if (flat[key] !== undefined) (flat as Record<string, unknown>)[key] = plainColor(flat[key], palette);
  }
  return <ExpoImage style={flat} {...props} />;
}

export type { ImageProps };
