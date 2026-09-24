import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { PlaceDetailSkeleton, PostGridSkeleton } from '@/components/skeleton';
import { Avatar, Button, Divider, ErrorView, PlaceImage, PressableScale, ScoreBadge, Text } from '@/components/ui';
import { cuisineLabel } from '@/constants/cuisines';
import { colors, hitSlop, radius, spacing } from '@/constants/theme';
import { PostGrid } from '@/components/post-grid';
import { usePlace, useUser } from '@/data/entities';
import { usePlaceDetails, usePlacePosts } from '@/hooks/queries';
import { formatScore } from '@/lib/format';
import { linkSource } from '@/lib/links';
import { haptics } from '@/lib/haptics';
import { highlightLabel } from '@/lib/post-meta';
import { sharePlace } from '@/lib/share';
import { useAppStore } from '@/store/app-store';

export default function PlaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const cached = usePlace(id);
  const details = usePlaceDetails(id);
  const placePosts = usePlacePosts(id);
  const { scoreOf, scored, isSaved, saved: savedPlaces, actions } = useAppStore();
  const { t } = useTranslation();
  const place = cached ?? details.data?.place;

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
    <ScrollView style={styles.container} contentInsetAdjustmentBehavior="never">
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
              {cuisineLabel(place.cuisine)} · {place.neighborhood}, {place.city}
            </Text>
          </View>
          {myScore !== undefined && <ScoreBadge score={myScore} size="lg" />}
        </View>

        {myEntry && (
          <Text variant="footnote" color={colors.textSecondary}>
            {t('place.yourRank', { rank: myEntry.rank })}
            {myEntry.note ? ` · “${myEntry.note}”` : ''}
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
          </Text>
        )}

        <Divider />

        <View style={styles.mapWrap}>
          <MapView
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
            <Marker coordinate={{ latitude: place.latitude, longitude: place.longitude }}>
              <View style={styles.pin}>
                <SymbolView name="fork.knife" tintColor={colors.onPrimary} size={14} />
              </View>
            </Marker>
          </MapView>
        </View>

        {/* ODbL: OpenStreetMap kaynaklı mekân bilgisinin atfı */}
        <Text variant="caption" color={colors.textTertiary}>
          {t('place.dataSource')}
        </Text>

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
    </ScrollView>
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
      <Avatar uri={user.avatarUrl} name={user.name} size={48} />
      <View style={styles.friendBadge}>
        <ScoreBadge score={score} size="sm" />
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
    width: 34,
    height: 34,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
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
    height: 320,
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
    width: 64,
  },
  friendBadge: {
    marginTop: -spacing.lg,
    marginLeft: spacing.xl,
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
