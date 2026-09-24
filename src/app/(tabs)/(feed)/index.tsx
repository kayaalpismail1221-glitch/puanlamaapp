import { router, Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Linking, RefreshControl, StyleSheet, View } from 'react-native';

import { PostCard } from '@/components/post-card';
import { SegmentedControl } from '@/components/segmented-control';
import type { FeedEntry } from '@/api/content';
import { PostCardsSkeleton } from '@/components/skeleton';
import { Avatar, Button, Divider, ErrorView, PressableScale, Text } from '@/components/ui';
import { colors, hitSlop, radius, spacing } from '@/constants/theme';
import { useFollowingFeed, usePopularFeed } from '@/hooks/queries';
import { areaLabel } from '@/lib/feed';
import { useUserLocation } from '@/lib/location';
import { useAppStore } from '@/store/app-store';
import type { FeedArea } from '@/types';

type Tab = 'popular' | 'following';

/** Konum izni yoksa feed boş kalmasın: en çok gönderinin olduğu şehir gösterilir */
const FALLBACK_AREA: FeedArea = { type: 'area', city: 'İstanbul' };

const openComposer = () => router.push('/gonderi-olustur');
const openAreaPicker = () => router.push('/konum-sec');

/**
 * Feed
 * - Popüler: konumunun yakınındaki (ya da seçtiğin şehir/ilçedeki) en popüler gönderiler
 * - Takip: takip ettiklerinin ve kendi gönderilerin, en yeni başta
 */
export default function FeedScreen() {
  const { profile, feedArea } = useAppStore();
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('popular');
  const tabs = [
    { key: 'popular', label: t('feed.popular') },
    { key: 'following', label: t('feed.following') },
  ] as const;

  // Konum yalnızca "Yakınımda" modunda istenir
  const location = useUserLocation(tab === 'popular' && feedArea.type === 'near');
  // Yakınımda seçili ama konum alınamıyor (izin yok ya da hata): yedek şehrin popüler gönderileri
  const locationUnavailable =
    feedArea.type === 'near' && !location.coords && ['denied', 'undetermined', 'error'].includes(location.status);
  const area = locationUnavailable ? FALLBACK_AREA : feedArea;
  const popular = usePopularFeed(area, location.coords, tab === 'popular');
  const followingFeed = useFollowingFeed(tab === 'following');
  const active = tab === 'popular' ? popular : followingFeed;

  const firstPage = popular.data?.pages[0];
  const entries = useMemo<FeedEntry[]>(
    () =>
      tab === 'popular'
        ? (popular.data?.pages.flatMap((p) => p.entries) ?? [])
        : (followingFeed.data?.pages.flat().map((post) => ({ post })) ?? []),
    [tab, popular.data, followingFeed.data],
  );

  // Yakınımda modunda konum henüz gelmedi
  const locationPending = tab === 'popular' && feedArea.type === 'near' && !location.coords && !locationUnavailable;
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    await active.refetch();
    setRefreshing(false);
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <PressableScale onPress={openComposer} hitSlop={hitSlop} accessibilityLabel={t('common.sharePost')}>
              <SymbolView name="plus" tintColor={colors.primary} size={22} weight="semibold" />
            </PressableScale>
          ),
        }}
      />
      <FlatList
        data={entries}
        keyExtractor={(e) => e.post.id}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
        onEndReached={() => active.hasNextPage && !active.isFetchingNextPage && active.fetchNextPage()}
        onEndReachedThreshold={0.6}
        ListFooterComponent={
          active.isFetchingNextPage ? <ActivityIndicator color={colors.primary} style={styles.more} /> : null
        }
        renderItem={({ item }) => <PostCard post={item.post} distanceKm={item.distanceKm} />}
        ItemSeparatorComponent={() => <Divider />}
        ListHeaderComponent={
          <View>
            <SegmentedControl options={tabs} value={tab} onChange={setTab} style={styles.segment} />

            {tab === 'popular' && (
              <PressableScale
                onPress={openAreaPicker}
                scaleTo={0.98}
                style={styles.areaButton}
                accessibilityLabel={t('feed.chooseLocation')}>
                <View style={styles.areaIcon}>
                  <SymbolView
                    name={feedArea.type === 'near' ? 'location.fill' : 'mappin.and.ellipse'}
                    tintColor={colors.onPrimary}
                    size={14}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.areaTitle}>
                    <Text variant="headline" color={colors.primary} numberOfLines={1}>
                      {areaLabel(feedArea)}
                    </Text>
                    <SymbolView name="chevron.down" tintColor={colors.primary} size={12} weight="bold" />
                  </View>
                  <Text variant="caption" color={colors.textSecondary} numberOfLines={1}>
                    {locationPending
                      ? t('feed.locating')
                      : locationUnavailable
                        ? t('feed.locationOff', { city: FALLBACK_AREA.type === 'area' ? FALLBACK_AREA.city : '' })
                        : firstPage?.fallbackCity
                          ? t('feed.fallbackCity', { city: firstPage.fallbackCity })
                          : firstPage?.radiusKm
                            ? t('feed.radius', { km: firstPage.radiusKm })
                            : t('feed.areaPopular')}
                  </Text>
                </View>
                <Text variant="footnote" color={colors.primary} style={styles.bold}>
                  {t('common.change')}
                </Text>
              </PressableScale>
            )}

            {tab === 'popular' && locationUnavailable && (
              <LocationBanner denied={location.status === 'denied'} onRetry={location.retry} />
            )}

            {!locationPending && (
              <>
                <PressableScale onPress={openComposer} scaleTo={0.98} style={styles.composer}>
                  <Avatar uri={profile?.avatarUri} name={profile?.name ?? '?'} size={36} />
                  <Text variant="callout" color={colors.textSecondary} style={{ flex: 1 }}>
                    {t('feed.composer')}
                  </Text>
                  <SymbolView name="camera" tintColor={colors.primary} size={20} />
                </PressableScale>
                <Divider />
              </>
            )}
          </View>
        }
        ListEmptyComponent={
          locationPending || active.isPending ? (
            <PostCardsSkeleton />
          ) : active.isError ? (
            <ErrorView onRetry={() => active.refetch()} />
          ) : tab === 'following' ? (
            <EmptyState
              icon="person.2"
              title={t('feed.followingEmptyTitle')}
              text={t('feed.followingEmptyText')}
              action={t('screens.findFriends')}
              onPress={() => router.push('/arkadas-bul')}
            />
          ) : (
            <EmptyState
              icon="fork.knife"
              title={t('feed.popularEmptyTitle')}
              text={t('feed.popularEmptyText')}
              action={t('feed.pickAnotherPlace')}
              onPress={openAreaPicker}
            />
          )
        }
      />
    </>
  );
}

