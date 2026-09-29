import type { RankedEntry, Rankings, Segment, Sentiment } from '@/types';

/**
 * Beli tarzı sıralama, segment bazında.
 * Her ilk izlenim grubunun kendi puan aralığı vardır. Yeni mekân yalnızca aynı segmentteki (bkz.
 * constants/segments) aynı gruptaki mekânlarla ikili karşılaştırılır (ikili arama); "İkisi aynı" denirse
 * karşılaştırılan mekânla aynı seviyeye (eşit puan) konur. Puan o listedeki seviyeden hesaplanır.
 */

export const SENTIMENT_RANGES: Record<Sentiment, { min: number; max: number }> = {
  liked: { min: 6.7, max: 10 },
  fine: { min: 3.4, max: 6.6 },
  disliked: { min: 0, max: 3.3 },
};

export const SENTIMENT_ORDER: Sentiment[] = ['liked', 'fine', 'disliked'];

/**
 * Liste bu kadar seviyeye ulaşınca en alttaki grubun alt sınırına iner. Grubun en iyisi her zaman üst
 * sınırda (segmentteki favorin 10,0); daha kısa listelerde alt sınıra inilmez.
 */
export const FULL_SPREAD_AT = 5;

export const emptyRankings = (): Rankings => ({ liked: [], fine: [], disliked: [] });

/**
 * Listede `tier`. seviyedeki (0 = en iyi) mekânın puanı, `tiers` farklı seviye varken.
 * En iyisi grubun üst sınırında; iniş, sıradaki yerin (tier / max(tiers − 1, 4)) karesiyle orantılı:
 * listenin üstü yüksek kalır, düşüş sona doğru hızlanır. Çok mekân puanlayan kişinin sevdiği yerler de
 * yüksek görünür; alt sınır gerçekten "en az beğendiğim" demektir.
 * Beğendim, 5 seviye: 10,0 · 9,8 · 9,2 · 8,1 · 6,7 — 30 seviyede ilk 20 mekân 8,4'ün üstünde.
 * Sunucudaki `sentiment_score` ile birebir aynı sonucu vermesi için onda birler cinsinden, yalnızca
 * tam sayılarla hesaplanır; yarım değerler yukarı yuvarlanır.
 */
export function scoreAt(sentiment: Sentiment, tier: number, tiers: number): number {
  const hi = Math.round(SENTIMENT_RANGES[sentiment].max * 10);
  const lo = Math.round(SENTIMENT_RANGES[sentiment].min * 10);
  const gap = Math.max(tiers - 1, FULL_SPREAD_AT - 1);
  const t = Math.min(Math.max(tier, 0), Math.max(tiers - 1, 0));
  // İniş = round((hi − lo) × t² / gap²)
  const drop = Math.floor((2 * (hi - lo) * t * t + gap * gap) / (2 * gap * gap));
  return (hi - drop) / 10;
}

/** Bir grubun yalnızca verilen segmentteki kayıtları (sırası korunur) */
export const segmentEntries = (list: RankedEntry[], segment: Segment, exceptPlaceId?: string) =>
  list.filter((e) => e.segment === segment && e.placeId !== exceptPlaceId);

/**
 * Listedeki her kaydın seviyesi: ilk kayıt 0, "öncekiyle aynı" (`tied`) olan öncekinin seviyesinde,
 * diğerleri bir alt seviyede. Sunucudaki `recompute_group_scores` ile aynı kural.
 */
function tiersOf(list: RankedEntry[]) {
  const tiers: number[] = [];
  list.forEach((e, i) => tiers.push(i === 0 ? 0 : tiers[i - 1]! + (e.tied ? 0 : 1)));
  return { tiers, count: list.length ? tiers.at(-1)! + 1 : 0 };
}

export type ScoredEntry = RankedEntry & { sentiment: Sentiment; score: number; rank: number };

