import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo } from 'react';
import { ScrollView, Share, StyleSheet, View } from 'react-native';

import { PostGrid } from '@/components/post-grid';
import { MenuRow, ProfileIdentity, StatCard, TasteCard, TopThree } from '@/components/profile-parts';
import { ProfileStats } from '@/components/profile-stats';
import { Button, Divider, PressableScale, Text } from '@/components/ui';
import { FollowButton } from '@/components/user-row';
import { colors, hitSlop, radius, spacing } from '@/constants/theme';
import { placeById } from '@/data/mock';
import { useLeaderboard } from '@/hooks/use-leaderboard';
import { tasteProfile, type ScoredPlace } from '@/lib/insights';
import { rankedFromPosts, weeklyStreak } from '@/lib/stats';
import { useAppStore } from '@/store/app-store';
import { ME } from '@/types';

/** Başka bir kullanıcının profili */
export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { posts, getUser, followingOf } = useAppStore();
  const leaderboard = useLeaderboard('all', 'all');
  const user = getUser(id);

  const userPosts = useMemo(() => posts.filter((p) => p.userId === id), [posts, id]);
  const been = useMemo(() => rankedFromPosts(posts, id), [posts, id]);
  const beenPlaces = useMemo<ScoredPlace[]>(
    () => been.flatMap((p) => (placeById(p.placeId) ? [{ place: placeById(p.placeId)!, score: p.score! }] : [])),
    [been],
  );
  const taste = useMemo(() => tasteProfile(beenPlaces), [beenPlaces]);
  const rank = leaderboard.find((e) => e.userId === id);
  const streak = weeklyStreak(userPosts.map((p) => p.createdAt));
  const followsYou = followingOf(id).includes(ME);

  if (!user) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text>Kullanıcı bulunamadı.</Text>
      </View>
    );
  }

  const share = () => Share.share({ message: `Puanla’da @${user.username} hesabına göz at 🍽️` });

  return (
    <>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <PressableScale onPress={share} hitSlop={hitSlop} accessibilityLabel="Profili paylaş">
              <SymbolView name="square.and.arrow.up" tintColor={colors.text} size={21} />
            </PressableScale>
          ),
        }}
      />
      <ScrollView style={styles.container} contentInsetAdjustmentBehavior="automatic">
        <ProfileIdentity name={user.name} username={user.username} avatarUri={user.avatarUrl} />
        {followsYou && (
          <View style={styles.followsYou}>
            <Text variant="caption" color={colors.textSecondary}>
              Seni takip ediyor
            </Text>
          </View>
        )}

        <ProfileStats userId={user.id} />

        <View style={styles.buttons}>
          <View style={styles.flex}>
            <FollowButton userId={user.id} large />
          </View>
          <Button title="Paylaş" variant="outline" size="sm" onPress={share} style={styles.share} />
        </View>

        <View style={styles.menu}>
          <Divider />
          <MenuRow
            icon="checkmark.circle"
            title="Gittikleri"
            count={been.length}
            onPress={() => router.push({ pathname: '/gittiklerim/[id]', params: { id: user.id } })}
          />
          <Divider />
        </View>

        <TopThree items={beenPlaces} title={`${user.name.split(' ')[0]} için Top 3`} />

        <View style={styles.cards}>
          <StatCard
            icon="trophy"
            title="Sıralama"
            value={rank && rank.reviews > 0 ? `#${rank.rank}` : undefined}
            locked={!rank || rank.reviews === 0}
            onPress={() => router.push({ pathname: '/siralama', params: { vurgula: user.id } })}
          />
          <StatCard icon="flame" title="Seri" value={`${streak} hafta`} />
        </View>

        <TasteCard slices={taste} title="Damak zevki" />

        <Text variant="title3" style={styles.postsTitle}>
          Gönderileri
        </Text>
        <PostGrid posts={userPosts} emptyText="Henüz gönderi paylaşmadı." />
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
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  followsYou: {
    alignSelf: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
  buttons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  flex: {
    flex: 1,
  },
  share: {
    height: 44,
    paddingHorizontal: spacing.lg,
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
  postsTitle: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.md,
  },
});