/** Konum kapalıyken feed'in üstünde küçük öneri: yakındakileri görmek için konumu aç */
function LocationBanner({ denied, onRetry }: { denied: boolean; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <PressableScale
      onPress={denied ? () => Linking.openSettings() : onRetry}
      scaleTo={0.98}
      style={styles.banner}
      accessibilityLabel={t('feed.turnOnLocation')}>
      <SymbolView name="location.fill" tintColor={colors.primary} size={16} />
      <Text variant="footnote" color={colors.text} style={{ flex: 1 }}>
        {t('feed.locationBanner')}
      </Text>
      <Text variant="footnote" color={colors.primary} style={styles.bold}>
        {denied ? t('common.settings') : t('common.open')}
      </Text>
    </PressableScale>
  );
}

function EmptyState({
  icon,
  title,
  text,
  action,
  onPress,
}: {
  icon: 'person.2' | 'fork.knife';
  title: string;
  text: string;
  action: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.empty}>
      <SymbolView name={icon} tintColor={colors.textTertiary} size={44} />
      <Text variant="title3" align="center">
        {title}
      </Text>
      <Text variant="subhead" color={colors.textSecondary} align="center">
        {text}
      </Text>
      <Button title={action} onPress={onPress} style={styles.emptyButton} />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
  },
  more: {
    padding: spacing.xl,
  },
  segment: {
    paddingTop: spacing.xs,
  },
  bold: {
    fontWeight: '600',
  },
  areaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  areaIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  areaTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.md,
    paddingHorizontal: spacing.md,
    height: 52,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  empty: {
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xxl,
  },
  bigIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyButton: {
    alignSelf: 'stretch',
  },
});
