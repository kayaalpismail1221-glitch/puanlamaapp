import type { RankedEntry, Rankings, Segment, Sentiment } from '@/types';

/**
 * Beli tarzı sıralama, segment bazında.
 * Her ilk izlenim grubunun kendi puan aralığı vardır. Yeni mekân yalnızca aynı segmentteki (bkz.
 * constants/segments) aynı gruptaki mekânlarla ikili karşılaştırılır (ikili arama, eşitler tek mekân gibi);
 * "İkisi aynı" denirse karşılaştırılan mekânla aynı seviyeye (eşit puan) konur. Puan o listedeki seviyeden
 * hesaplanır. Sunucudaki `rank_place` / `detach_ranking` / `recompute_group_scores` ile aynı kurallar.
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

/**
 * Seviyenin topluluk puanına katkısı (yalnızca sunucuda toplanır; uygulamada test ve betikler için): bu seviyedeki
 * mekânın çok mekân puanlamış birinin listesinde alacağı beklenen puan. Tek mekânlık listenin favorisi 8,9, uzun
 * listenin favorisi 10,0 sayılır; bir listenin katkılarının ortalaması uzunluğundan bağımsızdır. Sunucudaki
 * `calibrated_score` ile birebir aynı: binde birler cinsinden tam sayılarla, yarım değerler yukarı.
 */
