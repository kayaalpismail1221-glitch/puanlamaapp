import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlashList } from '@shopify/flash-list';
import { ActivityIndicator, Linking, RefreshControl, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { PostCard } from '@/components/post-card';
import { SegmentedControl } from '@/components/segmented-control';
import type { FeedEntry } from '@/api/content';
import { PostCardsSkeleton } from '@/components/skeleton';
import { Avatar, Button, Divider, ErrorView, PressableScale, Text } from '@/components/ui';
import { colors, hitSlop, radius, spacing } from '@/constants/theme';
import { useFollowingFeed, usePopularFeed, useUnreadNotifications } from '@/hooks/queries';
import { areaLabel } from '@/lib/feed';
import { useUserLocation } from '@/lib/location';
import { useAppSelector } from '@/store/app-store';
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
  // Yalnızca kullanılan alanlar: bir beğeni feed ekranını ve başlığını yeniden çizdirmez
  const profile = useAppSelector((s) => s.profile);
  const feedArea = useAppSelector((s) => s.feedArea);
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
  const entries = useMemo<FeedEntry[]>(() => {
    const list =
      tab === 'popular'
        ? (popular.data?.pages.flatMap((p) => p.entries) ?? [])
        : (followingFeed.data?.pages.flat().map((post) => ({ post })) ?? []);
    // Sayfalar arasında aynı gönderi iki kez gelirse (ör. beğeniyle sırası değişti) bir kez gösterilir
    const seen = new Set<string>();
    return list.filter((e) => !seen.has(e.post.id) && !!seen.add(e.post.id));
  }, [tab, popular.data, followingFeed.data]);

  // Yakınımda modunda konum henüz gelmedi
  const locationPending = tab === 'popular' && feedArea.type === 'near' && !location.coords && !locationUnavailable;
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    await active.restart().catch(() => {});
    setRefreshing(false);
  };

  return (
    <>
      <Stack.Screen
        options={{
          // Gönderi paylaşma feed'in üstündeki satırdan; başlıkta yalnızca bildirimler
          headerRight: () => <NotificationBell />,
        }}
      />
      <FlashList
        data={entries}
        keyExtractor={(e) => e.post.id}
        // Fotoğraflı ve fotoğrafsız kartlar ayrı havuzlarda geri dönüştürülür
        getItemType={(e) => (e.post.photos.length ? 'photo' : 'tile')}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
        onEndReached={() => active.hasNextPage && !active.isFetchingNextPage && active.fetchNextPage()}
        // Sonraki sayfa, sona bir ekran kala istenir: kaydırma hiç beklemez
        onEndReachedThreshold={1}
        ListFooterComponent={
          active.isFetchingNextPage ? <ActivityIndicator color={colors.primary} style={styles.more} /> : null
        }
        renderItem={({ item }) => <PostCard post={item.post} distanceKm={item.distanceKm} />}
        ItemSeparatorComponent={Separator}
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
                  <Icon
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
                    <Icon name="chevron.down" tintColor={colors.primary} size={12} weight="bold" />
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
                  <Icon name="camera" tintColor={colors.primary} size={20} />
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

const Separator = () => <Divider />;

/** Bildirim merkezine giden zil; okunmamış varsa sayı rozeti */
function NotificationBell() {
  const { t } = useTranslation();
  const unread = useUnreadNotifications().data ?? 0;
  return (
    <PressableScale
      onPress={() => router.push('/bildirimler')}
      hitSlop={hitSlop}
      // Rozet bu kutunun içinde kalır: iOS başlık çubuğu öğenin dışına taşanı keser
      style={styles.bell}
      accessibilityLabel={unread ? t('notifications.bellUnread', { count: unread }) : t('screens.notifications')}>
      <Icon name="bell" tintColor={colors.primary} size={21} />
      {unread > 0 && (
        <View style={styles.bellBadge}>
          <Text variant="caption" color={colors.onPrimary} style={styles.bellBadgeText}>
            {unread > 9 ? '9+' : unread}
          </Text>
        </View>
      )}
    </PressableScale>
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
      <Icon name="location.fill" tintColor={colors.primary} size={16} />
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
      <Icon name={icon} tintColor={colors.textTertiary} size={44} />
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
  bell: {
    width: 36,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.like,
    borderWidth: 1.5,
    borderColor: colors.background,
  },
  bellBadgeText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
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
