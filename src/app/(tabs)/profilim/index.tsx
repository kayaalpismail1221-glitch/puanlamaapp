import { router, Stack } from 'expo-router';
import { SymbolView } from '@/components/symbol';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { FavoritePlaces } from '@/components/favorite-places';
import { ProfileLists } from '@/components/list-card';
import { VisitedMap } from '@/components/visited-map';
import { PostGrid } from '@/components/post-grid';
import { GoalCard, MenuRow, ProfileIdentity, RankStreakCards, SchoolChip } from '@/components/profile-parts';
import { ProfileStats } from '@/components/profile-stats';
import { PostGridSkeleton } from '@/components/skeleton';
import { Button, Divider, PressableScale, Text } from '@/components/ui';
import { colors, hitSlop, spacing } from '@/constants/theme';
import { useUserPosts } from '@/hooks/queries';
import { showAlert } from '@/lib/dialog';
import { showMenu } from '@/lib/moderation';
import { queryClient } from '@/lib/query-client';
import { shareProfile as shareProfileLink } from '@/lib/share';
import { placesThisYear, weeklyStreak } from '@/lib/stats';
import { useAppStore } from '@/store/app-store';

/** Kişisel öneriler bu kadar puanlamadan sonra açılır (zevkin anlaşılsın diye) */
const RECS_UNLOCK = 10;

export default function ProfileScreen() {
  const { profile, userId, rankings, scored, actions } = useAppStore();
  const { t } = useTranslation();
  const me = userId ?? '';
  const postsQuery = useUserPosts(me);
  const [refreshing, setRefreshing] = useState(false);

  const myPosts = useMemo(() => postsQuery.data ?? [], [postsQuery.data]);
  const allEntries = useMemo(() => Object.values(rankings).flat(), [rankings]);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([actions.refresh(), queryClient.invalidateQueries()]);
    setRefreshing(false);
  };
  const streak = weeklyStreak([...allEntries.map((e) => e.ratedAt), ...myPosts.map((p) => p.createdAt)]);
  const recsLocked = scored.length < RECS_UNLOCK;

  const shareProfile = () =>
    showMenu(undefined, [
      { icon: 'photo.on.rectangle', label: t('me.storyCard'), onPress: () => router.push('/hikaye') },
      { icon: 'square.and.arrow.up', label: t('me.shareLink'), onPress: () => profile && shareProfileLink(profile) },
    ]);

  return (
    <>
      <Stack.Screen
        options={{
          title: '',
          // Paylaşma, profildeki "Paylaş" düğmesinden; başlıkta yalnızca ayarlar
          headerRight: () => (
            <PressableScale onPress={() => router.push('/ayarlar')} hitSlop={hitSlop} accessibilityLabel={t('common.settings')}>
              <SymbolView name="gearshape" tintColor={colors.primary} size={22} />
            </PressableScale>
          ),
        }}
      />
      <ScrollView
        style={styles.container}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}>
        <ProfileIdentity
          name={profile?.name ?? '?'}
          username={profile?.username ?? ''}
          avatarUri={profile?.avatarUri}
          joinedAt={profile?.joinedAt}
          onAvatarPress={() => router.push('/profil-duzenle')}
        />
        <SchoolChip userId={me} schoolId={profile?.schoolId} editable />

        <ProfileStats userId={me} />

        <View style={styles.buttons}>
          <Button
            title={t('me.editProfile')}
            variant="outline"
            size="sm"
            onPress={() => router.push('/profil-duzenle')}
            style={styles.flex}
          />
          <Button title={t('common.share')} variant="outline" size="sm" onPress={shareProfile} style={styles.flex} />
          <Button
            title=""
            icon="person.badge.plus"
            variant="outline"
            size="sm"
            onPress={() => router.push('/arkadas-bul')}
            style={styles.iconButton}
            accessibilityLabel={t('me.findFriends')}
          />
        </View>

        <View style={styles.menu}>
          <Divider />
          <MenuRow
            icon="checkmark.circle"
            title={t('me.beenTo')}
            count={scored.length}
            onPress={() => router.push({ pathname: '/gittiklerim/[id]', params: { id: me } })}
          />
          <Divider inset={spacing.lg + 26 + spacing.lg} />
          <MenuRow
            icon="sparkles"
            title={t('me.recs')}
            subtitle={recsLocked ? t('me.recsLockedHint', { done: scored.length, total: RECS_UNLOCK }) : undefined}
            locked={recsLocked}
            onPress={() =>
              recsLocked
                ? showAlert(t('me.recs'), t('me.recsLockedText', { count: RECS_UNLOCK - scored.length }))
                : router.push('/oneriler')
            }
          />
          <Divider />
        </View>

        <FavoritePlaces userId={me} name={profile?.name ?? ''} mine />

        <RankStreakCards userId={me} streak={streak} />

        <View style={styles.goal}>
          <GoalCard
            goal={profile?.yearGoal}
            done={placesThisYear(allEntries)}
            onChange={(goal) => actions.updateProfile({ yearGoal: goal })}
          />
        </View>

        <ProfileLists userId={me} name={profile?.name ?? ''} mine />

        <VisitedMap userId={me} name={profile?.name ?? ''} />

        <View style={styles.postsHeader}>
          <Text variant="title3">{t('me.myPosts')}</Text>
          <PressableScale onPress={() => router.push('/gonderi-olustur')} hitSlop={hitSlop} style={styles.newPost}>
            <SymbolView name="plus" tintColor={colors.primary} size={14} weight="bold" />
            <Text variant="subhead" color={colors.primary} style={styles.bold}>
              {t('me.newPost')}
            </Text>
          </PressableScale>
        </View>
        {postsQuery.isPending ? <PostGridSkeleton /> : <PostGrid posts={myPosts} emptyText={t('me.noPosts')} />}
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
  goal: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
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
