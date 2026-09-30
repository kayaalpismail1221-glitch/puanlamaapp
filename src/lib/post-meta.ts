
import type { AppSymbol } from '@/constants/icons';
import i18n from '@/i18n';
import type { Meal } from '@/types';

/**
 * Gönderilerdeki yapılandırılmış bilgiler. Serbest metin yerine seçenekli olması,
 * mekân sayfasında öne çıkan özellikleri hesaplamayı mümkün kılar.
 */

export const MEALS: { key: Meal; icon: AppSymbol }[] = [
  { key: 'kahvalti', icon: 'sunrise' },
  { key: 'ogle', icon: 'sun.max' },
  { key: 'aksam', icon: 'sunset' },
  { key: 'gece', icon: 'moon.stars' },
];

/** Veritabanında Türkçe saklanır; ekranda `highlightLabel` ile etkin dile çevrilir */
export const HIGHLIGHTS = [
  'Fiyat/performans',
  'Öğrenci dostu',
  'Manzaralı',
  'Sessiz, sohbetlik',
  'Hızlı servis',
  'Kalabalık gruba uygun',
  'Rezervasyon şart',
  'Vejetaryen seçenek',
  'Porsiyon büyük',
  'Tatlısı iyi',
] as const;

export type Highlight = (typeof HIGHLIGHTS)[number];

export const mealLabel = (key?: Meal) => (key ? i18n.t(`meals.${key}`) : undefined);

/** Bilinmeyen (eski) etiketler olduğu gibi gösterilir */
export const highlightLabel = (value: string) =>
  (HIGHLIGHTS as readonly string[]).includes(value) ? i18n.t(`highlights.${value as Highlight}`) : value;
