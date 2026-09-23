import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, PlaceImage, PressableScale, ScoreBadge, Text } from '@/components/ui';
import { colors, hitSlop, radius, spacing, typography } from '@/constants/theme';
import { placeById } from '@/data/mock';
import { haptics } from '@/lib/haptics';
import {
  answerComparison,
  comparisonPivot,
  expectedSteps,
  isComparisonDone,
  SENTIMENT_LABELS,
  scoreAt,
  skipComparison,
  startComparison,
  type Comparison,
} from '@/lib/ranking';
import { useAppStore } from '@/store/app-store';
import type { Place, Sentiment } from '@/types';

const SENTIMENT_ICONS: Record<Sentiment, SFSymbol> = {
  liked: 'hand.thumbsup.fill',
  fine: 'hand.raised.fill',
  disliked: 'hand.thumbsdown.fill',
};

/**
 * Puanlama akışı:
 * 1) Beğendim / İdare eder / Beğenmedim
 * 2) Aynı gruptaki mekânlarla ikili karşılaştırma ("Hangisi daha iyiydi?")
 * 3) Hesaplanan puan + isteğe bağlı not
 */
export default function RateScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const place = placeById(id);
  const { rankings, dispatch } = useAppStore();
  const insets = useSafeAreaInsets();

  const [sentiment, setSentiment] = useState<Sentiment | null>(null);
  const [history, setHistory] = useState<Comparison[]>([]);
  const [note, setNote] = useState(
    () => Object.values(rankings).flat().find((e) => e.placeId === id)?.note ?? '',
  );

  // Karşılaştırılacak liste: seçilen grup, bu mekân hariç (yeniden puanlama durumu)
  const candidates = useMemo(
    () => (sentiment ? rankings[sentiment].filter((e) => e.placeId !== id) : []),
    [rankings, sentiment, id],
  );

  if (!place) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text>Mekân bulunamadı.</Text>
        <Button title="Kapat" variant="ghost" onPress={() => router.back()} />
      </View>
    );
  }

  const comparison = history.at(-1);
  const phase = !sentiment || !comparison ? 'sentiment' : isComparisonDone(comparison) ? 'result' : 'compare';

  const chooseSentiment = (s: Sentiment) => {
    haptics.select();
    setSentiment(s);
    const count = rankings[s].filter((e) => e.placeId !== id).length;
    setHistory([startComparison(count)]);
  };

  const answer = (next: Comparison) => {
    haptics.select();
    setHistory((h) => [...h, next]);
  };

  const undo = () => {
    haptics.tap();
    if (history.length > 1) setHistory((h) => h.slice(0, -1));
    else {
      setSentiment(null);
      setHistory([]);
    }
  };

  const save = () => {
    if (!sentiment || !comparison) return;
    haptics.success();
    dispatch({
      type: 'rank',
      sentiment,
      index: comparison.low,
      entry: { placeId: place.id, note: note.trim() || undefined, ratedAt: new Date().toISOString() },
    });
    router.back();
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: spacing.lg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Üst bar */}
      <View style={styles.topBar}>
        <PressableScale onPress={() => router.back()} hitSlop={hitSlop} style={styles.iconButton} accessibilityLabel="Kapat">
          <SymbolView name="xmark" tintColor={colors.primary} size={16} weight="semibold" />
        </PressableScale>
        {phase !== 'sentiment' && (
          <PressableScale onPress={undo} hitSlop={hitSlop} style={styles.iconButton} accessibilityLabel="Geri al">
            <SymbolView name="arrow.uturn.backward" tintColor={colors.primary} size={16} weight="semibold" />
          </PressableScale>
        )}
      </View>

      <View style={styles.placeHeader}>
        <PlaceImage uri={place.photoUrl} style={styles.placeThumb} />
        <View style={{ flex: 1 }}>
          <Text variant="title3" numberOfLines={1}>
            {place.name}
          </Text>
          <Text variant="footnote" color={colors.textSecondary}>
            {place.cuisine} · {place.neighborhood}
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        {phase === 'sentiment' && (
          <Animated.View key="sentiment" entering={FadeIn} exiting={FadeOut} style={styles.section}>
            <Text variant="title2" color={colors.primary}>
              Nasıldı?
            </Text>
            {(['liked', 'fine', 'disliked'] as Sentiment[]).map((s, i) => (
              <Animated.View key={s} entering={FadeInDown.delay(60 * i).springify()}>
                <PressableScale onPress={() => chooseSentiment(s)} haptic={false} style={styles.sentiment}>
                  <View style={styles.sentimentIcon}>
                    <SymbolView name={SENTIMENT_ICONS[s]} tintColor={colors.primary} size={20} />
                  </View>
                  <Text variant="headline">{SENTIMENT_LABELS[s]}</Text>
                </PressableScale>
              </Animated.View>
            ))}
          </Animated.View>
        )}

        {phase === 'compare' && comparison && (
          <CompareStep
            key={`${comparison.low}-${comparison.high}`}
            place={place}
            other={placeById(candidates[comparisonPivot(comparison)]!.placeId)!}
            step={history.length}
            total={expectedSteps(candidates.length)}
            onPick={(newIsBetter) => answer(answerComparison(comparison, newIsBetter))}
            onSkip={() => answer(skipComparison(comparison))}
          />
        )}

        {phase === 'result' && sentiment && comparison && (
          <Animated.View key="result" entering={FadeIn} style={[styles.section, styles.resultSection]}>
            <Animated.View entering={ZoomIn.springify()}>
              <ScoreBadge score={scoreAt(sentiment, comparison.low, candidates.length + 1)} size="lg" />
            </Animated.View>
            <Text variant="subhead" color={colors.textSecondary} align="center">
              {candidates.length === 0
                ? `“${SENTIMENT_LABELS[sentiment]}” listendeki ilk mekân.`
                : `“${SENTIMENT_LABELS[sentiment]}” listende ${candidates.length + 1} mekân arasında ${comparison.low + 1}. sırada.`}
            </Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Kısa bir not ekle (isteğe bağlı)"
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={200}
              style={[typography.body, styles.note]}
            />
          </Animated.View>
        )}
      </View>

      {phase === 'result' && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <Button title="Kaydet" onPress={save} />
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function CompareStep({
  place,
  other,
  step,
  total,
  onPick,
  onSkip,
}: {
  place: Place;
  other: Place;
  step: number;
  total: number;
  onPick: (newIsBetter: boolean) => void;
  onSkip: () => void;
}) {
  return (
    <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)} style={styles.section}>
      <View style={styles.compareTitle}>
        <Text variant="title2" color={colors.primary}>
          Hangisi daha iyiydi?
        </Text>
        <Text variant="footnote" color={colors.textSecondary}>
          {Math.min(step, total)}/{total}
        </Text>
      </View>
      <View style={styles.compareRow}>
        <CompareCard place={place} onPress={() => onPick(true)} />
        <View style={styles.vs}>
          <Text variant="caption" color={colors.textSecondary}>
            veya
          </Text>
        </View>
        <CompareCard place={other} onPress={() => onPick(false)} />
      </View>
      <Button title="Emin değilim" variant="ghost" onPress={onSkip} />
    </Animated.View>
  );
}

function CompareCard({ place, onPress }: { place: Place; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} haptic={false} scaleTo={0.95} style={styles.compareCard}>
      <PlaceImage uri={place.photoUrl} style={styles.compareImage} />
      <View style={styles.compareInfo}>
        <Text variant="headline" numberOfLines={2}>
          {place.name}
        </Text>
        <Text variant="footnote" color={colors.textSecondary} numberOfLines={1}>
          {place.neighborhood}
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  placeThumb: {
    width: 56,
    height: 56,
    borderRadius: radius.button,
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
  },
  section: {
    gap: spacing.md,
  },
  sentiment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sentimentIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compareTitle: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  compareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  compareCard: {
    flex: 1,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
  compareImage: {
    width: '100%',
    aspectRatio: 1,
  },
  compareInfo: {
    padding: spacing.md,
    gap: 2,
    minHeight: 76,
  },
  vs: {
    width: 40,
    alignItems: 'center',
  },
  resultSection: {
    alignItems: 'center',
    gap: spacing.lg,
  },
  note: {
    alignSelf: 'stretch',
    minHeight: 96,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    paddingTop: spacing.md,
    color: colors.text,
    textAlignVertical: 'top',
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
});
