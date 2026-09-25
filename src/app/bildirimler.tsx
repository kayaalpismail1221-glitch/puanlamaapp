import { router, Stack, useFocusEffect } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Image } from 'expo-image';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, RefreshControl, SectionList, StyleSheet, View } from 'react-native';

import { markAllRead } from '@/api/notifications';
import { UserRowsSkeleton } from '@/components/skeleton';
import { Avatar, Button, Divider, ErrorView, PressableScale, ScoreBadge, Text } from '@/components/ui';
import { FollowButton } from '@/components/user-row';
import { colors, hitSlop, radius, spacing } from '@/constants/theme';
import { useNotifications } from '@/hooks/queries';
import { formatScore, timeAgo } from '@/lib/format';
import { clearBadge, enablePush, pushPermission, type PushPermission } from '@/lib/notifications';
import { openUserProfile } from '@/lib/navigation';
import { keys, queryClient } from '@/lib/query-client';
import type { AppNotification } from '@/types';

type Section = { key: 'today' | 'week' | 'earlier'; data: AppNotification[] };

const DAY = 24 * 3600_000;

/** Bugün / Bu hafta / Daha önce */
function sectionsOf(list: AppNotification[]): Section[] {
  const startOfDay = new Date().setHours(0, 0, 0, 0);
  const groups: Record<Section['key'], AppNotification[]> = { today: [], week: [], earlier: [] };
  for (const n of list) {
    const at = +new Date(n.createdAt);
    groups[at >= startOfDay ? 'today' : at >= startOfDay - 6 * DAY ? 'week' : 'earlier'].push(n);
  }
  return (['today', 'week', 'earlier'] as const).flatMap((key) => (groups[key].length ? [{ key, data: groups[key] }] : []));
}

function openTarget(n: AppNotification) {
  if (n.kind === 'follow') openUserProfile(n.actor.id);
  else if (n.kind === 'friend_rated' && n.placeId) router.push({ pathname: '/mekan/[id]', params: { id: n.placeId } });
  else if (n.postId) router.push({ pathname: '/gonderi/[id]', params: { id: n.postId } });
}

/**
 * Bildirim merkezi: beğeni, yorum, etiket, takip ve "arkadaşın gittiğin yeri puanladı".
 * Açılınca hepsi okundu sayılır; okunmamışlar bu ziyaret boyunca vurgulu kalır.
 */
export default function NotificationsScreen() {
  const { t } = useTranslation();
  const query = useNotifications();
  const [refreshing, setRefreshing] = useState(false);
  const [permission, setPermission] = useState<PushPermission>('granted');

  const list = useMemo(() => query.data?.pages.flat() ?? [], [query.data]);
  const sections = useMemo(() => sectionsOf(list), [list]);

  useFocusEffect(
    useCallback(() => {
      pushPermission().then(setPermission);
      clearBadge();
      markAllRead()
        .then(() => queryClient.invalidateQueries({ queryKey: keys.unreadNotifications() }))
        .catch(() => {});
    }, []),
  );

  const refresh = async () => {
    setRefreshing(true);
    await query.refetch();
    setRefreshing(false);
  };

  const turnOn = async () => {
    await enablePush().catch(() => false);
    setPermission(await pushPermission());
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <PressableScale
              onPress={() => router.push('/bildirim-ayarlari')}
              hitSlop={hitSlop}
              accessibilityLabel={t('screens.notificationSettings')}>
              <SymbolView name="gearshape" tintColor={colors.primary} size={21} />
            </PressableScale>
          ),
        }}
      />
      <SectionList
        style={styles.container}
        sections={sections}
        keyExtractor={(n) => n.id}
        contentInsetAdjustmentBehavior="automatic"
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
        onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          permission === 'denied' || permission === 'undetermined' ? <PushBanner onPress={turnOn} /> : null
        }
        renderSectionHeader={({ section }) => (
          <Text variant="headline" style={styles.sectionTitle}>
            {t(`notifications.sections.${section.key}`)}
          </Text>
        )}
        renderItem={({ item }) => <NotificationRow item={item} />}
        ItemSeparatorComponent={() => <Divider inset={spacing.lg + 44 + spacing.md} />}
        ListFooterComponent={
          query.isFetchingNextPage ? <ActivityIndicator color={colors.primary} style={styles.more} /> : null
        }
        ListEmptyComponent={
          query.isPending ? (
            <UserRowsSkeleton />
          ) : query.isError ? (
            <ErrorView onRetry={() => query.refetch()} />
          ) : (
            <View style={styles.empty}>
              <SymbolView name="bell" tintColor={colors.textTertiary} size={40} />
              <Text variant="headline" align="center">
                {t('notifications.emptyTitle')}
              </Text>
              <Text variant="subhead" color={colors.textSecondary} align="center">
                {t('notifications.emptyText')}
              </Text>
              <Button
                title={t('screens.findFriends')}
                variant="outline"
                size="sm"
                onPress={() => router.push('/arkadas-bul')}
                style={styles.emptyButton}
              />
            </View>
          )
        }
      />
    </>
  );
}

