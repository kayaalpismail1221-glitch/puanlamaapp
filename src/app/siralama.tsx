import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';

import { SegmentedControl } from '@/components/segmented-control';
import { UserRowsSkeleton } from '@/components/skeleton';
import { Avatar, Button, Divider, ErrorView, PressableScale, Text } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { schoolById, schoolLabel } from '@/data/schools';
import { useUser } from '@/data/entities';
import { useLeaderboard } from '@/hooks/queries';
import { haptics } from '@/lib/haptics';
import type { LeaderboardEntry, LeaderboardPeriod, LeaderboardScope } from '@/lib/leaderboard';
import { openUserProfile } from '@/lib/navigation';
import { useAppStore } from '@/store/app-store';

const PERIODS: LeaderboardPeriod[] = ['all', 'month'];

/** Liderlik tablosu: en çok değerlendirme paylaşanlar */
export default function LeaderboardScreen() {
  // `okul`: belirli bir okulun tablosu (profildeki okul rozetinden gelinir)
  const { vurgula, okul } = useLocalSearchParams<{
    vurgula?: string;
    okul?: string;
  }>();
  const { profile, userId } = useAppStore();
  const { t } = useTranslation();
  const me = userId ?? '';
  const school = schoolById(okul ?? profile?.schoolId);
  const [scope, setScope] = useState<LeaderboardScope>(okul ? 'school' : 'all');
  const [period, setPeriod] = useState<LeaderboardPeriod>('all');
  const board = useLeaderboard(scope, period, school?.id);
  const entries = board.data ?? [];

  const scopes: { key: LeaderboardScope; label: string }[] = [
    { key: 'all', label: t('leaderboard.overall') },
    { key: 'friends', label: t('leaderboard.friends') },
    ...(school ? [{ key: 'school' as const, label: school.short ?? t('leaderboard.mySchool') }] : []),
  ];

  const highlight = vurgula ?? me;
  const mine = entries.find((e) => e.userId === me);

  return (
    <>
      <Stack.Screen
        options={{
          title: scope === 'school' && school ? t('leaderboard.schoolTitle', { school: schoolLabel(school) }) : t('screens.leaderboard'),
        }}
      />
      <FlatList
        style={styles.container}
        data={entries}
        keyExtractor={(e) => e.userId}
        contentInsetAdjustmentBehavior="automatic"
        ItemSeparatorComponent={() => <Divider inset={spacing.lg + 32 + 44 + spacing.md * 2} />}
        ListHeaderComponent={
          <View>
            <SegmentedControl options={scopes} value={scope} onChange={setScope} style={styles.segment} />
            <View style={styles.periods}>
              {PERIODS.map((p) => {
                const active = p === period;
                return (
                  <PressableScale
                    key={p}
                    haptic={false}
                    onPress={() => {
                      haptics.select();
                      setPeriod(p);
                    }}
                    style={[styles.chip, active && styles.chipActive]}>
                    <Text variant="footnote" color={active ? colors.onPrimary : colors.text} style={styles.bold}>
                      {p === 'all' ? t('leaderboard.allTime') : t('leaderboard.thisMonth')}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>
            {mine ? (
              <MyRankCard mine={mine} entries={entries} />
            ) : scope === 'school' && school ? (
              <View style={styles.notMember}>
                <Text variant="subhead" color={colors.textSecondary} style={{ flex: 1 }}>
                  {t('leaderboard.notMember', { school: school.name })}
                </Text>
                <Button title={t('leaderboard.addMySchool')} size="sm" onPress={() => router.push('/okul-sec')} />
              </View>
            ) : null}
            <Text variant="caption" color={colors.textSecondary} style={styles.explain}>
              {t('leaderboard.explain')}
            </Text>
          </View>
        }
        ListEmptyComponent={
          board.isPending ? <UserRowsSkeleton rank action={false} count={8} /> : board.isError ? <ErrorView onRetry={() => board.refetch()} /> : null
        }
        renderItem={({ item }) => (
          <LeaderboardRow entry={item} highlighted={item.userId === highlight} isMe={item.userId === me} />
        )}
      />
    </>
  );
}

function LeaderboardRow({
  entry: item,
  highlighted: isHighlighted,
  isMe,
}: {
  entry: LeaderboardEntry;
  highlighted: boolean;
  isMe: boolean;
}) {
  const { t } = useTranslation();
  const user = useUser(item.userId);
  if (!user) return null;
  return (
    <PressableScale
      scaleTo={0.98}
      onPress={() => openUserProfile(item.userId)}
      style={[styles.row, isHighlighted && styles.rowHighlight]}>
      <RankBadge rank={item.rank} muted={item.reviews === 0} />
      <Avatar uri={user.avatarUrl} name={user.name} size={44} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="headline" numberOfLines={1}>
          {isMe ? t('leaderboard.you', { name: user.name }) : user.name}
        </Text>
        <Text variant="footnote" color={colors.textSecondary} numberOfLines={1}>
          {t('leaderboard.likes', { count: item.likes })}
        </Text>
      </View>
      <View style={styles.count}>
        <Text variant="title3" color={colors.primary} style={styles.countValue}>
          {item.reviews}
        </Text>
        <Text variant="caption" color={colors.textSecondary}>
          {t('leaderboard.reviews', { count: item.reviews })}
        </Text>
      </View>
    </PressableScale>
  );
}

function MyRankCard({ mine, entries }: { mine: LeaderboardEntry; entries: LeaderboardEntry[] }) {
  const { t } = useTranslation();
  const above = [...entries].reverse().find((e) => e.rank < mine.rank);
  const needed = above ? above.reviews - mine.reviews + (mine.likes > above.likes ? 0 : 1) : 0;

  return (
    <View style={styles.myCard}>
      <View style={styles.myIcon}>
        <SymbolView name="trophy.fill" tintColor={colors.onPrimary} size={22} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="headline" color={colors.primary}>
          {mine.reviews === 0 ? t('leaderboard.notRanked') : t('leaderboard.yourRank', { rank: mine.rank })}
        </Text>
        <Text variant="footnote" color={colors.textSecondary}>
          {mine.reviews === 0
            ? t('leaderboard.firstReview')
            : above
              ? t('leaderboard.toClimb', { count: Math.max(needed, 1), rank: above.rank })
              : t('leaderboard.top')}
        </Text>
      </View>
      {mine.reviews === 0 || above ? (
        <Button title={t('common.share')} onPress={() => router.push('/gonderi-olustur')} style={styles.myButton} />
      ) : null}
    </View>
  );
}

function RankBadge({ rank, muted }: { rank: number; muted: boolean }) {
  const podium = rank <= 3 && !muted;
  return (
    <View style={[styles.rank, podium && styles.rankPodium]}>
      <Text
        variant="subhead"
        color={podium ? colors.onPrimary : muted ? colors.textTertiary : colors.primary}
        style={styles.countValue}>
        {rank}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notMember: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    margin: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  segment: {
    paddingTop: spacing.sm,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  bold: {
    fontWeight: '600',
  },
  periods: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  chip: {
    height: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: colors.primary,
  },
  myCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    margin: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  myIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  myButton: {
    height: 36,
    paddingHorizontal: spacing.lg,
  },
  explain: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
  },
  rowHighlight: {
    backgroundColor: colors.surface,
  },
  rank: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankPodium: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  count: {
    alignItems: 'flex-end',
  },
  countValue: {
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