/** Bir gruptaki her kaydın puanı: segment içindeki seviyesi ve segmentin o gruptaki seviye sayısından */
function scoreGroup(sentiment: Sentiment, list: RankedEntry[]) {
  const bySegment = new Map<Segment, RankedEntry[]>();
  for (const e of list) bySegment.set(e.segment, [...(bySegment.get(e.segment) ?? []), e]);
  const scores = new Map<string, number>();
  for (const entries of bySegment.values()) {
    const { tiers, count } = tiersOf(entries);
    entries.forEach((e, i) => scores.set(e.placeId, scoreAt(sentiment, tiers[i]!, count)));
  }
  return list.map((entry) => ({ entry, score: scores.get(entry.placeId)! }));
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
    const entry = rankings[sentiment].find((e) => e.placeId === placeId);
    if (!entry) continue;
    const peers = segmentEntries(rankings[sentiment], entry.segment);
    const { tiers, count } = tiersOf(peers);
    return scoreAt(sentiment, tiers[peers.indexOf(entry)]!, count);
  }
  return undefined;
}

/**
 * Mekânın kendi segmentindeki yeri, tüm izlenimler birlikte: "Kahvaltıda 12 mekân arasında 2."
 * Sıra yarışma usulü (eşit puanlılar aynı sırada: 1, 2, 2, 4).
 */
export function segmentStanding(
  rankings: Rankings,
  placeId: string,
): { segment: Segment; rank: number; total: number } | undefined {
  const all = flattenRankings(rankings);
  const me = all.find((e) => e.placeId === placeId);
  if (!me) return undefined;
  const peers = all.filter((e) => e.segment === me.segment);
  return {
    segment: me.segment,
    rank: 1 + peers.filter((e) => e.score > me.score).length,
    total: peers.length,
  };
}

export function removeFromRankings(rankings: Rankings, placeId: string): Rankings {
  return {
    liked: rankings.liked.filter((e) => e.placeId !== placeId),
    fine: rankings.fine.filter((e) => e.placeId !== placeId),
    disliked: rankings.disliked.filter((e) => e.placeId !== placeId),
  };
}

/** İkili arama durumu: yeni mekân [low, high) aralığında bir yere girecek */
export type Comparison = { low: number; high: number; tied?: boolean };

export const startComparison = (count: number): Comparison => ({ low: 0, high: count });

export const isComparisonDone = (c: Comparison) => c.low >= c.high;

/** Şu an karşılaştırılacak mevcut mekânın indeksi */
export const comparisonPivot = (c: Comparison) => Math.floor((c.low + c.high) / 2);

/** Kullanıcının cevabına göre aralığı daraltır */
export function answerComparison(c: Comparison, newIsBetter: boolean): Comparison {
  const pivot = comparisonPivot(c);
  return newIsBetter ? { low: c.low, high: pivot } : { low: pivot + 1, high: c.high };
}

/**
 * "İkisi aynı" (ya da karar verilemedi): yeni mekân karşılaştırılanın hemen altına, onunla aynı seviyeye
 * (eşit puan). Eski "Emin değilim" hep bir alta koyup puanı düşürüyordu; eşitlik yönsüz.
 */
export const tieComparison = (c: Comparison): Comparison => {
  const at = comparisonPivot(c) + 1;
  return { low: at, high: at, tied: true };
};

/** Karşılaştırmalar kabaca kaç soru sürer (ilerleme göstergesi için) */
export const expectedSteps = (count: number) => (count === 0 ? 0 : Math.ceil(Math.log2(count + 1)));

/**
 * Puanlamanın sonucu: izlenim grubu, o gruptaki segment listesinde sıra (0 = en iyi) ve bir üstteki
 * mekânla aynı seviyede mi.
 */
export type Placement = { sentiment: Sentiment; index: number; tied?: boolean };

/**
 * Mekânı grubuna, kendi segmentinin `index`. sırasına yerleştirir (varsa eski yerinden çıkarır).
 * Sunucudaki `rank_place` ile aynı davranır: listenin başına eşitlik konmaz; kayan kayıtlar bayraklarını korur.
 */
export function insertEntry(rankings: Rankings, { sentiment, index, tied }: Placement, entry: RankedEntry): Rankings {
  const next = removeFromRankings(rankings, entry.placeId);
  const list = [...next[sentiment]];
  const peers = list.flatMap((e, i) => (e.segment === entry.segment ? [i] : []));
  const at = index < peers.length ? peers[Math.max(index, 0)]! : peers.length ? peers.at(-1)! + 1 : list.length;
  list.splice(at, 0, { ...entry, tied: !!tied && index > 0 && peers.length > 0 });
  return { ...next, [sentiment]: list };
}
