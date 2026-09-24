import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { useSyncExternalStore } from 'react';
import { initReactI18next } from 'react-i18next';

import en from './locales/en';
import tr from './locales/tr';

/**
 * Uygulama dili. Varsayılan: cihaz dili Türkçe ise Türkçe, değilse İngilizce.
 * Kullanıcı Ayarlar > Dil'den seçerse tercih cihazda saklanır ("system" = cihazı izle).
 */

export const LANGUAGES = ['tr', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];
export type LanguagePreference = Language | 'system';

const STORAGE_KEY = 'puanla:language';

export function systemLanguage(): Language {
  return getLocales()[0]?.languageCode === 'tr' ? 'tr' : 'en';
}

/** Uygulamaya özel i18next örneği (react-i18next'e `use` ile bağlanır) */
const i18n = createInstance();

let preference: LanguagePreference = 'system';
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

i18n.use(initReactI18next).init({
  resources: { tr: { translation: tr }, en: { translation: en } },
  lng: systemLanguage(),
  fallbackLng: 'tr',
  initAsync: false, // kaynaklar pakette: ilk karede çeviriler hazır olsun
  interpolation: { escapeValue: false }, // React zaten kaçışlıyor
  returnNull: false,
});

// Kayıtlı tercih okunana kadar açılış ekranı bekler (bkz. RootNavigator)
AsyncStorage.getItem(STORAGE_KEY)
  .then((saved) => {
    if (saved === 'tr' || saved === 'en') {
      preference = saved;
      return i18n.changeLanguage(saved);
    }
  })
  .catch(() => {})
  .finally(() => {
    loaded = true;
    emit();
  });

export async function setLanguagePreference(next: LanguagePreference) {
  preference = next;
  await i18n.changeLanguage(next === 'system' ? systemLanguage() : next);
  emit();
  if (next === 'system') await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  else await AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useLanguagePreference = () => useSyncExternalStore(subscribe, () => preference);
export const useLanguageLoaded = () => useSyncExternalStore(subscribe, () => loaded);

/** Etkin dil (render dışında: biçimlendirme yardımcıları için) */
export const currentLanguage = (): Language => (i18n.language === 'en' ? 'en' : 'tr');

/** Tarih/sayı biçimlendirme için BCP 47 etiketi */
export const currentLocale = () => (currentLanguage() === 'en' ? 'en-US' : 'tr-TR');

export default i18n;
