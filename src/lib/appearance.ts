import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { Appearance, Platform } from 'react-native';

/**
 * Görünüm tercihi (Ayarlar → Görünüm): açık, koyu ya da cihazı izle.
 * Varsayılan açık (kullanıcı kararı, 2026-09-29): telefon koyu olsa da uygulama beyaz açılır.
 * Pencerenin görünümü değişir; `colors` (DynamicColorIOS) ve `useColorScheme` buna uyar.
 */

export type AppearancePreference = 'system' | 'light' | 'dark';
export const APPEARANCES: readonly AppearancePreference[] = ['light', 'dark', 'system'];

const STORAGE_KEY = 'puanla:appearance';

const DEFAULT: AppearancePreference = 'light';

let preference: AppearancePreference = DEFAULT;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Koyu görünüm yalnızca iOS'ta (`colors` DynamicColorIOS); Android ve web her zaman açık */
export const appearanceSupported = Platform.OS === 'ios';

const apply = (next: AppearancePreference) =>
  Appearance.setColorScheme(!appearanceSupported ? 'light' : next === 'system' ? 'unspecified' : next);

// İlk karede varsayılan; kayıtlı tercih okunana kadar açılış ekranı bekler (bkz. RootNavigator)
apply(DEFAULT);
AsyncStorage.getItem(STORAGE_KEY)
  .then((saved) => {
    if (saved === 'system' || saved === 'light' || saved === 'dark') {
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
