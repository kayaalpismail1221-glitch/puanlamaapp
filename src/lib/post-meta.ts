import type { SFSymbol } from '@/components/symbol';

import i18n from '@/i18n';
import type { Meal, Segment } from '@/types';

/**
 * Gönderilerdeki yapılandırılmış bilgiler. Serbest metin yerine seçenekli olması,
 * mekân sayfasında öne çıkan özellikleri hesaplamayı mümkün kılar.
 */

/** Eski gönderilerde öğün var; yeni gönderide sorulmuyor (açıklamaya yazılır), yalnızca gösterilir */
export const MEALS: { key: Meal; icon: SFSymbol }[] = [
  { key: 'kahvalti', icon: 'sunrise' },
  { key: 'ogle', icon: 'sun.max' },
  { key: 'aksam', icon: 'sunset' },
  { key: 'gece', icon: 'moon.stars' },
];

/**
 * Öne çıkanlar, gruplu ve mekânın türüne göre. Seçim, restoran yorumlarında en sık konuşulan başlıklara dayanır
 * (akademik yorum analizleri ve Google Haritalar'ın yer özellikleri: yemek, hizmet, ortam, fiyat/değer, konum ve
 * olanaklar; somut olarak porsiyon, tazelik, personelin güler yüzü, hız, temizlik, manzara/açık alan, gürültü,
 * grup/aile/özel gün uygunluğu, rezervasyon ve sıra, diyet seçenekleri). Genel lezzet puanla zaten söylendiği
 * için etiketler puanın söylemediğini anlatır. Fiyat seviyesi yok (ürün kararı); fiyat/performans var.
 *
 * `value` veritabanında Türkçe saklanır ve değişmez (mekân özeti bunları sayar); ekranda `highlightLabel` ile
 * etkin dile çevrilir (ör. saklanan "Porsiyon büyük" → "Porsiyon doyurucu").
 */
export type HighlightGroup = 'food' | 'service' | 'vibe' | 'occasion' | 'know';

export const HIGHLIGHT_GROUPS: HighlightGroup[] = ['food', 'service', 'vibe', 'occasion', 'know'];

export const HIGHLIGHTS = [
  { value: 'Fiyat/performans', group: 'food' },
  { value: 'Porsiyon büyük', group: 'food' },
  { value: 'Malzeme taze', group: 'food' },
  { value: 'Ev yemeği tadında', group: 'food', segments: ['restaurant', 'street', 'bakery'] },
  { value: 'Kahvaltısı dopdolu', group: 'food', segments: ['breakfast'] },
  { value: 'Kahvesi iyi', group: 'food', segments: ['cafe', 'breakfast', 'dessert', 'bakery'] },
  { value: 'Tatlısı iyi', group: 'food', segments: ['restaurant', 'kebab', 'cafe', 'dessert'] },
  { value: 'Mezeleri iyi', group: 'food', segments: ['nightlife', 'restaurant', 'kebab'] },
  { value: 'Kokteylleri iyi', group: 'food', segments: ['nightlife'] },
  { value: 'Güler yüzlü servis', group: 'service' },
  { value: 'Hızlı servis', group: 'service' },
  { value: 'Tertemiz', group: 'service' },
  { value: 'Manzaralı', group: 'vibe' },
  { value: 'Bahçe / açık alan', group: 'vibe' },
  { value: 'Sessiz, sohbetlik', group: 'vibe' },
  { value: 'Canlı ortam', group: 'vibe' },
  { value: 'Canlı müzik', group: 'vibe', segments: ['nightlife', 'cafe'] },
  { value: 'Özel gün / romantik', group: 'occasion', segments: ['restaurant', 'nightlife', 'cafe', 'dessert'] },
  { value: 'Kalabalık gruba uygun', group: 'occasion' },
  {
    value: 'Çocuklu aileye uygun',
    group: 'occasion',
    segments: ['restaurant', 'kebab', 'fastfood', 'breakfast', 'bakery', 'cafe', 'dessert'],
  },
  { value: 'Öğrenci dostu', group: 'occasion' },
  { value: 'Laptopla çalışılır', group: 'occasion', segments: ['cafe'] },
  { value: 'Rezervasyon şart', group: 'know' },
  { value: 'Sıra bekleniyor', group: 'know' },
  {
    value: 'Gece geç saate kadar açık',
    group: 'know',
    segments: ['street', 'fastfood', 'kebab', 'nightlife', 'restaurant', 'cafe', 'dessert'],
  },
  { value: 'Vejetaryen seçenek', group: 'know' },
] as const satisfies readonly { value: string; group: HighlightGroup; segments?: readonly Segment[] }[];

export type Highlight = (typeof HIGHLIGHTS)[number]['value'];

const VALUES = new Set<string>(HIGHLIGHTS.map((h) => h.value));

/** Mekânın türüne uyan öne çıkanlar, gruplarına göre (tür bilinmiyorsa hepsi) */
export function highlightsFor(segment?: Segment) {
  return HIGHLIGHT_GROUPS.map((group) => ({
    group,
    values: HIGHLIGHTS.filter(
      (h) => h.group === group && (!segment || !('segments' in h) || (h.segments as readonly Segment[]).includes(segment)),
    ).map((h) => h.value as Highlight),
  })).filter((g) => g.values.length > 0);
}

export const mealLabel = (key?: Meal) => (key ? i18n.t(`meals.${key}`) : undefined);

/** Bilinmeyen (eski) etiketler olduğu gibi gösterilir */
export const highlightLabel = (value: string) =>
  VALUES.has(value) ? i18n.t(`highlights.${value as Highlight}`) : value;
