import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';

import { Button, PlaceImage, PressableScale, Text } from '@/components/ui';
import { SEGMENT_ICONS } from '@/constants/segments';
import { colors, radius, spacing } from '@/constants/theme';
import type { RankResult } from '@/hooks/use-rank-flow';
import { placeArea } from '@/lib/place';
import { FULL_SPREAD_AT } from '@/lib/ranking';
import type { Place, Segment, Sentiment } from '@/types';

/**
 * Beli tarzı puanlama adımlarının görünümü (mantık: hooks/use-rank-flow).
 * `compact`: gönderi ekranına gömülü, daha sıkışık yerleşim.
 */

const SENTIMENTS: Sentiment[] = ['liked', 'fine', 'disliked'];

const SENTIMENT_ICONS: Record<Sentiment, SFSymbol> = {
  liked: 'hand.thumbsup.fill',
  fine: 'hand.raised.fill',
  disliked: 'hand.thumbsdown.fill',
};

/** 1) Beğendim / İdare eder / Beğenmedim */
export function SentimentChoice({ onChoose, compact }: { onChoose: (s: Sentiment) => void; compact?: boolean }) {
  const { t } = useTranslation();
  if (compact) {
    return (
      <Animated.View entering={FadeIn} style={styles.pills}>
        {SENTIMENTS.map((s) => (
          <PressableScale key={s} onPress={() => onChoose(s)} haptic={false} style={styles.pill}>
            <SymbolView name={SENTIMENT_ICONS[s]} tintColor={colors.primary} size={20} />
            <Text variant="footnote" style={styles.bold} numberOfLines={1}>
              {t(`sentiments.${s}`)}
            </Text>
          </PressableScale>
        ))}
      </Animated.View>
    );
  }
  return (
    <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.section}>
      <Text variant="title2" color={colors.primary}>
        {t('rate.howWasIt')}
      </Text>
      {SENTIMENTS.map((s, i) => (
        <Animated.View key={s} entering={FadeInDown.delay(60 * i).springify()}>
          <PressableScale onPress={() => onChoose(s)} haptic={false} style={styles.sentiment}>
            <View style={styles.sentimentIcon}>
              <SymbolView name={SENTIMENT_ICONS[s]} tintColor={colors.primary} size={20} />
            </View>
            <Text variant="headline">{t(`sentiments.${s}`)}</Text>
          </PressableScale>
        </Animated.View>
      ))}
    </Animated.View>
  );
}

/** Karşılaştırmanın yapıldığı segment: "🔥 Sokak lezzetleri" */
export function SegmentTag({ segment }: { segment: Segment }) {
  const { t } = useTranslation();
  return (
    <View style={styles.segmentTag}>
      <SymbolView name={SEGMENT_ICONS[segment]} tintColor={colors.textSecondary} size={12} weight="semibold" />
      <Text variant="caption" color={colors.textSecondary} style={styles.bold}>
        {t(`segments.${segment}`)}
      </Text>
    </View>
  );
}

/** 2) "Hangisi daha iyiydi?" — yalnızca aynı segmentteki mekânlarla */
export function CompareStep({
  place,
  other,
  segment,
  step,
  total,
  onPick,
  onSkip,
  compact,
}: {
  place: Place;
  /** Karşılaştırılan mekân önbellekte yoksa (çok nadir) "Emin değilim" gibi davranılır */
  other: Place | undefined;
  segment: Segment;
  step: number;
  total: number;
  onPick: (newIsBetter: boolean) => void;
  onSkip: () => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)} style={styles.section}>
      <View style={styles.compareTitle}>
        <Text variant={compact ? 'headline' : 'title2'} color={colors.primary}>
          {t('rate.whichBetter')}
        </Text>
        <Text variant="footnote" color={colors.textSecondary}>
          {Math.min(step, total)}/{total}
        </Text>
      </View>
      <View style={styles.compareMeta}>
        <SegmentTag segment={segment} />
        {!compact && (
          <Text variant="caption" color={colors.textTertiary} style={styles.flex} numberOfLines={1}>
            {t('rate.sameSegmentOnly')}
          </Text>
        )}
      </View>
      <View style={styles.compareRow}>
        <CompareCard place={place} onPress={() => onPick(true)} compact={compact} />
        <View style={styles.vs}>
          <Text variant="caption" color={colors.textSecondary}>
            {t('rate.or')}
          </Text>
        </View>
        {other ? (
          <CompareCard place={other} onPress={() => onPick(false)} compact={compact} />
        ) : (
          <View style={styles.compareCard} />
        )}
      </View>
      <Button title={t('rate.notSure')} variant="ghost" size={compact ? 'sm' : 'md'} onPress={onSkip} />
    </Animated.View>
  );
}

function CompareCard({ place, onPress, compact }: { place: Place; onPress: () => void; compact?: boolean }) {
  return (
    <PressableScale onPress={onPress} haptic={false} scaleTo={0.95} style={styles.compareCard}>
      <PlaceImage uri={place.photoUrl} style={[styles.compareImage, compact && styles.compareImageCompact]} />
      <View style={[styles.compareInfo, compact && styles.compareInfoCompact]}>
        <Text variant={compact ? 'subhead' : 'headline'} style={compact && styles.bold} numberOfLines={2}>
          {place.name}
        </Text>
        <Text variant="footnote" color={colors.textSecondary} numberOfLines={1}>
          {placeArea(place)}
        </Text>
      </View>
    </PressableScale>
  );
}

/**
 * 3) "“Beğendim” listende 5 mekân arasında 2. sırada." (liste = aynı segment)
 * Liste kısayken puanın henüz kesinleşmediği de söylenir.
 */
export function useRankResultText() {
  const { t } = useTranslation();
  return (result: RankResult) => {
    const list = t(`sentiments.${result.sentiment}`);
    const text =
      result.total === 1
        ? t('rate.firstInList', { list })
        : t('rate.position', { list, total: result.total, rank: result.index + 1 });
    return result.total < FULL_SPREAD_AT ? `${text}\n${t('rate.provisional')}` : text;
  };
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.md,
  },
  bold: {
    fontWeight: '600',
  },
  flex: {
    flex: 1,
  },
  segmentTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
  compareMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: -spacing.xs,
  },
  pills: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  pill: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.border,
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
  compareImageCompact: {
    aspectRatio: 4 / 3,
  },
  compareInfo: {
    padding: spacing.md,
    gap: 2,
    minHeight: 76,
  },
  compareInfoCompact: {
    padding: spacing.sm,
    minHeight: 60,
  },
  vs: {
    width: 40,
    alignItems: 'center',
  },
});
