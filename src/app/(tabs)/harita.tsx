import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassSurface } from '@/components/glass-surface';
import { MapPin } from '@/components/map-pin';
import { SegmentedControl } from '@/components/segmented-control';
import { PlaceImage, PressableScale, ScoreBadge, Text } from '@/components/ui';
import { cuisineLabel } from '@/constants/cuisines';
import { colors, radius, spacing } from '@/constants/theme';
import { getPlace, useEntitiesVersion, usePrefetchPlaces } from '@/data/entities';
import { useMapPlaces } from '@/hooks/queries';
import { DEFAULT_REGION } from '@/lib/geo';
import { haptics } from '@/lib/haptics';
import { useAppStore } from '@/store/app-store';
import type { Place } from '@/types';

type Filter = 'puanla' | 'been' | 'want';


/** `count`: topluluk pini ise kaç kişinin puanladığı (score = ortalama) */
type Pin = { place: Place; score?: number; count?: number };

const toBounds = (r: Region) => ({
  south: r.latitude - r.latitudeDelta / 2,
  north: r.latitude + r.latitudeDelta / 2,
  west: r.longitude - r.longitudeDelta / 2,
  east: r.longitude + r.longitudeDelta / 2,
});

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { scored, saved } = useAppStore();
  const { t } = useTranslation();
  const filters: { key: Filter; label: string }[] = [
    { key: 'puanla', label: t('map.community') },
    { key: 'been', label: t('map.been') },
    { key: 'want', label: t('map.want') },
  ];
  // Listem'deki harita butonu `filtre=want` ile açar
  const { filtre } = useLocalSearchParams<{ filtre?: Filter }>();
  const [filter, setFilter] = useState<Filter>(filtre ?? 'puanla');
  // Parametre değişince filtreyi güncelle (render sırasında, efekt olmadan)
  const [lastParam, setLastParam] = useState(filtre);
  if (filtre !== lastParam) {
    setLastParam(filtre);
    if (filtre) setFilter(filtre);
  }
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  const version = useEntitiesVersion();
  usePrefetchPlaces([...scored, ...saved].map((e) => e.placeId));
  // Topluluk katmanı yalnızca o sekmedeyken, görünen bölge için istenir
  const community = useMapPlaces(filter === 'puanla' ? toBounds(region) : null);

  const pins = useMemo<Pin[]>(() => {
    if (filter === 'puanla') {
      return (community.data ?? []).map((r) => ({ place: r.place, score: r.average, count: r.count }));
    }
    const been = scored.flatMap((e) => {
      const place = getPlace(e.placeId);
      return place ? [{ place, score: e.score }] : [];
    });
    const want = saved.flatMap((s) => {
      const place = getPlace(s.placeId);
      return place ? [{ place }] : [];
    });
    return filter === 'been' ? been : want;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scored, saved, filter, version, community.data]);

  const selected = pins.find((p) => p.place.id === selectedId);

  return (
    <View style={styles.container}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={DEFAULT_REGION}
        showsPointsOfInterests={false}
        onRegionChangeComplete={setRegion}
        onPress={() => setSelectedId(null)}>
        {pins.map(({ place, score }) => (
          <Marker
            key={place.id}
            coordinate={{ latitude: place.latitude, longitude: place.longitude }}
            onPress={(e) => {
              e.stopPropagation();
              haptics.select();
              setSelectedId(place.id);
            }}>
            <MapPin score={score} active={place.id === selectedId} />
          </Marker>
        ))}
      </MapView>

      {/* Üstte cam filtre (iOS 26: Liquid Glass) */}
      <View style={[styles.filterWrap, { top: insets.top + spacing.sm }]} pointerEvents="box-none">
        <GlassSurface style={styles.filterBar}>
          <SegmentedControl
            options={filters}
            value={filter}
            onChange={(f) => {
              setFilter(f);
              setSelectedId(null);
            }}
            style={styles.filterSegment}
          />
        </GlassSurface>
      </View>

      {pins.length === 0 && !(filter === 'puanla' && community.isPending) && (
        <View style={styles.emptyWrap} pointerEvents="none">
          <GlassSurface style={styles.emptyCard}>
            <Text variant="subhead" color={colors.textSecondary} align="center">
              {filter === 'want' ? t('map.emptyWant') : filter === 'been' ? t('map.emptyBeen') : t('map.emptyCommunity')}
            </Text>
          </GlassSurface>
        </View>
      )}

      {selected && (
        <Animated.View
          key={selected.place.id}
          entering={FadeInDown.springify()}
          exiting={FadeOutDown.duration(150)}
          style={[styles.cardWrap, { bottom: insets.bottom + 64 }]}>
          <PressableScale onPress={() => router.push({ pathname: '/mekan/[id]', params: { id: selected.place.id } })}>
            <GlassSurface interactive style={styles.card}>
            <PlaceImage uri={selected.place.photoUrl} style={styles.cardImage} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="headline" numberOfLines={1}>
                {selected.place.name}
              </Text>
              <Text variant="footnote" color={colors.textSecondary} numberOfLines={1}>
                {cuisineLabel(selected.place.cuisine)} · {selected.place.neighborhood}
              </Text>
              {selected.count !== undefined && (
                <Text variant="caption" color={colors.textSecondary}>
                  {t('map.average', { count: selected.count })}
                </Text>
              )}
            </View>
            {selected.score !== undefined ? (
              <ScoreBadge score={selected.score} />
            ) : (
              <SymbolView name="bookmark.fill" tintColor={colors.primary} size={20} />
            )}
            </GlassSurface>
          </PressableScale>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  filterWrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
  },
  filterBar: {
    paddingVertical: spacing.sm,
  },
  filterSegment: {
    paddingHorizontal: spacing.sm,
  },
  emptyWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  emptyCard: {
    padding: spacing.lg,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  cardWrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  cardImage: {
    width: 56,
    height: 56,
    borderRadius: radius.button,
  },
});
