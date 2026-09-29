import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from '@/components/symbol';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { setInviter } from '@/api/content';
import { showError } from '@/api/errors';
import { GlassSurface } from '@/components/glass-surface';
import { LeaderboardIntro, useLeaderboardIntro } from '@/components/leaderboard-intro';
import { SegmentedControl } from '@/components/segmented-control';
import { UserRowsSkeleton } from '@/components/skeleton';
import { Avatar, Button, Divider, ErrorView, PressableScale, Text } from '@/components/ui';
import { colors, hitSlop, radius, spacing } from '@/constants/theme';
import { schoolById, schoolLabel } from '@/data/schools';
import { useUser } from '@/data/entities';
import { useLeaderboard } from '@/hooks/queries';
import { currentLocale } from '@/i18n';
import { showAlert, showPrompt } from '@/lib/dialog';
import { haptics } from '@/lib/haptics';
import type { LeaderboardEntry, LeaderboardPeriod, LeaderboardScope } from '@/lib/leaderboard';
import { openUserProfile } from '@/lib/navigation';
import { queryClient } from '@/lib/query-client';
import { shareInvite } from '@/lib/share';
import { levelOf } from '@/lib/xp';
import { useAppStore } from '@/store/app-store';

const PERIODS: LeaderboardPeriod[] = ['all', 'month'];

/** Kürsü renkleri: altın, gümüş, bronz */
const MEDALS = ['#E8B44A', '#AAB4BF', '#C98A5E'];

/** "Seni kim davet etti?" katıldıktan sonra bu kadar gün sorulur (sunucuyla aynı) */
const INVITER_DAYS = 30;

const formatXp = (xp: number) => xp.toLocaleString(currentLocale());

/**
 * Puanla Ligi: XP'ye göre liderlik tablosu (kurallar `lib/xp.ts`). Genel / Okulum / Arkadaşlar; tüm zamanlar ya
 * da bu ay. İlk üç kürsüde, altta sabit "senin durumun" kartı (sıra, XP, seviye). İlk girişte adım adım tanıtım
 * açılır; sağ üstteki ⓘ ile tekrar. Yeni kullanıcıya "Seni kim davet etti?", herkese davet kartı (+100 XP).
 */
