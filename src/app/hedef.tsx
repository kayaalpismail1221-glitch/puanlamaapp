import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack } from 'expo-router';
import { SymbolView } from '@/components/symbol';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { BottomInsetSpacer } from '@/components/bottom-inset';
import { HeaderAction } from '@/components/header-button';
import { askGoal, daysLeftInYear, editGoal, GOAL_PRESETS } from '@/components/profile-parts';
import { Avatar, Button, ErrorView, LoadingView, PressableScale, Text } from '@/components/ui';
import { RefreshControl } from '@/components/refresh-control';
import { colors, fixed, fonts, gradients,  radius, spacing } from '@/constants/theme';
import { useUser } from '@/data/entities';
import { useYearChallenge } from '@/hooks/queries';
import { currentLanguage } from '@/i18n';
import { haptics } from '@/lib/haptics';
import { openUserProfile } from '@/lib/navigation';
import { shareYearGoal } from '@/lib/share';
import { placesThisYear } from '@/lib/stats';
import { useAppStore } from '@/store/app-store';
import type { YearChallengeEntry } from '@/types';

/** Tamamlanma oranı (yüzde, en fazla 100) */
const percentOf = (e: YearChallengeEntry) => (e.goal ? Math.min(100, Math.round((e.done / e.goal) * 100)) : 0);

/**
 * Sıra: bu yıl en çok mekân puanlayan üstte, eşitlikte tamamlanma oranı (kullanıcı isteği 2026-10-03; eskiden oran
 * önceydi: 10'luk hedefin 7'si 50'lik hedefin 30'unun önüne geçiyordu). Sunucunun sırası kullanılmaz.
 */
const byPlaces = (a: YearChallengeEntry, b: YearChallengeEntry) =>
  b.done - a.done || b.done / b.goal! - a.done / a.goal!;

/**
 * Yıllık hedef sayfası: üstte kendi hedefin (lacivert kart), altında takip ettiklerinin hedefleri mekân sayısına göre.
 * Kendi satırın cihazdaki güncel sayıyla çizilir (yeni puan anında yansısın).
 */
export default function YearGoalScreen() {
  const { t } = useTranslation();
  const { profile, userId, rankings, actions } = useAppStore();
  const [now] = useState(Date.now);
  const year = new Date(now).getFullYear();
  const query = useYearChallenge(year);
  const [refreshing, setRefreshing] = useState(false);

  const goal = profile?.yearGoal;
  const done = useMemo(() => placesThisYear(Object.values(rankings).flat()), [rankings]);
  const setGoal = (next: number | undefined) => actions.updateProfile({ yearGoal: next });

  const entries = useMemo(() => {
    const others = (query.data ?? []).filter((e) => e.userId !== userId);
    const mine: YearChallengeEntry | undefined = userId ? { userId, goal, done } : undefined;
    const all = mine ? [mine, ...others] : others;
    return {
      withGoal: all.filter((e) => e.goal).sort(byPlaces),
      withoutGoal: others.filter((e) => !e.goal).length,
      friends: others.length,
    };
  }, [query.data, userId, goal, done]);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([query.refetch(), actions.refresh()]);
    setRefreshing(false);
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: goal
            ? () => (
                <HeaderAction
                  icon="square.and.arrow.up"
                  iosSize={20}
                  onPress={() => shareYearGoal(year, goal, done)}
                  accessibilityLabel={t('challenge.share')}
                />
              )
            : undefined,
        }}
      />
      <ScrollView
        style={styles.container}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <LinearGradient
          colors={gradients.share}
          locations={gradients.shareStops}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}>
          <Text variant="caption" style={styles.kicker}>
            {t('challenge.kicker', { year }).toLocaleUpperCase(currentLanguage())}
          </Text>
          {goal ? (
            <>
              <View style={styles.bigRow}>
                <Text style={styles.big}>{done}</Text>
                <Text variant="title3" style={styles.ofGoal}>
                  {t('challenge.ofGoal', { goal })}
                </Text>
              </View>
              <View style={styles.heroTrack}>
                <View style={[styles.heroFill, { width: `${Math.min(100, (done / goal) * 100)}%` }]} />
              </View>
              <View style={styles.heroMeta}>
                <Text variant="subhead" style={styles.heroText}>
                  {done >= goal ? t('challenge.reached') : t('challenge.percent', { value: Math.round((done / goal) * 100) })}
                </Text>
                <Text variant="subhead" style={styles.heroText}>
                  {t('challenge.daysLeft', { count: daysLeftInYear(year, now) })}
                </Text>
              </View>
              {/* Hedefin ne saydığı: bu yıl puanlanan mekânlar */}
              <Text variant="footnote" style={styles.heroExplain}>
                {t('challenge.explain')}
              </Text>
              <View style={styles.heroButtons}>
                <PressableScale onPress={() => editGoal(year, goal, setGoal)} style={styles.heroButton}>
                  <Text variant="subhead" color={fixed.white} style={styles.bold}>
                    {t('challenge.change')}
                  </Text>
                </PressableScale>
                <PressableScale
                  onPress={() => router.push({ pathname: '/hikaye', params: { tur: 'goal' } })}
                  style={[styles.heroButton, styles.heroButtonFilled]}>
                  <SymbolView name="square.and.arrow.up" tintColor={fixed.navy} size={14} weight="semibold" />
                  <Text variant="subhead" color={fixed.navy} style={styles.bold}>
                    {t('story.shareToStory')}
                  </Text>
                </PressableScale>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.setTitle}>{t('challenge.set')}</Text>
              <Text variant="subhead" style={styles.heroText}>
                {t('profile.goalQuestion')}
              </Text>
              <Text variant="footnote" style={styles.heroExplain}>
                {t('challenge.explainSet')}
              </Text>
              <View style={styles.chips}>
                {GOAL_PRESETS.map((n) => (
                  <PressableScale
                    key={n}
                    haptic={false}
                    onPress={() => {
                      haptics.success();
                      setGoal(n);
                    }}
                    style={styles.chip}>
                    <Text variant="headline" color={fixed.navy}>
                      {n}
                    </Text>
                  </PressableScale>
                ))}
                <PressableScale onPress={() => askGoal(year, setGoal)} style={styles.chip}>
                  <Text variant="headline" color={fixed.navy}>
                    {t('profile.goalCustom')}
                  </Text>
                </PressableScale>
              </View>
            </>
          )}
        </LinearGradient>

        <Text variant="title3" style={styles.sectionTitle}>
          {t('challenge.friends')}
        </Text>

        {query.isPending ? (
          <LoadingView style={styles.loading} />
        ) : query.isError ? (
          <ErrorView onRetry={() => query.refetch()} />
        ) : entries.friends === 0 ? (
          <View style={styles.empty}>
            <SymbolView name="person.2.fill" tintColor={colors.textTertiary} size={36} />
            <Text variant="headline" align="center">
              {t('challenge.emptyTitle')}
            </Text>
            <Text variant="subhead" color={colors.textSecondary} align="center">
              {t('challenge.emptyText')}
            </Text>
            <Button title={t('challenge.findFriends')} icon="person.badge.plus" size="sm" onPress={() => router.push('/arkadas-bul')} />
          </View>
        ) : (
          <>
            {entries.withGoal.map((entry, i) => (
              <ChallengeRow key={entry.userId} entry={entry} rank={i + 1} me={entry.userId === userId} />
            ))}
            {entries.withoutGoal > 0 && (
              <Text variant="footnote" color={colors.textSecondary} align="center" style={styles.noGoal}>
                {t('challenge.noGoal', { count: entries.withoutGoal })}
              </Text>
            )}
          </>
        )}
        <View style={{ height: spacing.xxl }} />
        <BottomInsetSpacer />
      </ScrollView>
    </>
  );
}

