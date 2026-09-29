import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from '@/components/symbol';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { FavoritePlaces } from '@/components/favorite-places';
import { ProfileLists } from '@/components/list-card';
import { PostGrid } from '@/components/post-grid';
import { MenuRow, ProfileIdentity, RankStreakCards, SchoolChip } from '@/components/profile-parts';
import { ProfileStats } from '@/components/profile-stats';
import { PostGridSkeleton, ProfileSkeleton } from '@/components/skeleton';
import { Button, Divider, ErrorView, PressableScale, Text } from '@/components/ui';
import { TasteMatchRow } from '@/components/taste-match';
import { FollowButton } from '@/components/user-row';
import { VisitedMap } from '@/components/visited-map';
import { colors, hitSlop, radius, spacing } from '@/constants/theme';
import { useUserPosts, useUserProfile, useUserRankings } from '@/hooks/queries';
import { confirmBlock, openReportMenu, showMenu } from '@/lib/moderation';
import { queryClient } from '@/lib/query-client';
import { shareProfile } from '@/lib/share';
import { isMe } from '@/lib/session';
import { weeklyStreak } from '@/lib/stats';
import { useAppStore } from '@/store/app-store';

/** Başka bir kullanıcının profili */
export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { actions } = useAppStore();
  const profile = useUserProfile(id);
  const postsQuery = useUserPosts(id);
  const rankings = useUserRankings(id);

  const userPosts = useMemo(() => postsQuery.data ?? [], [postsQuery.data]);
  const streak = weeklyStreak([...userPosts.map((p) => p.createdAt), ...(rankings.data ?? []).map((r) => r.ratedAt)]);

  const user = profile.data;
  if (!user) {
    if (profile.isPending) return <ProfileSkeleton />;
    if (profile.isError) return <ErrorView onRetry={() => profile.refetch()} style={styles.container} />;
    return (
      <View style={[styles.container, styles.center]}>
        <Text>{t('user.notFound')}</Text>
      </View>
    );
  }
  const followsYou = user.followsMe;

  const share = () => shareProfile(user);

  // Kullanıcı içeriği güvenliği: profilden şikâyet ve engelleme
  const openMenu = () =>
    showMenu(undefined, [
      { icon: 'square.and.arrow.up', label: t('common.share'), onPress: share },
      { icon: 'exclamationmark.bubble', label: t('moderation.reportUser'), destructive: true, onPress: () => openReportMenu({ userId: user.id }) },
      {
        icon: 'hand.raised', label: t('moderation.blockUser', { name: user.name.split(' ')[0] }),
        destructive: true,
        onPress: () =>
          confirmBlock(user, () => {
            queryClient.invalidateQueries();
            actions.refresh();
            router.back();
          }),
      },
    ]);

  return (
    <>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () =>
            isMe(user.id) ? null : (
              <PressableScale onPress={openMenu} hitSlop={hitSlop} accessibilityLabel={t('moderation.options')}>
                <SymbolView name="ellipsis.circle" tintColor={colors.text} size={22} />
              </PressableScale>
            ),
        }}
      />
      <ScrollView style={styles.container} contentInsetAdjustmentBehavior="automatic">
        <ProfileIdentity
          name={user.name}
          username={user.username}
          avatarUri={user.avatarUrl}
          onAvatarPress={
            user.avatarUrl
              ? () => router.push({ pathname: '/profil-fotografi', params: { uri: user.avatarUrl!, name: user.name } })
              : undefined
          }
        />
        <SchoolChip userId={user.id} schoolId={user.schoolId} />
        {followsYou && (
          <View style={styles.followsYou}>
            <Text variant="caption" color={colors.textSecondary}>
              {t('user.followsYou')}
            </Text>
          </View>
        )}

        <ProfileStats userId={user.id} />

        <View style={styles.buttons}>
          <View style={styles.flex}>
            <FollowButton userId={user.id} large />
          </View>
          <Button title={t('common.share')} variant="outline" size="sm" onPress={share} style={styles.share} />
        </View>

        <View style={styles.menu}>
          <Divider />
          {!isMe(user.id) && (
            <>
              <TasteMatchRow userId={user.id} />
              <Divider inset={spacing.lg + 44 + spacing.md} />
            </>
          )}
          <MenuRow
            icon="checkmark.circle"
            title={t('user.beenTo')}
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

        <FavoritePlaces userId={user.id} name={user.name} mine={isMe(user.id)} />

        <RankStreakCards userId={user.id} streak={streak} />

        <ProfileLists userId={user.id} name={user.name} mine={isMe(user.id)} />

        <VisitedMap userId={user.id} name={user.name} />

        <Text variant="title3" style={styles.postsTitle}>
          {t('user.posts')}
        </Text>
        {postsQuery.isPending ? <PostGridSkeleton count={6} /> : <PostGrid posts={userPosts} emptyText={t('user.noPosts')} />}
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
  postsTitle: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.md,
  },
});
