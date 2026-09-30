import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from '@/components/symbol';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppMapView, PinMarker } from '@/components/app-map';
import { PlaceDetailSkeleton, PostGridSkeleton } from '@/components/skeleton';
import { Avatar, Button, Divider, ErrorView, PlaceImage, PressableScale, ScoreBadge, Text } from '@/components/ui';
import { colors, hitSlop, onScoreColor, radius, scoreColor, spacing } from '@/constants/theme';
import { PlaceInfo } from '@/components/place-info';
import { ScoringGuide, ScoringGuideLink, useScoringGuide } from '@/components/scoring-guide';
import { PostGrid } from '@/components/post-grid';
import { usePlace, useUser } from '@/data/entities';
import { usePlaceDetails, usePlacePosts } from '@/hooks/queries';
import { formatScore } from '@/lib/format';
import { linkSource } from '@/lib/links';
import { haptics } from '@/lib/haptics';
import { placeSubtitle } from '@/lib/place';
import { segmentStanding } from '@/lib/ranking';
import { confirmRemoveScore } from '@/lib/remove-score';
import { highlightLabel } from '@/lib/post-meta';
import { sharePlace } from '@/lib/share';
import { useAppStore } from '@/store/app-store';

const HERO_HEIGHT = 320;
/** Android üst çubuğu (actionBarSize) */
const ANDROID_HEADER_HEIGHT = 56;

