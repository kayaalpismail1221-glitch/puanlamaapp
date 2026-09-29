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
 * puan, listedeki yer (`rank`, eşitler aynı sırada) ve mekân sayısı (`total`). Yeni favori eski favoriyi
 * 10'dan indirdiyse `displaced`: kullanıcı puanın neden değiştiğini görsün.
 */
export type RankResult = {
  sentiment: Sentiment;
  segment: Segment;
  index: number;
  tied?: boolean;
  score: number;
  rank: number;
  total: number;
  displaced?: { placeId: string; from: number; to: number };
};

/**
 * Beli tarzı puanlama akışı (ekrandan bağımsız):
 * 1) Beğendim / İdare eder / Beğenmedim
 * 2) Aynı segment ve gruptaki mekânlarla ikili karşılaştırma ("Hangisi daha iyiydi?")
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

  const comparison = history.at(-1);
  const phase: RankPhase = !sentiment || !comparison ? 'sentiment' : isComparisonDone(comparison) ? 'result' : 'compare';

  const choose = (next: Sentiment) => {
    haptics.select();
    setSentiment(next);
    setHistory([startComparison(segmentEntries(rankings[next], segment, placeId).length)]);
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
    const placement = { sentiment, index: comparison.low, tied: comparison.tied };
    // Sonucu, kaydedildiğinde oluşacak sıralamanın aynısı üzerinden hesapla (eşitlikler dahil)
    const after = insertEntry(rankings, placement, { placeId, segment, ratedAt: new Date().toISOString() });
    const score = scoreInRankings(after, placeId)!;
    const peers = segmentEntries(after[sentiment], segment);
    const rank = 1 + peers.filter((e) => scoreInRankings(after, e.placeId)! > score).length;
    const previousTop = candidates[0];
    let displaced: RankResult['displaced'];
    if (previousTop && comparison.low === 0 && !comparison.tied) {
      const from = scoreInRankings(rankings, previousTop.placeId);
      const to = scoreInRankings(after, previousTop.placeId);
      if (from !== undefined && to !== undefined && to < from) displaced = { placeId: previousTop.placeId, from, to };
    }
    return { ...placement, segment, score, rank, total: peers.length, displaced };
  }, [phase, sentiment, comparison, placeId, rankings, segment, candidates]);

  return {
    phase,
    sentiment,
    segment,
    result,
    /** Karşılaştırma adımında yanına konan mevcut mekân */
    otherPlaceId: phase === 'compare' && comparison ? candidates[comparisonPivot(comparison)]?.placeId : undefined,
    step: history.length,
    totalSteps: expectedSteps(candidates.length),
    choose,
    answer: (newIsBetter: boolean) => comparison && push(answerComparison(comparison, newIsBetter)),
    /** "İkisi aynı": karşılaştırılan mekânla eşit puan */
    tie: () => comparison && push(tieComparison(comparison)),
    undo,
    reset,
  };
}
