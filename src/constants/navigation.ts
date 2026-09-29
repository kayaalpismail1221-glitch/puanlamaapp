import type { NativeStackNavigationOptions } from 'expo-router';
import { useMemo } from 'react';
import { Platform } from 'react-native';

import type { Palette } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';

const android = Platform.OS === 'android';

/**
 * Platforma göre stack başlığı ve geçişleri. iOS sistemin varsayılanlarında kalır. Android'de Material 3'ün
 * düz üst çubuğu: gölgesiz, zeminle aynı renk, başlık solda ve kalın; geçişler Android'in kendi hareketleri.
 */
export function platformStackOptions(palette: Palette): NativeStackNavigationOptions {
  if (!android) return {};
  return {
    headerShadowVisible: false,
    headerStyle: { backgroundColor: palette.background },
    headerTitleAlign: 'left',
    headerTitleStyle: { color: palette.primary, fontSize: 20, fontWeight: '600' },
    animation: 'default',
  };
}

/**
 * Modal ekran: iOS'ta sayfa (sheet); Android'de alttan kayarak gelen tam ekran (Android'de sayfa sunumu yok).
 * `Stack.Screen options={{ ...modal, title }}`
 */
export const modal: NativeStackNavigationOptions = android
  ? { presentation: 'modal', animation: 'slide_from_bottom' }
  : { presentation: 'modal' };

/** Sekmelerin içindeki büyük başlıklı iOS stack başlığı (renkler o anki görünümden); Android'de düz üst çubuk */
export function useLargeTitleStackOptions(): NativeStackNavigationOptions {
  const palette = usePalette();
  return useMemo(
    () => ({
      ...platformStackOptions(palette),
      headerLargeTitleEnabled: true,
      headerLargeTitleShadowVisible: false,
      headerShadowVisible: false,
      headerTintColor: palette.primary,
      headerLargeTitleStyle: { color: palette.primary },
      headerTitleStyle: android
        ? { color: palette.primary, fontSize: 24, fontWeight: '700' }
        : { color: palette.primary },
      headerBackButtonDisplayMode: 'minimal',
      contentStyle: { backgroundColor: palette.background },
    }),
    [palette],
  );
}
