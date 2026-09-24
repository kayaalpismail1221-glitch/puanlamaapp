import { router, Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, RefreshControl, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { PostCard } from '@/components/post-card';
import { SegmentedControl } from '@/components/segmented-control';
import type { FeedEntry } from '@/api/content';
import { Avatar, Button, Divider, ErrorView, PressableScale, Text } from '@/components/ui';
import { colors, hitSlop, radius, spacing } from '@/constants/theme';
import { useFollowingFeed, usePopularFeed } from '@/hooks/queries';
import { areaLabel } from '@/lib/feed';
import { useUserLocation } from '@/lib/location';
import { useAppStore } from '@/store/app-store';

type Tab = 'popular' | 'following';

const TABS = [
  { key: 'popular', label: 'Popüler' },
  { key: 'following', label: 'Takip' },
] as const;

const openComposer = () => router.push('/gonderi-olustur');
const openAreaPicker = () => router.push('/konum-sec');

/**
 * Feed
 * - Popüler: konumunun yakınındaki (ya da seçtiğin şehir/ilçedeki) en popüler gönderiler
 * - Takip: takip ettiklerinin ve kendi gönderilerin, en yeni başta
 */
export default function FeedScreen() {
  const { profile, feedArea } = useAppStore();
  const [tab, setTab] = useState<Tab>('popular');

  // Konum yalnızca "Yakınımda" modunda istenir
  const location = useUserLocation(tab === 'popular' && feedArea.type === 'near');
  const popular = usePopularFeed(feedArea, location.coords, tab === 'popular');
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

  // Yakınımda modunda konum bekleniyor ya da izin yok
  const locationBlocked = tab === 'popular' && feedArea.type === 'near' && !location.coords;
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
            <PressableScale onPress={openComposer} hitSlop={hitSlop} accessibilityLabel="Gönderi paylaş">
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
            <SegmentedControl options={TABS} value={tab} onChange={setTab} style={styles.segment} />

            {tab === 'popular' && (
              <PressableScale onPress={openAreaPicker} scaleTo={0.98} style={styles.areaButton} accessibilityLabel="Konum seç">
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
                    {locationBlocked
                      ? 'Konumun alınıyor…'
                      : firstPage?.fallbackCity
                        ? `Yakınında gönderi yok · ${firstPage.fallbackCity} gösteriliyor`
                        : firstPage?.radiusKm
                          ? `${firstPage.radiusKm} km çevrendeki popüler gönderiler`
                          : 'Bu bölgedeki popüler gönderiler'}
                  </Text>
                </View>
                <Text variant="footnote" color={colors.primary} style={styles.bold}>
                  Değiştir
                </Text>
              </PressableScale>
            )}

            {!locationBlocked && (
              <>
                <PressableScale onPress={openComposer} scaleTo={0.98} style={styles.composer}>
                  <Avatar uri={profile?.avatarUri} name={profile?.name ?? '?'} size={36} />
                  <Text variant="callout" color={colors.textSecondary} style={{ flex: 1 }}>
                    Nerede yedin? Paylaş…
                  </Text>
                  <SymbolView name="camera" tintColor={colors.primary} size={20} />
                </PressableScale>
                <Divider />
              </>
            )}
          </View>
        }
        ListEmptyComponent={
          locationBlocked ? (
            <LocationPrompt status={location.status} onRetry={location.retry} />
          ) : active.isPending ? (
            <ActivityIndicator color={colors.primary} style={styles.more} />
          ) : active.isError ? (
            <ErrorView onRetry={() => active.refetch()} />
          ) : tab === 'following' ? (
            <EmptyState
              icon="person.2"
              title="Takip ettiğin kimse paylaşmadı"
              text="Arkadaşlarını ve sevdiğin gastronomi hesaplarını takip et, gönderileri burada görünsün."
              action="Arkadaş bul"
              onPress={() => router.push('/arkadas-bul')}
            />
          ) : (
            <EmptyState
              icon="fork.knife"
              title="Bu bölgede henüz gönderi yok"
              text="İlk paylaşan sen ol ya da başka bir şehir veya ilçe seç."
              action="Başka bir yer seç"
              onPress={openAreaPicker}
            />
          )
        }
      />
    </>
  );
}

/** Yakınımda modu için konum izni / yükleniyor durumu */
function LocationPrompt({ status, onRetry }: { status: string; onRetry: () => void }) {
  if (status === 'loading' || status === 'granted') {
    return (
      <View style={styles.empty}>
        <ActivityIndicator color={colors.primary} />
        <Text variant="subhead" color={colors.textSecondary}>
          Konumun alınıyor…
        </Text>
      </View>
    );
  }
  const denied = status === 'denied';
  return (
    <Animated.View entering={FadeIn} style={styles.empty}>
      <View style={styles.bigIcon}>
        <SymbolView name="location.fill" tintColor={colors.onPrimary} size={28} />
      </View>
      <Text variant="title3" align="center">
        Yakınındaki lezzetleri gör
      </Text>
      <Text variant="subhead" color={colors.textSecondary} align="center">
        {denied
          ? 'Konum izni kapalı. Ayarlar’dan açabilir ya da bir şehir seçebilirsin.'
          : 'Çevrendeki en popüler gönderileri göstermek için konumunu kullanalım.'}
      </Text>
      <Button
        title={denied ? 'Ayarlar’ı aç' : 'Konumumu kullan'}
        icon="location"
        onPress={denied ? () => Linking.openSettings() : onRetry}
        style={styles.emptyButton}
      />
      <Button title="Şehir veya ilçe seç" variant="secondary" onPress={openAreaPicker} style={styles.emptyButton} />
    </Animated.View>
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
