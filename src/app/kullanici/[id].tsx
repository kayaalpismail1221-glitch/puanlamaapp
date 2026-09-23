import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo } from 'react';
import { ScrollView, Share, StyleSheet, View } from 'react-native';

import { PostGrid } from '@/components/post-grid';
import { MenuRow, ProfileIdentity, StatCard } from '@/components/profile-parts';
import { ProfileStats } from '@/components/profile-stats';
import { Button, Divider, PressableScale, Text } from '@/components/ui';
import { FollowButton } from '@/components/user-row';
import { colors, hitSlop, radius, spacing } from '@/constants/theme';
import { useLeaderboard } from '@/hooks/use-leaderboard';
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
        <Text variant="title2" align="center" style={styles.name}>
          {user.name}
        </Text>
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
  name: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
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