export default function PlaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const cached = usePlace(id);
  const details = usePlaceDetails(id);
  const placePosts = usePlacePosts(id);
  const { scoreOf, scored, rankings, isSaved, saved: savedPlaces, actions } = useAppStore();
  const guide = useScoringGuide();
  const { t } = useTranslation();
  const place = cached ?? details.data?.place;

  // Android: saydam üst çubuk, fotoğraf kaydırılıp geçilince Material'daki gibi zemin rengine bürünür
  // (içerik durum çubuğu ve düğmelerin altından yazıyla üst üste geçmesin). iOS'ta sistem başlığı kalır.
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });
  const barStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.get(), [HERO_HEIGHT - 140, HERO_HEIGHT - 70], [0, 1], 'clamp'),
  }));

  if (!place) {
    if (details.isError) return <ErrorView onRetry={() => details.refetch()} style={styles.container} />;
    if (cached === undefined && details.isPending) return <PlaceDetailSkeleton />;
    return (
      <View style={[styles.container, styles.center]}>
        <Text>{t('place.notFound')}</Text>
      </View>
    );
  }

  const myScore = scoreOf(place.id);
  const myEntry = scored.find((e) => e.placeId === place.id);
  // Puanın bağlamı: kendi türündeki listende kaçıncı (eşitler aynı sırada)
  const standing = myEntry ? segmentStanding(rankings, place.id) : undefined;
  // Puan sıralamadan ve Top 3'ten çıkar; paylaşılan gönderiler kalır
  const confirmUnrank = () => confirmRemoveScore(place.name, () => actions.unrank(place.id));
  const saved = isSaved(place.id);
  const savedEntry = savedPlaces.find((s) => s.placeId === place.id);
  const source = savedEntry?.link ? linkSource(savedEntry.link) : null;
  const posts = placePosts.data ?? [];
  const summary = details.data?.summary;
  const hasSummary = !!summary && summary.highlights.length > 0;
  // Takip edilenlerin bu mekâna verdiği puanlar
  const friendScores = details.data?.friends ?? [];
  const friendAverage = friendScores.length
    ? friendScores.reduce((sum, f) => sum + f.score, 0) / friendScores.length
    : undefined;
  const postCount = details.data?.postCount ?? posts.length;

  return (
    <View style={styles.container}>
      <Animated.ScrollView
        style={styles.container}
        contentInsetAdjustmentBehavior="never"
        onScroll={Platform.OS === 'android' ? onScroll : undefined}
        scrollEventThrottle={16}>
        <Stack.Screen
          options={{
            headerRight: () => (
              <PressableScale
                onPress={() => sharePlace(place, details.data?.rating)}
                hitSlop={hitSlop}
                style={styles.headerButton}
                accessibilityLabel={t('share.sharePlace')}>
                <SymbolView name="square.and.arrow.up" tintColor={colors.primary} size={18} weight="semibold" />
              </PressableScale>
            ),
          }}
        />
        <PlaceImage uri={place.photoUrl} style={styles.hero} />

        <View style={styles.body}>
          <View style={styles.titleRow}>
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Text variant="title" color={colors.primary}>
                {place.name}
              </Text>
              <Text variant="subhead" color={colors.textSecondary}>
                {placeSubtitle(place)}
              </Text>
              {place.closed && (
                <View style={styles.closedBadge}>
                  <SymbolView name="xmark.circle.fill" tintColor={colors.textSecondary} size={14} />
                  <Text variant="footnote" color={colors.textSecondary} style={{ fontWeight: '600' }}>
                    {t('place.closedBanner')}
                  </Text>
                </View>
              )}
            </View>
            {myScore !== undefined && <ScoreBadge score={myScore} size="lg" />}
          </View>

          {myEntry && (
            <Text variant="footnote" color={colors.textSecondary}>
              {standing &&
                (standing.total === 1
                  ? t('place.segmentFirst', { segment: t(`segments.${standing.segment}`) })
                  : t('place.segmentStanding', {
                      segment: t(`segments.${standing.segment}`),
                      rank: standing.rank,
                      total: standing.total,
                    }))}
              {myEntry.note ? ` · “${myEntry.note}”` : ''}
              {'  '}
              <Text variant="footnote" color={colors.primary} style={{ fontWeight: '600' }} onPress={confirmUnrank}>
                {t('place.removeScore')}
              </Text>
            </Text>
          )}

          {savedEntry && (savedEntry.note || source) && (
            <View style={styles.savedInfo}>
              {savedEntry.note && <Text variant="subhead">{savedEntry.note}</Text>}
              {source && savedEntry.link && (
                <PressableScale onPress={() => Linking.openURL(savedEntry.link!)} style={styles.sourceChip}>
                  <SymbolView name={source.icon} tintColor={colors.primary} size={14} />
                  <Text variant="footnote" color={colors.primary} style={{ fontWeight: '600' }}>
                    {t('place.openSource', { source: source.label })}
                  </Text>
                </PressableScale>
              )}
            </View>
          )}

          <View style={styles.actions}>
            <Button
              title={myScore !== undefined ? t('place.rerate') : t('place.rate')}
              icon="star"
              onPress={() => router.push({ pathname: '/degerlendir/[id]', params: { id: place.id } })}
              style={{ flex: 1 }}
            />
            {myScore === undefined && (
              <Button
                title={saved ? t('place.saved') : t('place.save')}
                icon={saved ? 'bookmark.fill' : 'bookmark'}
                variant="secondary"
                onPress={() => {
                  haptics.success();
                  actions.toggleSaved(place.id);
                }}
                style={{ flex: 1 }}
              />
            )}
          </View>
          <Button
            title={t('common.sharePost')}
            icon="camera"
            variant="secondary"
            onPress={() => router.push({ pathname: '/gonderi-olustur', params: { placeId: place.id } })}
          />

          <Divider />

          {hasSummary && summary && (
            <>
              <Text variant="headline">{t('place.byUsers')}</Text>
              <View style={styles.summary}>
                {summary.highlights.length > 0 && (
                  <View style={styles.summaryChips}>
                    {summary.highlights.map((h) => (
                      <View key={h.label} style={styles.summaryChip}>
                        <Text variant="footnote" color={colors.primary} style={{ fontWeight: '600' }}>
                          {highlightLabel(h.label)}
                        </Text>
                        <Text variant="caption" color={colors.textSecondary}>
                          {h.count}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
              <Divider />
            </>
          )}

          <View style={styles.sectionHeader}>
            <Text variant="headline">{t('place.friendsScore')}</Text>
            {friendAverage !== undefined && (
              <Text variant="subhead" color={colors.textSecondary}>
                {t('place.average', { score: formatScore(friendAverage) })}
              </Text>
            )}
          </View>
          {friendScores.length === 0 ? (
            <Text variant="subhead" color={colors.textSecondary}>
              {details.isPending ? ' ' : t('place.noFriendScores')}
            </Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.friendScores}>
              {friendScores.map((f) => (
                <FriendScore key={f.userId} userId={f.userId} score={f.score} postId={f.postId} />
              ))}
            </ScrollView>
          )}

          {details.data?.rating && (
            <Text variant="footnote" color={colors.textSecondary}>
              {t('place.communityAverage', {
                score: formatScore(details.data.rating.average),
                count: details.data.rating.count,
              })}
              {/* Puan az kişiden geliyorsa neden ham ortalamadan farklı olabileceğini söyle */}
              {details.data.rating.count < 5 && `\n${t('place.communityHint')}`}
            </Text>
          )}
          <ScoringGuideLink onPress={guide.open} />
          <ScoringGuide visible={guide.visible} onClose={guide.close} />

          <Divider />

          <PlaceInfo place={place} />

          <PressableScale
            onPress={() => router.push({ pathname: '/yol-tarifi/[id]', params: { id: place.id } })}
            scaleTo={0.98}
            style={styles.mapWrap}
            accessibilityRole="button"
            accessibilityLabel={t('place.directions')}>
            <AppMapView
              pointerEvents="none"
              style={StyleSheet.absoluteFill}
              initialRegion={{
                latitude: place.latitude,
                longitude: place.longitude,
                latitudeDelta: 0.008,
                longitudeDelta: 0.008,
              }}
              scrollEnabled={false}
              zoomEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}>
              <PinMarker coordinate={{ latitude: place.latitude, longitude: place.longitude }}>
                <View style={styles.pin}>
                  <SymbolView name="fork.knife" tintColor={colors.onPrimary} size={14} />
                </View>
              </PinMarker>
            </AppMapView>
            <View style={styles.directionsChip}>
              <SymbolView name="arrow.triangle.turn.up.right.diamond.fill" tintColor={colors.onPrimary} size={15} />
              <Text variant="footnote" color={colors.onPrimary} style={{ fontWeight: '600' }}>
                {t('place.directions')}
              </Text>
            </View>
          </PressableScale>

          <View style={styles.sourceRow}>
            {/* ODbL (OpenStreetMap) ve Overture Maps lisansları gereği mekân bilgisinin atfı */}
            <Text variant="caption" color={colors.textTertiary} style={{ flex: 1 }}>
              {t('place.dataSource')}
            </Text>
            <PressableScale
              onPress={() => router.push({ pathname: '/mekan-duzelt/[id]', params: { id: place.id } })}
              hitSlop={hitSlop}>
              <Text variant="caption" color={colors.primary} style={{ fontWeight: '600' }}>
                {t('place.wrongInfo')}
              </Text>
            </PressableScale>
          </View>

          <Text variant="headline">
            {postCount > 0 ? t('place.postsCount', { count: postCount }) : t('place.posts')}
          </Text>
        </View>

        {placePosts.isPending ? (
          <PostGridSkeleton count={6} />
        ) : (
          <PostGrid posts={posts} emptyText={t('place.noPosts')} />
        )}
        <View style={{ height: spacing.xxl }} />
      </Animated.ScrollView>
      {Platform.OS === 'android' && (
        <Animated.View
          pointerEvents="none"
          style={[styles.headerBar, { height: insets.top + ANDROID_HEADER_HEIGHT }, barStyle]}
        />
      )}
    </View>
  );
}

/** Arkadaşın puanı; gönderisi varsa ona, yoksa profiline gider */
function FriendScore({ userId, score, postId }: { userId: string; score: number; postId?: string }) {
  const user = useUser(userId);
  if (!user) return null;
  return (
    <PressableScale
      onPress={() =>
        postId
          ? router.push({ pathname: '/gonderi/[id]', params: { id: postId } })
          : router.push({ pathname: '/kullanici/[id]', params: { id: userId } })
      }
      style={styles.friendScore}>
      <Avatar uri={user.avatarUrl} name={user.name} size={52} />
      {/* Puan, avatarın alt kenarına ortalanmış dolu etiket */}
      <View style={[styles.friendPill, { backgroundColor: scoreColor(score) }]}>
        <Text variant="caption" color={onScoreColor(score)} style={styles.friendPillText}>
          {formatScore(score)}
        </Text>
      </View>
      <Text variant="caption" numberOfLines={1}>
        {user.name.split(' ')[0]}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  // Fotoğrafın üstünde okunaklı dursun diye cam benzeri beyaz daire
  headerButton: {
    width: Platform.OS === 'android' ? 40 : 34,
    height: Platform.OS === 'android' ? 40 : 34,
    borderRadius: radius.full,
    backgroundColor: colors.floating,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summary: {
    gap: spacing.md,
  },
  summaryChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  summaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: {
    width: '100%',
    height: HERO_HEIGHT,
  },
  headerBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  body: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  savedInfo: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  sourceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  friendScores: {
    gap: spacing.lg,
  },
  friendScore: {
    alignItems: 'center',
    gap: spacing.xs,
    width: 68,
  },
  friendPill: {
    marginTop: -12,
    minWidth: 40,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  friendPillText: {
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  directionsChip: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  closedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  mapWrap: {
    height: 160,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  pin: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
