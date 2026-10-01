import { useMemo, useState } from 'react';

import { segmentOf } from '@/constants/segments';
import { usePlace } from '@/data/entities';
import { haptics } from '@/lib/haptics';
import {
  answerComparison,
  comparisonPivot,
  expectedSteps,
  insertEntry,
  isComparisonDone,
  levelStarts,
  placementIndex,
  scoreInRankings,
  segmentEntries,
  startComparison,
  tieComparison,
  type Comparison,
} from '@/lib/ranking';
import { useAppStore } from '@/store/app-store';
import type { Segment, Sentiment } from '@/types';

export type RankPhase = 'sentiment' | 'compare' | 'result';

/**
 * Akışın sonucu: hangi grup ve segment, listeye giriş sırası (`index`), bir üsttekiyle eşit mi (`tied`),
 * puan, listedeki yer (`rank`, yalnızca eşitler aynı sırada), mekân sayısı (`total`) ve seviye sayısı (`levels`;
 * puan aralığı ancak 5 seviyede tam açılır). Yeni favori eski favoriyi 10'dan indirdiyse `displaced`: kullanıcı
 * puanın neden değiştiğini görsün.
 */
export type RankResult = {
  sentiment: Sentiment;
  segment: Segment;
  index: number;
  tied?: boolean;
  score: number;
  rank: number;
  total: number;
  levels: number;
  displaced?: { placeId: string; from: number; to: number };
};

/**
 * Beli tarzı puanlama akışı (ekrandan bağımsız):
 * 1) Beğendim / İdare eder / Beğenmedim
 * 2) Aynı segment ve gruptaki mekânlarla ikili karşılaştırma ("Hangisi daha iyiydi?"); eşit mekânlar tek mekân
 *    gibi bir kez sorulur
 * 3) Sonuç: o listedeki sıra ve hesaplanan puan
 * Hem puanlama ekranı hem gönderi ekranı kullanır; kaydetmek çağıranın işi (`actions.rank`).
 */
export function useRankFlow(placeId: string | undefined) {
  const { rankings } = useAppStore();
  const place = usePlace(placeId);
  const segment = segmentOf(place?.cuisine);
  const [sentiment, setSentiment] = useState<Sentiment | null>(null);
  const [history, setHistory] = useState<Comparison[]>([]);

  // Karşılaştırılacak liste: seçilen grupta aynı segmentteki mekânlar, bu mekân hariç (yeniden puanlama)
  const candidates = useMemo(
    () => (sentiment ? segmentEntries(rankings[sentiment], segment, placeId) : []),
    [rankings, sentiment, segment, placeId],
  );
  const levels = useMemo(() => levelStarts(candidates), [candidates]);

  const comparison = history.at(-1);
  const phase: RankPhase = !sentiment || !comparison ? 'sentiment' : isComparisonDone(comparison) ? 'result' : 'compare';

  const choose = (next: Sentiment) => {
    haptics.select();
    setSentiment(next);
    setHistory([startComparison(levelStarts(segmentEntries(rankings[next], segment, placeId)).length)]);
  };

  const push = (next: Comparison) => {
    haptics.select();
    setHistory((h) => [...h, next]);
  };

  const undo = () => {
    haptics.tap();
    if (history.length > 1) setHistory((h) => h.slice(0, -1));
    else reset();
  };

  const reset = () => {
    setSentiment(null);
    setHistory([]);
  };

  const result = useMemo<RankResult | undefined>(() => {
    if (phase !== 'result' || !sentiment || !comparison || !placeId) return undefined;
    const placement = { sentiment, index: placementIndex(levels, candidates.length, comparison), tied: comparison.tied };
    // Sonucu, kaydedildiğinde oluşacak sıralamanın aynısı üzerinden hesapla (eşitlikler dahil)
    const after = insertEntry(rankings, placement, { placeId, segment, ratedAt: new Date().toISOString() });
    const score = scoreInRankings(after, placeId)!;
    const peers = segmentEntries(after[sentiment], segment);
    const afterLevels = levelStarts(peers);
    const mine = peers.findIndex((e) => e.placeId === placeId);
    const rank = 1 + afterLevels.filter((start) => start <= mine).at(-1)!;
    const previousTop = candidates[0];
    let displaced: RankResult['displaced'];
    if (previousTop && comparison.low === 0 && !comparison.tied) {
      const from = scoreInRankings(rankings, previousTop.placeId);
      const to = scoreInRankings(after, previousTop.placeId);
      if (from !== undefined && to !== undefined && to < from) displaced = { placeId: previousTop.placeId, from, to };
    }
    return { ...placement, segment, score, rank, total: peers.length, levels: afterLevels.length, displaced };
  }, [phase, sentiment, comparison, placeId, rankings, segment, candidates, levels]);

  return {
    phase,
    sentiment,
    segment,
    result,
    /** Karşılaştırma adımında yanına konan mevcut mekân (eşit grubun başı) */
    otherPlaceId:
      phase === 'compare' && comparison ? candidates[levels[comparisonPivot(comparison)] ?? -1]?.placeId : undefined,
    step: history.length,
    totalSteps: expectedSteps(levels.length),
    choose,
    answer: (newIsBetter: boolean) => comparison && push(answerComparison(comparison, newIsBetter)),
    /** "İkisi aynı": karşılaştırılan mekânla eşit puan */
    tie: () => comparison && push(tieComparison(comparison)),
    undo,
    reset,
  };
}
