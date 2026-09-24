import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo } from 'react';
import { ScrollView, Share, StyleSheet, View } from 'react-native';

import { PostGrid } from '@/components/post-grid';
import { MenuRow, ProfileIdentity, SchoolChip, StatCard, TasteCard, TopThree } from '@/components/profile-parts';
import { ProfileStats } from '@/components/profile-stats';
import { Button, Divider, ErrorView, LoadingView, PressableScale, Text } from '@/components/ui';
import { FollowButton } from '@/components/user-row';
import { colors, hitSlop, radius, spacing } from '@/constants/theme';
import { getPlace, useEntitiesVersion } from '@/data/entities';
import { useUserPosts, useUserProfile, useUserRank, useUserRankings } from '@/hooks/queries';
import { tasteProfile, type ScoredPlace } from '@/lib/insights';
import { weeklyStreak } from '@/lib/stats';

/** Başka bir kullanıcının profili */
export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const profile = useUserProfile(id);
  const postsQuery = useUserPosts(id);
  const rankings = useUserRankings(id);
  const rank = useUserRank(id).data;
  const version = useEntitiesVersion();

  const userPosts = useMemo(() => postsQuery.data ?? [], [postsQuery.data]);
  const beenPlaces = useMemo<ScoredPlace[]>(
    () =>
      (rankings.data ?? []).flatMap((r) => {
        const place = getPlace(r.placeId);
        return place ? [{ place, score: r.score }] : [];
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rankings.data, version],
  );
  const taste = useMemo(() => tasteProfile(beenPlaces), [beenPlaces]);
  const streak = weeklyStreak([...userPosts.map((p) => p.createdAt), ...(rankings.data ?? []).map((r) => r.ratedAt)]);

  const user = profile.data;
  if (!user) {
    if (profile.isPending) return <LoadingView style={styles.container} />;
    if (profile.isError) return <ErrorView onRetry={() => profile.refetch()} style={styles.container} />;
    return (
      <View style={[styles.container, styles.center]}>
        <Text>Kullanıcı bulunamadı.</Text>
      </View>
    );
  }
  const followsYou = user.followsMe;

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
        <SchoolChip userId={user.id} schoolId={user.schoolId} />
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
            count={rankings.data?.length ?? 0}
            onPress={() =>
              router.push({
                pathname: '/gittiklerim/[id]',
                params: { id: user.id },
              })
            }
          />
          <Divider />
        </View>

        <TopThree items={beenPlaces} title={`${user.name.split(' ')[0]} için Top 3`} />

        <View style={styles.cards}>
          <StatCard
            icon="trophy"
            title="Sıralama"
            value={rank ? `#${rank}` : undefined}
            locked={!rank}
            onPress={() =>
              router.push({
                pathname: '/siralama',
                params: { vurgula: user.id },
              })
            }
          />
          <StatCard icon="flame" title="Seri" value={`${streak} hafta`} />
        </View>

        <TasteCard slices={taste} title="Damak zevki" />

        <Text variant="title3" style={styles.postsTitle}>
          Gönderileri
        </Text>
        {postsQuery.isPending ? <LoadingView /> : <PostGrid posts={userPosts} emptyText="Henüz gönderi paylaşmadı." />}
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