export default function LeaderboardScreen() {
  // `okul`: belirli bir okulun ligi (profildeki okul rozetinden gelinir); `vurgula`: satırı vurgulanacak kişi
  const { vurgula, okul } = useLocalSearchParams<{ vurgula?: string; okul?: string }>();
  const { profile, userId, actions } = useAppStore();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const intro = useLeaderboardIntro();
  const me = userId ?? '';
  const school = schoolById(okul ?? profile?.schoolId);
  const [scope, setScope] = useState<LeaderboardScope>(okul ? 'school' : 'all');
  const [period, setPeriod] = useState<LeaderboardPeriod>('all');
  const board = useLeaderboard(scope, period, school?.id);
  const entries = useMemo(() => board.data ?? [], [board.data]);

  const scopes: { key: LeaderboardScope; label: string }[] = [
    { key: 'all', label: t('leaderboard.overall') },
    { key: 'school', label: school?.short ?? t('leaderboard.mySchool') },
    { key: 'friends', label: t('leaderboard.friends') },
  ];

  const highlight = vurgula ?? me;
  const mine = entries.find((e) => e.userId === me);
  const ranked = entries.filter((e) => e.xp > 0);
  const podium = ranked.filter((e) => e.rank <= 3).slice(0, 3);
  const rest = entries.filter((e) => !podium.includes(e) && (e.xp > 0 || e.userId === me));
  const noSchool = scope === 'school' && !school;

  // Ekran açıldığı an (render'da Date.now çağrılmasın)
  const [openedAt] = useState(Date.now);
  const askInviter = profile && !profile.hasInviter && openedAt - +new Date(profile.joinedAt) < INVITER_DAYS * 86_400_000;

  const enterInviter = () =>
    showPrompt({
      title: t('leaderboard.inviterTitle'),
      message: t('leaderboard.inviterPrompt'),
      submitLabel: t('leaderboard.add'),
      onSubmit: async (value) => {
        try {
          const inviter = await setInviter(value);
          haptics.success();
          showAlert(t('leaderboard.inviterTitle'), t('leaderboard.inviterDone', { name: inviter.name }));
          actions.refresh();
          queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
        } catch (error) {
          showError(error);
        }
      },
    });

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title:
            scope === 'school' && school ? t('leaderboard.schoolTitle', { school: schoolLabel(school) }) : t('leaderboard.title'),
          headerRight: () => (
            <PressableScale onPress={() => intro.open(0)} hitSlop={hitSlop} accessibilityLabel={t('leaderboard.howItWorks')}>
              <SymbolView name="info.circle" tintColor={colors.primary} size={22} />
            </PressableScale>
          ),
        }}
      />
      <FlatList
        data={noSchool ? [] : rest}
        keyExtractor={(e) => e.userId}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
        ItemSeparatorComponent={() => <Divider inset={spacing.lg + 28 + 40 + spacing.md * 2} />}
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
              {period === 'month' && (
                <Text variant="caption" color={colors.textSecondary} style={styles.flex} numberOfLines={2}>
                  {t('leaderboard.monthResets')}
                </Text>
              )}
            </View>

            {noSchool ? (
              <InfoCard icon="graduationcap.fill" text={t('leaderboard.noSchool')}>
                <Button title={t('leaderboard.addMySchool')} size="sm" onPress={() => router.push('/okul-sec')} />
              </InfoCard>
            ) : scope === 'school' && school && !mine ? (
              <InfoCard icon="graduationcap.fill" text={t('leaderboard.notMember', { school: school.name })}>
                <Button title={t('leaderboard.addMySchool')} size="sm" onPress={() => router.push('/okul-sec')} />
              </InfoCard>
            ) : null}

            {!noSchool && podium.length > 0 && <Podium entries={podium} me={me} />}

            {askInviter && (
              <InfoCard icon="person.crop.circle.badge.questionmark" title={t('leaderboard.inviterTitle')} text={t('leaderboard.inviterText')}>
                <Button title={t('leaderboard.add')} size="sm" variant="outline" onPress={enterInviter} />
              </InfoCard>
            )}
          </View>
        }
        ListEmptyComponent={
          noSchool ? null : board.isPending ? (
            <UserRowsSkeleton rank action={false} count={8} />
          ) : board.isError ? (
            <ErrorView onRetry={() => board.refetch()} />
          ) : podium.length ? null : (
            <Text variant="subhead" color={colors.textSecondary} align="center" style={styles.empty}>
              {scope === 'friends' ? t('leaderboard.emptyFriends') : t('leaderboard.empty')}
            </Text>
          )
        }
        renderItem={({ item }) => (
          <LeaderboardRow entry={item} highlighted={item.userId === highlight} isMe={item.userId === me} />
        )}
        ListFooterComponent={
          noSchool ? null : (
            <InfoCard icon="person.2.fill" title={t('leaderboard.inviteTitle')} text={t('leaderboard.inviteText')}>
              <Button
                title="+100 XP"
                icon="square.and.arrow.up"
                size="sm"
                onPress={() => shareInvite({ username: profile?.username })}
              />
            </InfoCard>
          )
        }
      />

      {/* Senin durumun: her zaman altta, dokununca XP kuralları */}
      {!noSchool && mine && (
        <Animated.View entering={FadeInDown.springify()} style={[styles.myWrap, { bottom: insets.bottom + spacing.sm }]}>
          <PressableScale onPress={() => intro.open(1)} scaleTo={0.98}>
            <GlassSurface interactive style={styles.myCard}>
              <MyStatus mine={mine} entries={entries} />
            </GlassSurface>
          </PressableScale>
        </Animated.View>
      )}

      <LeaderboardIntro visible={intro.visible} startAt={intro.startAt} onClose={intro.close} />
    </View>
  );
}

/** İlk üç: ortada birinci (taçlı, büyük), solda ikinci, sağda üçüncü */
function Podium({ entries, me }: { entries: LeaderboardEntry[]; me: string }) {
  const order = [entries[1], entries[0], entries[2]];
  return (
    <View style={styles.podium}>
      {order.map((entry, i) =>
        entry ? <PodiumSpot key={entry.userId} entry={entry} first={i === 1} isMe={entry.userId === me} /> : <View key={i} style={styles.flex} />,
      )}
    </View>
  );
}

function PodiumSpot({ entry, first, isMe }: { entry: LeaderboardEntry; first: boolean; isMe: boolean }) {
  const user = useUser(entry.userId);
  const medal = MEDALS[Math.min(entry.rank, 3) - 1]!;
  const size = first ? 76 : 60;
  if (!user) return <View style={styles.flex} />;
  return (
    <PressableScale onPress={() => openUserProfile(entry.userId)} scaleTo={0.96} style={[styles.spot, first && styles.spotFirst]}>
      {first && <SymbolView name="crown.fill" tintColor={medal} size={24} />}
      <View style={[styles.spotAvatar, { borderColor: medal, borderRadius: size }]}>
        <Avatar uri={user.avatarUrl} name={user.name} size={size} />
        <View style={[styles.medal, { backgroundColor: medal }]}>
          <Text variant="caption" color="#FFFFFF" style={styles.medalText}>
            {entry.rank}
          </Text>
        </View>
      </View>
      <Text variant="subhead" style={styles.bold} numberOfLines={1} align="center">
        {isMe ? `${user.name.split(' ')[0]} ✦` : user.name.split(' ')[0]}
      </Text>
      <Text variant="footnote" color={colors.primary} style={[styles.bold, styles.tabular]}>
        {formatXp(entry.xp)} XP
      </Text>
    </PressableScale>
  );
}

