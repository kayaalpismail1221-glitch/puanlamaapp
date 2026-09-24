import type { SFSymbol } from 'expo-symbols';

import type { Meal, Post, PriceBucket } from '@/types';

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

/** Bir mekânın gönderilerinden özet: en sık fiyat aralığı ve öne çıkan özellikler */
export function placeSummary(posts: Post[]) {
  const priceCounts = new Map<PriceBucket, number>();
  const tagCounts = new Map<string, number>();
  const dishCounts = new Map<string, number>();
  for (const p of posts) {
    if (p.pricePerPerson) priceCounts.set(p.pricePerPerson, (priceCounts.get(p.pricePerPerson) ?? 0) + 1);
    for (const t of p.highlights ?? []) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    for (const d of p.dishes ?? []) {
      const key = d.trim().toLocaleLowerCase('tr');
      if (key) dishCounts.set(key, (dishCounts.get(key) ?? 0) + 1);
    }
  }
  const top = <K,>(m: Map<K, number>, n: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  const [price] = top(priceCounts, 1);
  return {
    price: price ? { key: price[0], count: price[1] } : undefined,
    priceVotes: [...priceCounts.values()].reduce((a, b) => a + b, 0),
    highlights: top(tagCounts, 4).map(([label, count]) => ({ label, count })),
    dishes: top(dishCounts, 5).map(([name, count]) => ({
      name: name.charAt(0).toLocaleUpperCase('tr') + name.slice(1),
      count,
    })),
  };
}