function ChallengeRow({ entry, rank, me }: { entry: YearChallengeEntry; rank: number; me: boolean }) {
  const { t } = useTranslation();
  const user = useUser(entry.userId);
  if (!user) return null;
  const percent = percentOf(entry);
  return (
    <PressableScale
      onPress={() => openUserProfile(entry.userId)}
      scaleTo={0.99}
      haptic={false}
      style={[styles.row, me && styles.rowMe]}>
      <Text style={[styles.rank, me && styles.rankMe]}>{rank}</Text>
      <Avatar uri={user.avatarUrl} name={user.name} size={44} />
      <View style={styles.rowInfo}>
        <Text variant="headline" numberOfLines={1}>
          {me ? t('challenge.you') : user.name}
        </Text>
        <Text variant="footnote" color={colors.textSecondary}>
          {t('challenge.percent', { value: percent })}
        </Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${percent}%` }]} />
        </View>
      </View>
      <Text variant="headline" color={colors.primary} style={styles.count}>
        {entry.done} / {entry.goal}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  hero: {
    margin: spacing.lg,
    padding: spacing.xl,
    gap: spacing.md,
    borderRadius: 24,
    borderCurve: 'continuous',
  },
  kicker: {
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '700',
    letterSpacing: 1.6,
  },
  bigRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  big: {
    fontFamily: fonts.rounded,
    fontSize: 52,
    lineHeight: 58,
    fontWeight: '800',
    color: fixed.white,
    fontVariant: ['tabular-nums'],
  },
  ofGoal: {
    color: 'rgba(255,255,255,0.8)',
  },
  heroTrack: {
    height: 10,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  heroFill: {
    height: '100%',
    borderRadius: radius.full,
    backgroundColor: fixed.white,
  },
  heroMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heroText: {
    color: 'rgba(255,255,255,0.85)',
  },
  heroExplain: {
    color: 'rgba(255,255,255,0.7)',
  },
  heroButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  heroButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.lg,
    height: 36,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    justifyContent: 'center',
  },
  heroButtonFilled: {
    backgroundColor: fixed.white,
    borderColor: fixed.white,
  },
  setTitle: {
    fontFamily: fonts.serif,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
    color: fixed.white,
  },
  chips: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  chip: {
    flex: 1,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: fixed.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  loading: {
    paddingVertical: spacing.xxl,
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowMe: {
    backgroundColor: colors.surface,
  },
  rank: {
    width: 24,
    textAlign: 'center',
    fontFamily: fonts.serif,
    fontSize: 20,
    fontWeight: '700',
    color: colors.textTertiary,
    fontVariant: ['tabular-nums'],
  },
  rankMe: {
    color: colors.primary,
  },
  rowInfo: {
    flex: 1,
    gap: 3,
  },
  track: {
    height: 6,
    marginTop: 3,
    borderRadius: radius.full,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  count: {
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  noGoal: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  bold: {
    fontWeight: '600',
  },
});
