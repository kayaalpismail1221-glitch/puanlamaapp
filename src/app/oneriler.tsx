import { router } from 'expo-router';
import { SymbolView } from '@/components/symbol';
import { useTranslation } from 'react-i18next';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import type { Recommendation } from '@/api/content';
import { PlaceRowsSkeleton, SkeletonScreen } from '@/components/skeleton';
import { Button, Divider, ErrorView, PlaceImage, PressableScale, ScoreBadge, Text } from '@/components/ui';
import { colors, hitSlop, radius, spacing } from '@/constants/theme';
import { useRecommendations } from '@/hooks/queries';
import { formatScore } from '@/lib/format';
import { formatDistance } from '@/lib/geo';
import { placeSubtitle } from '@/lib/place';
import { useAppStore } from '@/store/app-store';

/**
 * Sana özel öneriler: arkadaşlarının (varsa önce onlar) ve topluluğun beğendiği, henüz puanlamadığın
 * mekânlar; konum açıksa yakındakiler öne çıkar. Sıralama sunucuda (`recommended_places`).
 */
export default function RecommendationsScreen() {
  const { t } = useTranslation();
  const recs = useRecommendations(true);

  if (recs.isPending) {
    return (
      <SkeletonScreen>
        <PlaceRowsSkeleton count={7} thumb={64} />
      </SkeletonScreen>
    );
  }
  if (recs.isError) return <ErrorView onRetry={() => recs.refetch()} style={styles.container} />;

  return (
    <FlatList
      style={styles.container}
      data={recs.data}
      keyExtractor={(r) => r.place.id}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        <RefreshControl refreshing={recs.isRefetching} onRefresh={() => recs.refetch()} tintColor={colors.primary} />
      }
      ListHeaderComponent={
        <Text variant="subhead" color={colors.textSecondary} style={styles.intro}>
          {t('recs.intro')}
        </Text>
      }
      ItemSeparatorComponent={() => <Divider inset={spacing.lg + 64 + spacing.md} />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <SymbolView name="sparkles" tintColor={colors.textTertiary} size={40} />
          <Text variant="title3" align="center">
            {t('recs.emptyTitle')}
          </Text>
          <Text variant="subhead" color={colors.textSecondary} align="center">
            {t('recs.emptyText')}
          </Text>
          <Button title={t('recs.findFriends')} onPress={() => router.push('/arkadas-bul')} style={styles.emptyButton} />
        </View>
      }
      renderItem={({ item }) => <RecommendationRow rec={item} />}
    />
  );
}

function RecommendationRow({ rec }: { rec: Recommendation }) {
  const { t } = useTranslation();
  const { isSaved, actions } = useAppStore();
  const { place } = rec;
  const saved = isSaved(place.id);
  const score = rec.friendAverage ?? rec.communityAverage;
  // Neden önerildi: arkadaş puanı varsa o, yoksa topluluk ortalaması
  const reason =
    rec.friendAverage !== undefined
      ? t('recs.friends', { count: rec.friendCount, score: formatScore(rec.friendAverage) })
      : t('recs.community', { count: rec.communityCount, score: formatScore(rec.communityAverage) });

  return (
    <PressableScale
      scaleTo={0.98}
      onPress={() => router.push({ pathname: '/mekan/[id]', params: { id: place.id } })}
      style={styles.row}>
      <PlaceImage uri={place.thumbUrl ?? place.photoUrl} style={styles.thumb} />
      <View style={styles.info}>
        <Text variant="headline" numberOfLines={1}>
          {place.name}
        </Text>
        <Text variant="footnote" color={colors.textSecondary} numberOfLines={1}>
          {placeSubtitle(place)}
          {rec.distanceKm !== undefined ? ` · ${t('recs.distance', { distance: formatDistance(rec.distanceKm) })}` : ''}
        </Text>
        <View style={styles.reason}>
          <SymbolView
            name={rec.friendAverage !== undefined ? 'person.2.fill' : 'star.fill'}
            tintColor={colors.primary}
            size={11}
          />
          <Text variant="caption" color={colors.primary} numberOfLines={1} style={styles.bold}>
            {reason}
          </Text>
        </View>
      </View>
      <ScoreBadge score={score} size="sm" />
      <PressableScale
        hitSlop={hitSlop}
        onPress={() => actions.toggleSaved(place.id)}
        accessibilityLabel={saved ? t('common.removeFromList') : t('common.saveToList')}>
        <SymbolView name={saved ? 'bookmark.fill' : 'bookmark'} tintColor={colors.primary} size={22} />
      </PressableScale>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  intro: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: radius.button,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  bold: {
    fontWeight: '600',
  },
  empty: {
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xxl,
  },
  emptyButton: {
    alignSelf: 'stretch',
  },
});
