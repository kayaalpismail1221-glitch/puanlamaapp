import type tr from './locales/tr';

/** Türkçe metinler kaynak; diğer diller aynı anahtar ağacını birebir karşılamak zorunda */
type DeepStrings<T> = { [K in keyof T]: T[K] extends string ? string : DeepStrings<T[K]> };
export type Translation = DeepStrings<typeof tr>;

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof tr };
  }
}
