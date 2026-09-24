import type { RankedEntry, Rankings, Sentiment } from '@/types';

/**
 * Beli tarzı sıralama.
 * Her ilk izlenim grubunun kendi puan aralığı vardır. Grup içindeki sıra ikili
 * karşılaştırmayla (ikili arama) bulunur ve puan 0–10 arasında sıradan hesaplanır.
 */

export const SENTIMENT_RANGES: Record<Sentiment, { min: number; max: number }> = {
  liked: { min: 6.7, max: 10 },
  fine: { min: 3.4, max: 6.6 },
  disliked: { min: 0, max: 3.3 },
};

export const SENTIMENT_ORDER: Sentiment[] = ['liked', 'fine', 'disliked'];


export const emptyRankings = (): Rankings => ({ liked: [], fine: [], disliked: [] });

/**
 * Grup içinde `index` sırasındaki (0 = en iyi) mekânın puanı.
 * Sunucudaki `sentiment_score` ile birebir aynı sonucu vermesi için onda birler cinsinden tam sayılarla hesaplanır.
 */
export function scoreAt(sentiment: Sentiment, index: number, count: number): number {
  const { min, max } = SENTIMENT_RANGES[sentiment];
  if (count <= 1) return max;
  // En iyi `max`, en kötü `min` alır; aradakiler eşit aralıklı dağılır.
  const hi = Math.round(max * 10);
  const lo = Math.round(min * 10);
  return Math.round(hi - ((hi - lo) * index) / (count - 1)) / 10;
}

export type ScoredEntry = RankedEntry & { sentiment: Sentiment; score: number; rank: number };

/** Tüm grupları puanlarıyla birlikte tek, sıralı listeye çevirir */
export function flattenRankings(rankings: Rankings): ScoredEntry[] {
  const result: ScoredEntry[] = [];
  for (const sentiment of SENTIMENT_ORDER) {
    const list = rankings[sentiment];
    list.forEach((entry, i) => {
      result.push({ ...entry, sentiment, score: scoreAt(sentiment, i, list.length), rank: 0 });
    });
  }
  return result.map((e, i) => ({ ...e, rank: i + 1 }));
}

export function removeFromRankings(rankings: Rankings, placeId: string): Rankings {
  return {
    liked: rankings.liked.filter((e) => e.placeId !== placeId),
    fine: rankings.fine.filter((e) => e.placeId !== placeId),
    disliked: rankings.disliked.filter((e) => e.placeId !== placeId),
  };
}

/** İkili arama durumu: yeni mekân [low, high) aralığında bir yere girecek */
export type Comparison = { low: number; high: number };

export const startComparison = (count: number): Comparison => ({ low: 0, high: count });

export const isComparisonDone = (c: Comparison) => c.low >= c.high;

/** Şu an karşılaştırılacak mevcut mekânın indeksi */
export const comparisonPivot = (c: Comparison) => Math.floor((c.low + c.high) / 2);

/** Kullanıcının cevabına göre aralığı daraltır */
export function answerComparison(c: Comparison, newIsBetter: boolean): Comparison {
  const pivot = comparisonPivot(c);
  return newIsBetter ? { low: c.low, high: pivot } : { low: pivot + 1, high: c.high };
}

/** "Emin değilim": mevcut mekânın hemen altına yerleştirir */
export const skipComparison = (c: Comparison): Comparison => {
  const at = comparisonPivot(c) + 1;
  return { low: at, high: at };
};

/** Karşılaştırmalar kabaca kaç soru sürer (ilerleme göstergesi için) */
export const expectedSteps = (count: number) => (count === 0 ? 0 : Math.ceil(Math.log2(count + 1)));

export function insertEntry(
  rankings: Rankings,
  sentiment: Sentiment,
  index: number,
  entry: RankedEntry,
): Rankings {
  const next = removeFromRankings(rankings, entry.placeId);
  const list = [...next[sentiment]];
  list.splice(Math.min(index, list.length), 0, entry);
  return { ...next, [sentiment]: list };
}