export function calibratedScoreAt(sentiment: Sentiment, tier: number, tiers: number): number {
  const hi = Math.round(SENTIMENT_RANGES[sentiment].max * 10);
  const lo = Math.round(SENTIMENT_RANGES[sentiment].min * 10);
  const n = Math.max(tiers, 1);
  const t = Math.min(Math.max(tier, 0), n - 1);
  // E[P²] = (t + 1)(t + 2) / ((n + 1)(n + 2)); puan × 1000 = 100 × (hi × D − (hi − lo) × N) / D
  const d = (n + 1) * (n + 2);
  const num = 100 * (hi * d - (hi - lo) * (t + 1) * (t + 2));
  return Math.floor((2 * num + d) / (2 * d)) / 1000;
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

/** Her seviyenin listedeki ilk sırası: [A, B = A, C] → [0, 2]. Eşit mekânlar karşılaştırmada tek mekân sayılır. */
export function levelStarts(list: RankedEntry[]): number[] {
  return list.flatMap((e, i) => (i === 0 || !e.tied ? [i] : []));
}

/** Kaydın bulunduğu seviyenin ilk sırası (eşitler aynı sırada: 1, 2, 2, 4) */
function levelStartOf(list: RankedEntry[], index: number) {
  let start = index;
  while (start > 0 && list[start]!.tied) start--;
  return start;
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
 * Sıra listedeki seviyeden, yarışma usulü: yalnızca "İkisi aynı" dediklerin aynı sırada (1, 2, 2, 4); puanı
 * yuvarlamada eşit görünse de (uzun listede 10,0 · 10,0) sıraladığın mekânlar ayrı sırada.
 */
export function segmentStanding(
  rankings: Rankings,
  placeId: string,
): { segment: Segment; rank: number; total: number } | undefined {
  const mine = SENTIMENT_ORDER.find((s) => rankings[s].some((e) => e.placeId === placeId));
  if (!mine) return undefined;
  const segment = rankings[mine].find((e) => e.placeId === placeId)!.segment;
  let above = 0;
  let rank = 0;
  let total = 0;
  for (const sentiment of SENTIMENT_ORDER) {
    const peers = segmentEntries(rankings[sentiment], segment);
    if (sentiment === mine) rank = above + levelStartOf(peers, peers.findIndex((e) => e.placeId === placeId)) + 1;
    else if (!rank) above += peers.length;
    total += peers.length;
  }
  return { segment, rank, total };
}

/**
 * Mekânı sıralamadan çıkarır. Çıkan kayıt eşit grubunun başıysa, segmentte altındaki eşiti grubun yeni başı olur;
 * yoksa üstteki gruba eşit sayılırdı (A > B = C iken B çıkınca C, A'ya eşitlenmez). Sunucudaki `detach_ranking`
 * ile aynı.
 */
export function removeFromRankings(rankings: Rankings, placeId: string): Rankings {
  const without = (list: RankedEntry[]) => {
    const i = list.findIndex((e) => e.placeId === placeId);
    if (i < 0) return list;
    const removed = list[i]!;
    const rest = list.filter((_, j) => j !== i);
    const wasHead = !removed.tied || !list.slice(0, i).some((e) => e.segment === removed.segment);
    const below = rest.findIndex((e, j) => j >= i && e.segment === removed.segment);
    if (wasHead && below >= 0 && rest[below]!.tied) rest[below] = { ...rest[below]!, tied: false };
    return rest;
  };
  return { liked: without(rankings.liked), fine: without(rankings.fine), disliked: without(rankings.disliked) };
}

/**
 * İkili arama durumu: yeni mekân [low, high) aralığındaki bir seviyeye girecek. Arama seviyeler üzerinde
 * yürür (bkz. `levelStarts`): eşit mekânlar tek mekân gibi bir kez sorulur, yeni mekân eşit grubu bölemez.
 */
export type Comparison = { low: number; high: number; tied?: boolean };

export const startComparison = (levels: number): Comparison => ({ low: 0, high: levels });

export const isComparisonDone = (c: Comparison) => c.low >= c.high;

/** Şu an karşılaştırılacak seviye (mekânı: `levelStarts(liste)[pivot]`) */
export const comparisonPivot = (c: Comparison) => Math.floor((c.low + c.high) / 2);

/** Kullanıcının cevabına göre aralığı daraltır */
export function answerComparison(c: Comparison, newIsBetter: boolean): Comparison {
  const pivot = comparisonPivot(c);
  return newIsBetter ? { low: c.low, high: pivot } : { low: pivot + 1, high: c.high };
}

/**
 * "İkisi aynı" (ya da karar verilemedi): yeni mekân karşılaştırılan seviyeye, eşitlerinin sonuna (eşit puan).
 * Eski "Emin değilim" hep bir alta koyup puanı düşürüyordu; eşitlik yönsüz.
 */
export const tieComparison = (c: Comparison): Comparison => {
  const at = comparisonPivot(c) + 1;
  return { low: at, high: at, tied: true };
};

/**
 * Bitmiş aramanın listedeki karşılığı: `low` seviyesinin ilk sırası (yoksa listenin sonu). Eşitlikte bu,
 * karşılaştırılan seviyenin hemen altıdır; yeni mekân `tied` ile o seviyeye katılır.
 */
export const placementIndex = (levels: number[], count: number, c: Comparison) =>
  c.low < levels.length ? levels[c.low]! : count;

/** Karşılaştırmalar kabaca kaç soru sürer (ilerleme göstergesi için; eşit mekânlar tek soru) */
export const expectedSteps = (levels: number) => (levels === 0 ? 0 : Math.ceil(Math.log2(levels + 1)));

/**
 * Puanlamanın sonucu: izlenim grubu, o gruptaki segment listesinde sıra (0 = en iyi) ve bir üstteki
 * mekânla aynı seviyede mi.
 */
export type Placement = { sentiment: Sentiment; index: number; tied?: boolean };

/**
 * Mekânı grubuna, kendi segmentinin `index`. sırasına yerleştirir (varsa eski yerinden çıkarır).
 * Sunucudaki `rank_place` ile aynı davranır: listenin başına eşitlik konmaz; eşitliksiz eklemede sıra eşit grubun
 * içine düşerse grubun sonuna iner (yeni mekân üstündekinden kötü, o da altındaki eşitleriyle aynı); kayan
 * kayıtlar bayraklarını korur.
 */
export function insertEntry(rankings: Rankings, { sentiment, index, tied }: Placement, entry: RankedEntry): Rankings {
  const next = removeFromRankings(rankings, entry.placeId);
  const list = [...next[sentiment]];
  const peers = list.flatMap((e, i) => (e.segment === entry.segment ? [i] : []));
  let target = Math.min(Math.max(index, 0), peers.length);
  if (!tied && target > 0) while (target < peers.length && list[peers[target]!]!.tied) target++;
  const at = target < peers.length ? peers[target]! : peers.length ? peers.at(-1)! + 1 : list.length;
  list.splice(at, 0, { ...entry, tied: !!tied && target > 0 });
  return { ...next, [sentiment]: list };
}
