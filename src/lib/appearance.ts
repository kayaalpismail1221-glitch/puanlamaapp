import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { Appearance } from 'react-native';

import { darkModeSupported } from '@/constants/theme';

/**
 * Görünüm tercihi (Ayarlar → Görünüm): açık ya da koyu. Varsayılan açık (kullanıcı kararı, 2026-09-29): telefon koyu
 * olsa da uygulama beyaz açılır. "Cihazla aynı" seçeneği kaldırıldı (kullanıcı kararı, 2026-09-30); eskiden seçenler
 * açık görünüme döner. Pencerenin görünümü değişir; `colors` (DynamicColorIOS) ve `useColorScheme` buna uyar.
 */

export type AppearancePreference = 'light' | 'dark';
export const APPEARANCES: readonly AppearancePreference[] = ['light', 'dark'];

const STORAGE_KEY = 'puanla:appearance';

const DEFAULT: AppearancePreference = 'light';

let preference: AppearancePreference = DEFAULT;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Koyu görünüm iOS'ta ve Android'de kendi derlememizde (`constants/theme` → `darkModeSupported`); web açık */
export const appearanceSupported = darkModeSupported;

const apply = (next: AppearancePreference) =>
  Appearance.setColorScheme(appearanceSupported ? next : 'light');

// İlk karede varsayılan; kayıtlı tercih okunana kadar açılış ekranı bekler (bkz. RootNavigator)
apply(DEFAULT);
AsyncStorage.getItem(STORAGE_KEY)
  .then((saved) => {
    if (saved === 'light' || saved === 'dark') {
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
