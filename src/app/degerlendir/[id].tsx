import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, ZoomIn } from 'react-native-reanimated';

import { Button, LoadingView, PlaceImage, PressableScale, ScoreBadge, Text } from '@/components/ui';
import { cuisineLabel } from '@/constants/cuisines';
import { colors, hitSlop, radius, spacing, typography } from '@/constants/theme';
import { getPlace, usePlace } from '@/data/entities';
import { useKeyboardFooterStyle } from '@/hooks/use-keyboard-footer';
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
  // `from=gonderi`: gönderi ekranından açıldıysa oraya geri dönülür
  // `sonra=gonderi`: kaydedince doğrudan gönderi ekranına geçilir (onboarding)
  const { id, from, sonra } = useLocalSearchParams<{ id: string; from?: string; sonra?: string }>();
  const place = usePlace(id);
  const { rankings, onboarded, actions } = useAppStore();
  const { t } = useTranslation();
  const footerStyle = useKeyboardFooterStyle();

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

  if (place === undefined) return <LoadingView style={styles.container} />;
  if (!place) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text>{t('rate.notFound')}</Text>
        <Button title={t('rate.close')} variant="ghost" onPress={() => router.back()} />
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

  const save = (thenShare = false) => {
    if (!sentiment || !comparison) return;
    haptics.success();
    actions.rank(place.id, sentiment, comparison.low, note);
    if (sonra === 'gonderi') {
      router.replace({ pathname: '/gonderi-olustur', params: { placeId: place.id, akis: 'onboarding' } });
    } else if (thenShare) {
      router.replace({ pathname: '/gonderi-olustur', params: { placeId: place.id } });
    } else router.back();
  };

  return (
    <View style={[styles.container, { paddingTop: spacing.lg }]}>
      {/* Üst bar */}
      <View style={styles.topBar}>
        <PressableScale onPress={() => router.back()} hitSlop={hitSlop} style={styles.iconButton} accessibilityLabel={t('rate.close')}>
          <SymbolView name="xmark" tintColor={colors.primary} size={16} weight="semibold" />
        </PressableScale>
        {phase !== 'sentiment' && (
          <PressableScale onPress={undo} hitSlop={hitSlop} style={styles.iconButton} accessibilityLabel={t('rate.undo')}>
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
            {cuisineLabel(place.cuisine)} · {place.neighborhood}
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        {phase === 'sentiment' && (
          <Animated.View key="sentiment" entering={FadeIn} exiting={FadeOut} style={styles.section}>
            <Text variant="title2" color={colors.primary}>
              {t('rate.howWasIt')}
            </Text>
            {(['liked', 'fine', 'disliked'] as Sentiment[]).map((s, i) => (
              <Animated.View key={s} entering={FadeInDown.delay(60 * i).springify()}>
                <PressableScale onPress={() => chooseSentiment(s)} haptic={false} style={styles.sentiment}>
                  <View style={styles.sentimentIcon}>
                    <SymbolView name={SENTIMENT_ICONS[s]} tintColor={colors.primary} size={20} />
                  </View>
                  <Text variant="headline">{t(`sentiments.${s}`)}</Text>
                </PressableScale>
              </Animated.View>
            ))}
          </Animated.View>
        )}

        {phase === 'compare' && comparison && (
          <CompareStep
            key={`${comparison.low}-${comparison.high}`}
            place={place}
            other={getPlace(candidates[comparisonPivot(comparison)]!.placeId)}
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
                ? t('rate.firstInList', { list: t(`sentiments.${sentiment}`) })
                : t('rate.position', {
                    list: t(`sentiments.${sentiment}`),
                    total: candidates.length + 1,
                    rank: comparison.low + 1,
                  })}
            </Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder={t('rate.notePlaceholder')}
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={200}
              style={[typography.body, styles.note]}
            />
          </Animated.View>
        )}
      </View>

      {phase === 'result' && (
        <Animated.View style={[styles.footer, footerStyle]}>
          <Button title={sonra === 'gonderi' ? t('rate.saveAndContinue') : t('common.save')} onPress={() => save()} />
          {/* Onboarding sırasında gönderi ekranı henüz erişilebilir değil */}
          {onboarded && from !== 'gonderi' && (
            <Button title={t('rate.saveAndShare')} icon="camera" variant="ghost" onPress={() => save(true)} />
          )}
        </Animated.View>
      )}
    </View>
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
  /** Karşılaştırılan mekân önbellekte yoksa (çok nadir) "Emin değilim" gibi davranılır */
  other: Place | undefined;
  step: number;
  total: number;
  onPick: (newIsBetter: boolean) => void;
  onSkip: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)} style={styles.section}>
      <View style={styles.compareTitle}>
        <Text variant="title2" color={colors.primary}>
          {t('rate.whichBetter')}
        </Text>
        <Text variant="footnote" color={colors.textSecondary}>
          {Math.min(step, total)}/{total}
        </Text>
      </View>
      <View style={styles.compareRow}>
        <CompareCard place={place} onPress={() => onPick(true)} />
        <View style={styles.vs}>
          <Text variant="caption" color={colors.textSecondary}>
            {t('rate.or')}
          </Text>
        </View>
        {other ? <CompareCard place={other} onPress={() => onPick(false)} /> : <View style={styles.compareCard} />}
      </View>
      <Button title={t('rate.notSure')} variant="ghost" onPress={onSkip} />
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
    gap: spacing.xs,
  },
});
