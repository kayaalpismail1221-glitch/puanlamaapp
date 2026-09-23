import { router, Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo } from 'react';
import { Alert, ScrollView, Share, StyleSheet, View } from 'react-native';

import { PostGrid } from '@/components/post-grid';
import {
  BadgeStrip,
  GoalCard,
  MenuRow,
  ProfileIdentity,
  StatCard,
  TasteCard,
  TopThree,
} from '@/components/profile-parts';
import { ProfileStats } from '@/components/profile-stats';
import { Button, Divider, PressableScale, Text } from '@/components/ui';
import { colors, hitSlop, spacing } from '@/constants/theme';
import { placeById } from '@/data/mock';
import { useLeaderboard } from '@/hooks/use-leaderboard';
import { computeBadges, tasteProfile, type ScoredPlace } from '@/lib/insights';
import { placesThisYear, weeklyStreak } from '@/lib/stats';
import { useAppStore } from '@/store/app-store';
import { ME } from '@/types';

/** Kişisel öneriler bu kadar puanlamadan sonra açılır */
const RECS_UNLOCK = 10;

export default function ProfileScreen() {
  const { profile, joinedAt, rankings, scored, saved, posts, yearGoal, dispatch } = useAppStore();
  const leaderboard = useLeaderboard('all', 'all');

  const myPosts = useMemo(() => posts.filter((p) => p.userId === ME), [posts]);
  const myPlaces = useMemo<ScoredPlace[]>(
    () => scored.flatMap((e) => (placeById(e.placeId) ? [{ place: placeById(e.placeId)!, score: e.score }] : [])),
    [scored],
  );
  const allEntries = useMemo(() => Object.values(rankings).flat(), [rankings]);

  const myRank = leaderboard.find((e) => e.userId === ME);
  const streak = weeklyStreak([...allEntries.map((e) => e.ratedAt), ...myPosts.map((p) => p.createdAt)]);
  const taste = useMemo(() => tasteProfile(myPlaces), [myPlaces]);
  const badges = useMemo(
    () => computeBadges({ places: myPlaces, postCount: myPosts.length, streakWeeks: streak }),
    [myPlaces, myPosts.length, streak],
  );
  const recsLocked = scored.length < RECS_UNLOCK;

  const shareProfile = () =>
    Share.share({ message: `Puanla’da beni takip et: @${profile?.username} 🍽️ Gittiğim her yeri puanlıyorum.` });

  return (
    <>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <View style={styles.headerActions}>
              <PressableScale onPress={shareProfile} hitSlop={hitSlop} accessibilityLabel="Profili paylaş">
                <SymbolView name="square.and.arrow.up" tintColor={colors.primary} size={21} />
              </PressableScale>
              <PressableScale onPress={() => router.push('/ayarlar')} hitSlop={hitSlop} accessibilityLabel="Ayarlar">
                <SymbolView name="gearshape" tintColor={colors.primary} size={22} />
              </PressableScale>
            </View>
          ),
        }}
      />
      <ScrollView style={styles.container} contentInsetAdjustmentBehavior="automatic">
        <ProfileIdentity
          name={profile?.name ?? '?'}
          username={profile?.username ?? ''}
          avatarUri={profile?.avatarUri}
          joinedAt={joinedAt}
          onAvatarPress={() => router.push('/profil-duzenle')}
        />

        <ProfileStats userId={ME} />

        <View style={styles.buttons}>
          <Button title="Profili düzenle" variant="outline" size="sm" onPress={() => router.push('/profil-duzenle')} style={styles.flex} />
          <Button title="Paylaş" variant="outline" size="sm" onPress={shareProfile} style={styles.flex} />
          <Button title="" icon="person.badge.plus" variant="outline" size="sm" onPress={() => router.push('/arkadas-bul')} style={styles.iconButton} />
        </View>

        <View style={styles.menu}>
          <Divider />
          <MenuRow
            icon="checkmark.circle"
            title="Gittiklerim"
            count={scored.length}
            onPress={() => router.push({ pathname: '/gittiklerim/[id]', params: { id: ME } })}
          />
          <Divider inset={spacing.lg + 26 + spacing.lg} />
          <MenuRow icon="bookmark" title="Listem" count={saved.length} onPress={() => router.navigate('/listem')} />
          <Divider inset={spacing.lg + 26 + spacing.lg} />
          <MenuRow
            icon="sparkles"
            title="Sana özel öneriler"
            subtitle={recsLocked ? `${scored.length}/${RECS_UNLOCK} mekân puanlayınca açılır` : undefined}
            locked={recsLocked}
            onPress={() =>
              Alert.alert(
                'Sana özel öneriler',
                recsLocked
                  ? `${RECS_UNLOCK - scored.length} mekân daha puanla, zevkine göre öneriler açılsın.`
                  : 'Kişisel öneriler çok yakında burada!',
              )
            }
          />
          <Divider />
        </View>

        <TopThree items={myPlaces} title="Top 3’üm" />

        <View style={styles.cards}>
          <StatCard
            icon="trophy"
            title="Sıralama"
            value={myRank && myRank.reviews > 0 ? `#${myRank.rank}` : undefined}
            locked={!myRank || myRank.reviews === 0}
            onPress={() => router.push('/siralama')}
          />
          <StatCard icon="flame" title="Seri" value={`${streak} hafta`} />
        </View>

        <TasteCard slices={taste} title="Damak zevkin" />

        <BadgeStrip badges={badges} />

        <View style={styles.goal}>
          <GoalCard
            goal={yearGoal}
            done={placesThisYear(allEntries)}
            onChange={(goal) => dispatch({ type: 'setYearGoal', goal })}
          />
        </View>

        <View style={styles.postsHeader}>
          <Text variant="title3">Gönderilerim</Text>
          <PressableScale onPress={() => router.push('/gonderi-olustur')} hitSlop={hitSlop} style={styles.newPost}>
            <SymbolView name="plus" tintColor={colors.primary} size={14} weight="bold" />
            <Text variant="subhead" color={colors.primary} style={styles.bold}>
              Yeni
            </Text>
          </PressableScale>
        </View>
        <PostGrid posts={myPosts} emptyText="Henüz gönderi paylaşmadın. Gittiğin bir mekânı paylaş!" />
        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  flex: {
    flex: 1,
  },
  iconButton: {
    width: 44,
    paddingHorizontal: 0,
    gap: 0,
  },
  menu: {
    marginTop: spacing.xl,
  },
  cards: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  goal: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  postsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.md,
  },
  newPost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  bold: {
    fontWeight: '600',
  },
});
