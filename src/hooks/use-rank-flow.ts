import { useMemo, useState } from 'react';

import { haptics } from '@/lib/haptics';
import {
  answerComparison,
  comparisonPivot,
  expectedSteps,
  isComparisonDone,
  scoreAt,
  skipComparison,
  startComparison,
  type Comparison,
} from '@/lib/ranking';
import { useAppStore } from '@/store/app-store';
import type { Sentiment } from '@/types';

export type RankPhase = 'sentiment' | 'compare' | 'result';

/** Akışın sonucu: hangi gruba, gruptaki kaçıncı sıraya ve bunun puanı */
export type RankResult = { sentiment: Sentiment; index: number; score: number; total: number };

/**
 * Beli tarzı puanlama akışı (ekrandan bağımsız):
 * 1) Beğendim / İdare eder / Beğenmedim
 * 2) Aynı gruptaki mekânlarla ikili karşılaştırma ("Hangisi daha iyiydi?")
 * 3) Sonuç: gruptaki sıra ve hesaplanan puan
 * Hem puanlama ekranı hem gönderi ekranı kullanır; kaydetmek çağıranın işi (`actions.rank`).
 */
export function useRankFlow(placeId: string | undefined) {
  const { rankings } = useAppStore();
  const [sentiment, setSentiment] = useState<Sentiment | null>(null);
  const [history, setHistory] = useState<Comparison[]>([]);

  // Karşılaştırılacak liste: seçilen grup, bu mekân hariç (yeniden puanlama durumu)
  const candidates = useMemo(
    () => (sentiment ? rankings[sentiment].filter((e) => e.placeId !== placeId) : []),
    [rankings, sentiment, placeId],
  );

  const comparison = history.at(-1);
  const phase: RankPhase = !sentiment || !comparison ? 'sentiment' : isComparisonDone(comparison) ? 'result' : 'compare';

  const choose = (next: Sentiment) => {
    haptics.select();
    setSentiment(next);
    setHistory([startComparison(rankings[next].filter((e) => e.placeId !== placeId).length)]);
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

  const result: RankResult | undefined =
    phase === 'result' && sentiment && comparison
      ? {
          sentiment,
          index: comparison.low,
          score: scoreAt(sentiment, comparison.low, candidates.length + 1),
          total: candidates.length + 1,
        }
      : undefined;

  return {
    phase,
    sentiment,
    result,
    /** Karşılaştırma adımında yanına konan mevcut mekân */
    otherPlaceId: phase === 'compare' && comparison ? candidates[comparisonPivot(comparison)]?.placeId : undefined,
    step: history.length,
    totalSteps: expectedSteps(candidates.length),
    choose,
    answer: (newIsBetter: boolean) => comparison && push(answerComparison(comparison, newIsBetter)),
    skip: () => comparison && push(skipComparison(comparison)),
    undo,
    reset,
  };
}