const ICONS: Record<AppNotification['kind'], SFSymbol> = {
  like: 'heart.fill',
  comment: 'bubble.left.fill',
  tag: 'person.2.fill',
  follow: 'person.fill.badge.plus',
  friend_rated: 'fork.knife',
};

function NotificationRow({ item }: { item: AppNotification }) {
  const { t } = useTranslation();
  const text =
    item.kind === 'like'
      ? t('notifications.like', { place: item.placeName })
      : item.kind === 'comment'
        ? t('notifications.comment', { comment: item.comment ?? '' })
        : item.kind === 'tag'
          ? t('notifications.tag', { place: item.placeName })
          : item.kind === 'follow'
            ? t('notifications.follow')
            : item.myScore !== undefined && item.score !== undefined
              ? t('notifications.friendRated', {
                  place: item.placeName,
                  score: formatScore(item.score),
                  mine: formatScore(item.myScore),
                })
              : t('notifications.friendRatedNoScore', { place: item.placeName });

  return (
    <PressableScale
      onPress={() => openTarget(item)}
      scaleTo={0.99}
      style={[styles.row, !item.read && styles.unread]}
      accessibilityRole="button">
      <PressableScale onPress={() => openUserProfile(item.actor.id)} haptic={false}>
        <Avatar uri={item.actor.avatarUrl} name={item.actor.name} size={44} />
        <View style={[styles.kind, item.kind === 'like' && styles.kindLike]}>
          <SymbolView name={ICONS[item.kind]} tintColor={colors.onPrimary} size={10} />
        </View>
      </PressableScale>

      <View style={styles.body}>
        <Text variant="subhead" numberOfLines={3}>
          <Text variant="subhead" style={styles.bold}>
            {item.actor.name}
          </Text>{' '}
          {text}{' '}
          <Text variant="subhead" color={colors.textTertiary}>
            {timeAgo(item.createdAt)}
          </Text>
        </Text>
      </View>

      {item.kind === 'follow' ? (
        !item.following && <FollowButton userId={item.actor.id} />
      ) : item.kind === 'friend_rated' && item.score !== undefined ? (
        <ScoreBadge score={item.score} size="sm" />
      ) : item.thumbUrl ? (
        <Image source={{ uri: item.thumbUrl }} style={styles.thumb} transition={150} />
      ) : null}
    </PressableScale>
  );
}

function PushBanner({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.banner}>
      <SymbolView name="bell.badge.fill" tintColor={colors.primary} size={22} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="subhead" style={styles.bold}>
          {t('notifications.bannerTitle')}
        </Text>
        <Text variant="footnote" color={colors.textSecondary}>
          {t('notifications.bannerText')}
        </Text>
      </View>
      <Button title={t('notifications.turnOn')} size="sm" onPress={onPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  sectionTitle: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  unread: {
    backgroundColor: colors.surface,
  },
  kind: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.background,
  },
  kindLike: {
    backgroundColor: colors.like,
  },
  body: {
    flex: 1,
  },
  bold: {
    fontWeight: '600',
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    margin: spacing.lg,
    marginBottom: 0,
    padding: spacing.lg,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xxl,
    paddingTop: 96,
  },
  emptyButton: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  more: {
    marginVertical: spacing.lg,
  },
});