function LeaderboardRow({ entry, highlighted, isMe }: { entry: LeaderboardEntry; highlighted: boolean; isMe: boolean }) {
  const { t } = useTranslation();
  const user = useUser(entry.userId);
  if (!user) return null;
  const { level } = levelOf(entry.xp);
  return (
    <PressableScale
      scaleTo={0.98}
      onPress={() => openUserProfile(entry.userId)}
      style={[styles.row, highlighted && styles.rowHighlight]}>
      <Text variant="subhead" color={entry.xp > 0 ? colors.primary : colors.textTertiary} style={[styles.rank, styles.bold]}>
        {entry.rank}
      </Text>
      <Avatar uri={user.avatarUrl} name={user.name} size={40} />
      <View style={styles.flex}>
        <Text variant="headline" numberOfLines={1}>
          {isMe ? t('leaderboard.you', { name: user.name }) : user.name}
        </Text>
        <Text variant="caption" color={colors.textSecondary}>
          {t(`leaderboard.levels.${level.key}`)}
        </Text>
      </View>
      <Text variant="headline" color={colors.primary} style={styles.tabular}>
        {formatXp(entry.xp)}
        <Text variant="caption" color={colors.textSecondary}>
          {' XP'}
        </Text>
      </Text>
    </PressableScale>
  );
}

/** Altta sabit kart: sıra, XP, seviye ve bir sonrakine ilerleme; bir üstü geçmek için gereken XP */
function MyStatus({ mine, entries }: { mine: LeaderboardEntry; entries: LeaderboardEntry[] }) {
  const { t } = useTranslation();
  const { level, next, progress } = levelOf(mine.xp);
  const above = [...entries].reverse().find((e) => e.rank < mine.rank && e.xp > mine.xp);
  const hint =
    mine.xp === 0
      ? t('leaderboard.firstStep')
      : above
        ? t('leaderboard.toClimb', { count: above.xp - mine.xp + 1, rank: above.rank })
        : t('leaderboard.top');
  return (
    <View style={styles.myInner}>
      <View style={styles.myRank}>
        <Text variant="headline" color={colors.onPrimary} style={styles.tabular}>
          {mine.xp > 0 ? `#${mine.rank}` : '–'}
        </Text>
      </View>
      <View style={[styles.flex, { gap: 4 }]}>
        <Text variant="headline" numberOfLines={1}>
          {formatXp(mine.xp)} XP · {t(`leaderboard.levels.${level.key}`)}
        </Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.max(progress * 100, 3)}%` }]} />
        </View>
        <Text variant="caption" color={colors.textSecondary} numberOfLines={1}>
          {hint}
          {next ? ` · ${t('leaderboard.nextLevel', { count: next.min - mine.xp, level: t(`leaderboard.levels.${next.key}`) })}` : ''}
        </Text>
      </View>
      <SymbolView name="chevron.right" tintColor={colors.textTertiary} size={13} weight="semibold" />
    </View>
  );
}

function InfoCard({
  icon,
  title,
  text,
  children,
}: {
  icon: React.ComponentProps<typeof SymbolView>['name'];
  title?: string;
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.info}>
      <View style={styles.infoIcon}>
        <SymbolView name={icon} tintColor={colors.primary} size={18} />
      </View>
      <View style={[styles.flex, { gap: 2 }]}>
        {title && (
          <Text variant="subhead" style={styles.bold}>
            {title}
          </Text>
        )}
        <Text variant="footnote" color={colors.textSecondary}>
          {text}
        </Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  bold: {
    fontWeight: '600',
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  segment: {
    paddingTop: spacing.sm,
  },
  periods: {
    flexDirection: 'row',
    alignItems: 'center',
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
  podium: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  spot: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  spotFirst: {
    paddingBottom: spacing.lg,
  },
  spotAvatar: {
    borderWidth: 3,
    padding: 2,
  },
  medal: {
    position: 'absolute',
    bottom: -6,
    alignSelf: 'center',
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  medalText: {
    fontWeight: '800',
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
    width: 28,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  empty: {
    padding: spacing.xl,
  },
  info: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  myWrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
  },
  myCard: {
    padding: spacing.md,
  },
  myInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  myRank: {
    minWidth: 48,
    height: 48,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
});
