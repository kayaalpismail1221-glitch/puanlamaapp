import type { SFSymbol } from 'expo-symbols';

import type { Meal, PriceBucket } from '@/types';

/**
 * Gönderilerdeki yapılandırılmış bilgiler. Serbest metin yerine seçenekli olması,
 * mekân sayfasında ortalama fiyat ve öne çıkan özellikleri hesaplamayı mümkün kılar.
 */

export const PRICE_BUCKETS: { key: PriceBucket; label: string; short: string }[] = [
  { key: 'u250', label: '₺250 altı', short: '₺250-' },
  { key: '250-500', label: '₺250–500', short: '₺250–500' },
  { key: '500-1000', label: '₺500–1.000', short: '₺500–1K' },
  { key: '1000-2000', label: '₺1.000–2.000', short: '₺1K–2K' },
  { key: 'o2000', label: '₺2.000+', short: '₺2K+' },
];

export const MEALS: { key: Meal; label: string; icon: SFSymbol }[] = [
  { key: 'kahvalti', label: 'Kahvaltı', icon: 'sunrise' },
  { key: 'ogle', label: 'Öğle', icon: 'sun.max' },
  { key: 'aksam', label: 'Akşam', icon: 'sunset' },
  { key: 'gece', label: 'Gece', icon: 'moon.stars' },
];

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

export const priceBucketLabel = (key?: PriceBucket) => PRICE_BUCKETS.find((b) => b.key === key)?.label;
export const mealLabel = (key?: Meal) => MEALS.find((m) => m.key === key)?.label;
