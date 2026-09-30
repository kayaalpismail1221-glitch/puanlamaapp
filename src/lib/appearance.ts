import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import { useSyncExternalStore } from 'react';
import { Appearance, Platform } from 'react-native';

import { darkModeSupported } from '@/constants/theme';

/**
 * Görünüm tercihi (Ayarlar → Görünüm): açık, koyu ya da cihazı izle.
 * Varsayılan açık (kullanıcı kararı, 2026-09-29): telefon koyu olsa da uygulama beyaz açılır.
 * Pencerenin görünümü değişir; `colors` (DynamicColorIOS) ve `useColorScheme` buna uyar.
 */

export type AppearancePreference = 'system' | 'light' | 'dark';

/**
 * iOS 1.0.1 ikilisinde Info.plist görünümü "Light"a sabit (`userInterfaceStyle` sonradan "automatic" oldu):
 * pencere geçersiz kılması kalkınca da açık kalır, "Cihazla aynı" çalışmaz. 1.0.2 build'inden itibaren açılır.
 * Expo Go ve geliştirme sürümünde `runtimeVersion` yok → açık.
 */
const IOS_LIGHT_ONLY_RUNTIMES = ['1.0.0', '1.0.1'];
export const systemAppearanceAvailable =
  Platform.OS !== 'ios' || !IOS_LIGHT_ONLY_RUNTIMES.includes(Updates.runtimeVersion ?? '');

export const APPEARANCES: readonly AppearancePreference[] = systemAppearanceAvailable
  ? ['light', 'dark', 'system']
  : ['light', 'dark'];

const STORAGE_KEY = 'puanla:appearance';

const DEFAULT: AppearancePreference = 'light';

let preference: AppearancePreference = DEFAULT;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Koyu görünüm iOS'ta ve Android'de kendi derlememizde (`constants/theme` → `darkModeSupported`); web açık */
export const appearanceSupported = darkModeSupported;

const apply = (next: AppearancePreference) =>
  Appearance.setColorScheme(!appearanceSupported ? 'light' : next === 'system' ? 'unspecified' : next);

// İlk karede varsayılan; kayıtlı tercih okunana kadar açılış ekranı bekler (bkz. RootNavigator)
apply(DEFAULT);
AsyncStorage.getItem(STORAGE_KEY)
  .then((saved) => {
    if ((saved === 'system' && systemAppearanceAvailable) || saved === 'light' || saved === 'dark') {
      preference = saved;
      apply(saved);
    }
  })
  .catch(() => {})
  .finally(() => {
    loaded = true;
    emit();
  });

export async function setAppearancePreference(next: AppearancePreference) {
  preference = next;
  apply(next);
  emit();
  await AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useAppearancePreference = () => useSyncExternalStore(subscribe, () => preference);
export const useAppearanceLoaded = () => useSyncExternalStore(subscribe, () => loaded);
