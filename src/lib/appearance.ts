import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import { useSyncExternalStore } from 'react';
import { Appearance, Platform } from 'react-native';

import { darkModeSupported } from '@/constants/theme';

/**
 * Görünüm tercihi (Ayarlar → Görünüm): cihazla aynı, açık ya da koyu. Varsayılan "Cihazla aynı" (kullanıcı kararı
 * 2026-10-03: "uygulamanın rengi telefonun varsayılanından çeksin"; 2026-09-29/30'daki "hep açık başlar" kararının
 * yerine). Elle açık/koyu seçen kullanıcının seçimi korunur. Pencerenin görünümü değişir; `colors` (DynamicColorIOS)
 * ve `useColorScheme` buna uyar.
 */

export type AppearancePreference = 'system' | 'light' | 'dark';

/**
 * iOS 1.0.0/1.0.1 ikilisinde Info.plist görünümü "Light"a sabit (`userInterfaceStyle` sonradan "automatic" oldu):
 * pencere geçersiz kılması kalkınca da açık kalır, "Cihazla aynı" çalışmaz. 1.0.2 build'inden itibaren açılır;
 * o zamana dek seçenek gizli, varsayılan açık. Expo Go ve geliştirme sürümünde `runtimeVersion` yok → açık.
 */
const IOS_LIGHT_ONLY_RUNTIMES = ['1.0.0', '1.0.1'];
export const systemAppearanceAvailable =
  Platform.OS !== 'ios' || !IOS_LIGHT_ONLY_RUNTIMES.includes(Updates.runtimeVersion ?? '');

export const APPEARANCES: readonly AppearancePreference[] = systemAppearanceAvailable
  ? ['system', 'light', 'dark']
  : ['light', 'dark'];

const STORAGE_KEY = 'puanla:appearance';

const DEFAULT: AppearancePreference = systemAppearanceAvailable ? 'system' : 'light';

let preference: AppearancePreference = DEFAULT;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Koyu görünüm iOS'ta ve Android'de kendi derlememizde (`constants/theme` → `darkModeSupported`); web açık */
export const appearanceSupported = darkModeSupported;

// Web'de (react-native-web) `setColorScheme` yok; orası hep açık
const apply = (next: AppearancePreference) =>
  Appearance.setColorScheme?.(!appearanceSupported ? 'light' : next === 'system' ? 'unspecified' : next);

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
