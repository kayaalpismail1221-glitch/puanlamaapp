import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { SegmentedControl } from '@/components/segmented-control';
import { Avatar, Button, Divider, PressableScale, Text } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { schoolById, schoolLabel } from '@/data/schools';
import { useLeaderboard, type LeaderboardScope } from '@/hooks/use-leaderboard';
import { haptics } from '@/lib/haptics';
import type { LeaderboardEntry, LeaderboardPeriod } from '@/lib/leaderboard';
import { openUserProfile } from '@/lib/navigation';
import { useAppStore } from '@/store/app-store';
import { ME } from '@/types';

const PERIODS: { key: LeaderboardPeriod; label: string }[] = [
  { key: 'all', label: 'Tüm zamanlar' },
  { key: 'month', label: 'Bu ay' },
];

/** Liderlik tablosu: en çok değerlendirme paylaşanlar */
export default function LeaderboardScreen() {
  // `okul`: belirli bir okulun tablosu (profildeki okul rozetinden gelinir)
  const { vurgula, okul } = useLocalSearchParams<{ vurgula?: string; okul?: string }>();
  const { getUser, profile } = useAppStore();
  const school = schoolById(okul ?? profile?.schoolId);
  const [scope, setScope] = useState<LeaderboardScope>(okul ? 'school' : 'all');
  const [period, setPeriod] = useState<LeaderboardPeriod>('all');
  const entries = useLeaderboard(scope, period, school?.id);

  const scopes: { key: LeaderboardScope; label: string }[] = [
    { key: 'all', label: 'Genel' },
    { key: 'friends', label: 'Arkadaşlar' },
    ...(school ? [{ key: 'school' as const, label: schoolLabel(school) }] : []),
  ];

  const highlight = vurgula ?? ME;
  const mine = entries.find((e) => e.userId === ME);

  return (
    <>
      <Stack.Screen
        options={{ title: scope === 'school' && school ? `${schoolLabel(school)} sıralaması` : 'Liderlik tablosu' }}
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
                const active = p.key === period;
                return (
                  <PressableScale
                    key={p.key}
                    haptic={false}
                    onPress={() => {
                      haptics.select();
                      setPeriod(p.key);
                    }}
                    style={[styles.chip, active && styles.chipActive]}>
                    <Text variant="footnote" color={active ? colors.onPrimary : colors.text} style={styles.bold}>
                      {p.label}
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
                  {school.name} tablosunda değilsin. Okulun burası mı?
                </Text>
                <Button title="Okulumu ekle" size="sm" onPress={() => router.push('/okul-sec')} />
              </View>
            ) : null}
            <Text variant="caption" color={colors.textSecondary} style={styles.explain}>
              Sıralama paylaşılan değerlendirme sayısına göre yapılır. Eşitlikte daha çok beğeni alan öne geçer.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const user = getUser(item.userId);
          if (!user) return null;
          const isHighlighted = item.userId === highlight;
          return (
            <PressableScale
              scaleTo={0.98}
              onPress={() => openUserProfile(item.userId)}
              style={[styles.row, isHighlighted && styles.rowHighlight]}>
              <RankBadge rank={item.rank} muted={item.reviews === 0} />
              <Avatar uri={user.avatarUrl} name={user.name} size={44} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="headline" numberOfLines={1}>
                  {item.userId === ME ? `${user.name} (sen)` : user.name}
                </Text>
                <Text variant="footnote" color={colors.textSecondary} numberOfLines={1}>
                  {item.likes} beğeni
                </Text>
              </View>
              <View style={styles.count}>
                <Text variant="title3" color={colors.primary} style={styles.countValue}>
                  {item.reviews}
                </Text>
                <Text variant="caption" color={colors.textSecondary}>
                  değerlendirme
                </Text>
              </View>
            </PressableScale>
          );
        }}
      />
    </>
  );
}

function MyRankCard({ mine, entries }: { mine: LeaderboardEntry; entries: LeaderboardEntry[] }) {
  const above = [...entries].reverse().find((e) => e.rank < mine.rank);
  const needed = above ? above.reviews - mine.reviews + (mine.likes > above.likes ? 0 : 1) : 0;

  return (
    <View style={styles.myCard}>
      <View style={styles.myIcon}>
        <SymbolView name="trophy.fill" tintColor={colors.onPrimary} size={22} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="headline" color={colors.primary}>
          {mine.reviews === 0 ? 'Henüz sıralamada değilsin' : `Sıran: #${mine.rank}`}
        </Text>
        <Text variant="footnote" color={colors.textSecondary}>
          {mine.reviews === 0
            ? 'İlk değerlendirmeni paylaş, tabloya gir.'
            : above
              ? `${Math.max(needed, 1)} değerlendirme daha paylaşırsan #${above.rank} olursun.`
              : 'Zirvedesin! 🏆'}
        </Text>
      </View>
      {mine.reviews === 0 || above ? (
        <Button title="Paylaş" onPress={() => router.push('/gonderi-olustur')} style={styles.myButton} />
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
