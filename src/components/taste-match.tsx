import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Bone, Skeleton } from '@/components/skeleton';
import { PressableScale, ScoreBadge, Text } from '@/components/ui';
import { colors, radius, scoreColor, scoreInk, spacing } from '@/constants/theme';
import { useTasteMatch } from '@/hooks/queries';

/** Uyum yüzdesi için gereken en az ortak mekân (sunucudaki taste_match_percent ile aynı) */
export const MATCH_MIN_COMMON = 3;

/** Yüzde, puan renk skalasında: %82 → 8,2'nin rengi */
export const matchInk = (percent: number) => scoreInk(percent / 10);

/** Yuvarlak yüzde rozeti ("%82"); yüzde yoksa çatal-bıçak simgesi */
export function MatchDisc({ percent, size = 44 }: { percent?: number; size?: number }) {
  const { t } = useTranslation();
  const color = percent === undefined ? colors.border : scoreColor(percent / 10);
  return (
    <View style={[styles.disc, { width: size, height: size, borderColor: color, borderWidth: size > 60 ? 4 : 2.5 }]}>
      {percent === undefined ? (
        <SymbolView name="fork.knife" tintColor={colors.textTertiary} size={size * 0.4} />
      ) : (
        <Text
          color={matchInk(percent)}
          numberOfLines={1}
          adjustsFontSizeToFit
          style={[styles.discText, { fontSize: size * 0.3, maxWidth: size - 8 }]}>
          {t('profile.percent', { value: percent })}
        </Text>
      )}
    </View>
  );
}

/**
 * Başkasının profilinde damak uyumu satırı: "%82 · 14 ortak mekân".
 * Ortak mekân azsa kaç tane daha gerektiğini, hiç yoksa onun gittiği yerlere bakmayı önerir.
 */
export function TasteMatchRow({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const query = useTasteMatch(userId);
  const match = query.data;

  if (query.isPending) {
    return (
      <Skeleton style={styles.row}>
        <Bone width={44} height={44} round />
        <View style={styles.info}>
          <Bone width="40%" height={16} />
          <Bone width="60%" height={12} />
        </View>
      </Skeleton>
    );
  }
  if (!match) return null;

  const subtitle =
    match.percent !== undefined
      ? t('match.common', { count: match.common })
      : match.common > 0
        ? t('match.needMore', { count: match.common, left: MATCH_MIN_COMMON - match.common })
        : t('match.none');

  const open = () =>
    match.common > 0
      ? router.push({ pathname: '/uyum/[id]', params: { id: userId } })
      : router.push({ pathname: '/gittiklerim/[id]', params: { id: userId } });

  return (
    <PressableScale onPress={open} scaleTo={0.99} style={styles.row} accessibilityRole="button">
      <MatchDisc percent={match.percent} />
      <View style={styles.info}>
        <Text variant="headline">{t('match.title')}</Text>
        <Text variant="footnote" color={colors.textSecondary}>
          {subtitle}
        </Text>
      </View>
      <SymbolView name="chevron.right" tintColor={colors.textTertiary} size={14} weight="semibold" />
    </PressableScale>
  );
}

/** İki puan yan yana: "Sen 8,4 · Zeynep 9,1" */
export function DualScore({ mine, theirs, theirName }: { mine: number; theirs: number; theirName: string }) {
  const { t } = useTranslation();
  return (
    <View style={styles.dual}>
      <View style={styles.dualItem}>
        <Text variant="caption" color={colors.textSecondary} numberOfLines={1}>
          {t('post.you')}
        </Text>
        <ScoreBadge score={mine} size="sm" />
      </View>
      <View style={styles.dualItem}>
        <Text variant="caption" color={colors.textSecondary} numberOfLines={1} style={styles.dualName}>
          {theirName}
        </Text>
        <ScoreBadge score={theirs} size="sm" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
  },
  info: {
    flex: 1,
    gap: spacing.xs,
  },
  disc: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  discText: {
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },
  dual: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dualItem: {
    alignItems: 'center',
    gap: 2,
    width: 48,
  },
  dualName: {
    maxWidth: 48,
  },
});
