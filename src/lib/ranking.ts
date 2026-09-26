import type { RankedEntry, Rankings, Segment, Sentiment } from '@/types';

/**
 * Beli tarzı sıralama, segment bazında.
 * Her ilk izlenim grubunun kendi puan aralığı vardır. Yeni mekân yalnızca aynı segmentteki (bkz.
 * constants/segments) aynı gruptaki mekânlarla ikili karşılaştırılır (ikili arama); puan o listedeki
 * sıradan hesaplanır.
 */

export const SENTIMENT_RANGES: Record<Sentiment, { min: number; max: number }> = {
  liked: { min: 6.7, max: 10 },
  fine: { min: 3.4, max: 6.6 },
  disliked: { min: 0, max: 3.3 },
};

export const SENTIMENT_ORDER: Sentiment[] = ['liked', 'fine', 'disliked'];

/**
 * Liste bu kadar mekâna ulaşınca puanlar grubun tüm aralığına yayılır. Daha kısa listelerde puanlar
 * aralığın ortasına yakın durur: tek bir "Beğendim" 10,0 değil 8,4 alır; iki mekândan ikincisi
 * 6,7'ye düşmez. Az veriyle uç puan verilmez, kıyaslandıkça puanlar netleşir.
 */
export const FULL_SPREAD_AT = 5;

export const emptyRankings = (): Rankings => ({ liked: [], fine: [], disliked: [] });

/**
 * Listede `index` sırasındaki (0 = en iyi) mekânın puanı: aralığın ortası + yayılma × sıradaki yer.
 * Yayılma liste uzadıkça 0'dan 1'e çıkar (bkz. FULL_SPREAD_AT).
 * Sunucudaki `sentiment_score` ile birebir aynı sonucu vermesi için onda birler cinsinden, yalnızca
 * tam sayılarla hesaplanır; yarım değerler yukarı yuvarlanır.
 */
export function scoreAt(sentiment: Sentiment, index: number, count: number): number {
  const hi = Math.round(SENTIMENT_RANGES[sentiment].max * 10);
  const lo = Math.round(SENTIMENT_RANGES[sentiment].min * 10);
  if (count <= 1) return Math.floor((hi + lo + 1) / 2) / 10;
  const d = count - 1;
  const steps = FULL_SPREAD_AT - 1;
  const spread = Math.min(d, steps);
  const pos = Math.min(Math.max(index, 0), d);
  // puan×10 = n / m  →  (hi+lo)/2 + (spread/steps) × (hi−lo) × (d − 2·pos) / (2d)
  const n = steps * d * (hi + lo) + spread * (hi - lo) * (d - 2 * pos);
  const m = 2 * steps * d;
  return Math.floor((2 * n + m) / (2 * m)) / 10;
}

/** Bir grubun yalnızca verilen segmentteki kayıtları (sırası korunur) */
export const segmentEntries = (list: RankedEntry[], segment: Segment, exceptPlaceId?: string) =>
  list.filter((e) => e.segment === segment && e.placeId !== exceptPlaceId);

export type ScoredEntry = RankedEntry & { sentiment: Sentiment; score: number; rank: number };

/** Bir gruptaki her kaydın puanı: segment içindeki sırası ve segmentin o gruptaki mekân sayısından */
function scoreGroup(sentiment: Sentiment, list: RankedEntry[]) {
  const counts = new Map<Segment, number>();
  for (const e of list) counts.set(e.segment, (counts.get(e.segment) ?? 0) + 1);
  const seen = new Map<Segment, number>();
  return list.map((entry) => {
    const index = seen.get(entry.segment) ?? 0;
    seen.set(entry.segment, index + 1);
    return { entry, score: scoreAt(sentiment, index, counts.get(entry.segment)!) };
  });
}

/**
 * Tüm grupları puanlarıyla tek listeye çevirir: önce izlenim grubu, grup içinde puan (segmentler
 * karışık; eşit puanda dizideki sıra korunur).
 */
export function flattenRankings(rankings: Rankings): ScoredEntry[] {
  const result: ScoredEntry[] = [];
  for (const sentiment of SENTIMENT_ORDER) {
    const scored = scoreGroup(sentiment, rankings[sentiment]).sort((a, b) => b.score - a.score);
    for (const { entry, score } of scored) result.push({ ...entry, sentiment, score, rank: 0 });
  }
  return result.map((e, i) => ({ ...e, rank: i + 1 }));
}

/** Mekânın sıralamadaki puanı (puanlanmamışsa undefined); tek kartın seçicisi için ucuz arama */
export function scoreInRankings(rankings: Rankings, placeId: string): number | undefined {
  for (const sentiment of SENTIMENT_ORDER) {
    const list = rankings[sentiment];
    const entry = list.find((e) => e.placeId === placeId);
    if (!entry) continue;
    const peers = segmentEntries(list, entry.segment);
    return scoreAt(sentiment, peers.indexOf(entry), peers.length);
  }
  return undefined;
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

/** Puanlamanın sonucu: izlenim grubu ve o gruptaki segment listesinde sıra (0 = en iyi) */
export type Placement = { sentiment: Sentiment; index: number };

/**
 * Mekânı grubuna, kendi segmentinin `index`. sırasına yerleştirir (varsa eski yerinden çıkarır).
 * Sunucudaki `rank_place` ile aynı davranır.
 */
export function insertEntry(rankings: Rankings, { sentiment, index }: Placement, entry: RankedEntry): Rankings {
  const next = removeFromRankings(rankings, entry.placeId);
  const list = [...next[sentiment]];
  const peers = list.flatMap((e, i) => (e.segment === entry.segment ? [i] : []));
  const at = index < peers.length ? peers[Math.max(index, 0)]! : peers.length ? peers.at(-1)! + 1 : list.length;
  list.splice(at, 0, entry);
  return { ...next, [sentiment]: list };
}
