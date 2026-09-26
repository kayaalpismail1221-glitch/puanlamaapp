import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Keyboard, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import Animated, { FadeInDown, FadeInUp, FadeOutDown, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchAreaBounds } from '@/api/content';
import { showError } from '@/api/errors';
import { openArea } from '@/components/area-row';
import { GlassSurface } from '@/components/glass-surface';
import { HighlightText } from '@/components/highlight-text';
import { MapPin } from '@/components/map-pin';
import { SegmentedControl } from '@/components/segmented-control';
import { PlaceImage, PressableScale, ScoreBadge, Text } from '@/components/ui';
import { colors, hitSlop, radius, spacing, typography } from '@/constants/theme';
import { getPlace, useEntitiesVersion, usePrefetchPlaces } from '@/data/entities';
import { useMapPlaces, useNearbyPlaceSearch, useSearchAreas } from '@/hooks/queries';
import { currentLanguage } from '@/i18n';
import { DEFAULT_REGION } from '@/lib/geo';
import { haptics } from '@/lib/haptics';
import { placeSubtitle } from '@/lib/place';
import { turkishPossessive } from '@/lib/possessive';
import { useAppSelector, useScored } from '@/store/app-store';
import type { AreaHit, Place } from '@/types';

type Filter = 'puanla' | 'been' | 'want';

/** `count`: topluluk pini ise kaç kişinin puanladığı (score = topluluk puanı) */
type Pin = { place: Place; score?: number; count?: number };

/** Arama panelinde en fazla bu kadar bölge ve mekân */
const MAX_AREAS = 3;
const MAX_PLACES = 8;
/** Mekâna gidince görünen alan (≈ birkaç sokak) */
const PLACE_SPAN = 0.008;

const toBounds = (r: Region) => ({
  south: r.latitude - r.latitudeDelta / 2,
  north: r.latitude + r.latitudeDelta / 2,
  west: r.longitude - r.longitudeDelta / 2,
  east: r.longitude + r.longitudeDelta / 2,
});

/**
 * Harita: Puanla (topluluk), Gittiklerim ve Listem katmanları. Üstteki aramayla mekân, semt, ilçe ya da şehir
 * bulunur; seçince harita oraya süzülür (uzaksa önce biraz uzaklaşıp sonra yaklaşır). Mekânda kartı açılır,
 * bölgede o bölgenin en yüksek puanlılarına kısayol çıkar.
 */
export default function MapScreen() {
  const insets = useSafeAreaInsets();
  // Yalnızca sıralama ve Listem değişince yeniden çizer (pinler başka ekrandaki beğenilerle tazelenmez)
  const scored = useScored();
  const saved = useAppSelector((s) => s.saved);
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

  /* ---------- Arama ---------- */
  const mapRef = useRef<MapView>(null);
  const regionRef = useRef<Region>(DEFAULT_REGION);
  const flightTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  // Aramadan seçilen mekân (katmanda olmasa da pini ve kartı gösterilir) ya da bölge (en iyilerine kısayol)
  const [focusPlace, setFocusPlace] = useState<Place | null>(null);
  const [focusArea, setFocusArea] = useState<AreaHit | null>(null);
  const [goingToArea, setGoingToArea] = useState(false);
  const trimmed = query.trim();
  const searching = searchFocused && trimmed.length > 0;
  const areaSearch = useSearchAreas(searching ? query : '');
  const placeSearch = useNearbyPlaceSearch(searching ? query : '');
  const areas = searching && trimmed.length >= 2 ? (areaSearch.data ?? []).slice(0, MAX_AREAS) : [];
  const places = searching ? (placeSearch.data ?? []).slice(0, MAX_PLACES) : [];

  useEffect(() => () => clearTimeout(flightTimer.current), []);

  /** Haritayı hedefe süzdürür: uzaksa önce ikisini birden gösterecek kadar uzaklaşır, sonra yaklaşır */
  const flyTo = (target: Region) => {
    const map = mapRef.current;
    if (!map) return;
    clearTimeout(flightTimer.current);
    const from = regionRef.current;
    const dLat = Math.abs(target.latitude - from.latitude);
    const dLng = Math.abs(target.longitude - from.longitude);
    const far = Math.max(dLat, dLng) > Math.max(from.latitudeDelta, target.latitudeDelta) * 0.9;
    if (!far) {
      map.animateToRegion(target, 700);
      return;
    }
    const span = Math.max(from.latitudeDelta, target.latitudeDelta, dLat * 1.6, dLng * 1.6);
    map.animateToRegion(
      {
        latitude: (from.latitude + target.latitude) / 2,
        longitude: (from.longitude + target.longitude) / 2,
        latitudeDelta: span,
        longitudeDelta: span,
      },
      450,
    );
    flightTimer.current = setTimeout(() => map.animateToRegion(target, 850), 420);
  };

  const closeSearch = () => {
    Keyboard.dismiss();
    setSearchFocused(false);
    setQuery('');
  };

  const choosePlace = (place: Place) => {
    haptics.select();
    closeSearch();
    setFocusArea(null);
    setFocusPlace(place);
    setSelectedId(place.id);
    flyTo({ latitude: place.latitude, longitude: place.longitude, latitudeDelta: PLACE_SPAN, longitudeDelta: PLACE_SPAN });
  };

  const chooseArea = async (area: AreaHit) => {
    haptics.select();
    closeSearch();
    setSelectedId(null);
    setFocusPlace(null);
    setGoingToArea(true);
    try {
      const bounds = await fetchAreaBounds(area);
      if (!bounds) return;
      const span = Math.max(bounds.north - bounds.south, bounds.east - bounds.west, 0.004);
      flyTo({
        latitude: (bounds.north + bounds.south) / 2,
        longitude: (bounds.east + bounds.west) / 2,
        latitudeDelta: span * 1.25,
        longitudeDelta: span * 1.25,
      });
      setFocusArea(area);
    } catch (error) {
      showError(error);
    } finally {
      setGoingToArea(false);
    }
  };

  /** Klavyedeki "Ara": ilk sonuca git (önce bölge, yoksa mekân) */
  const submit = () => {
    if (areas[0]) chooseArea(areas[0]);
    else if (places[0]) choosePlace(places[0]);
  };

  const pins = useMemo<Pin[]>(() => {
    let list: Pin[];
    if (filter === 'puanla') {
      list = (community.data ?? []).map((r) => ({ place: r.place, score: r.average, count: r.count }));
    } else if (filter === 'been') {
      list = scored.flatMap((e) => {
        const place = getPlace(e.placeId);
        return place ? [{ place, score: e.score }] : [];
      });
    } else {
      list = saved.flatMap((s) => {
        const place = getPlace(s.placeId);
        return place ? [{ place }] : [];
      });
    }
    // Aramadan gidilen mekân seçili katmanda yoksa da pini görünür (puanladıysan kendi puanıyla)
    if (focusPlace && !list.some((p) => p.place.id === focusPlace.id)) {
      list = [...list, { place: focusPlace, score: scored.find((e) => e.placeId === focusPlace.id)?.score }];
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scored, saved, filter, version, community.data, focusPlace]);

  const selected = pins.find((p) => p.place.id === selectedId);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={DEFAULT_REGION}
        showsPointsOfInterests={false}
        onRegionChangeComplete={(r) => {
          regionRef.current = r;
          setRegion(r);
        }}
        onPress={() => {
          if (searchFocused) closeSearch();
          setSelectedId(null);
        }}>
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

      {/* Üstte cam arama ve katman seçimi (iOS 26: Liquid Glass) */}
      <View style={[styles.top, { top: insets.top + spacing.sm }]} pointerEvents="box-none">
        <GlassSurface interactive style={styles.searchBar}>
          <SymbolView name="magnifyingglass" tintColor={colors.textSecondary} size={17} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onFocus={() => setSearchFocused(true)}
            onSubmitEditing={submit}
            placeholder={t('map.searchPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            autoCorrect={false}
            returnKeyType="search"
            style={[typography.body, styles.searchInput]}
          />
          {goingToArea ? (
            <ActivityIndicator size="small" color={colors.textSecondary} />
          ) : searchFocused || query ? (
            <PressableScale onPress={closeSearch} hitSlop={hitSlop} accessibilityLabel={t('map.clearSearch')}>
              <SymbolView name="xmark.circle.fill" tintColor={colors.textTertiary} size={18} />
            </PressableScale>
          ) : null}
        </GlassSurface>

        {searching ? (
          <Animated.View key="results" entering={FadeInUp.duration(180)} exiting={FadeOutUp.duration(120)}>
            <GlassSurface style={styles.results}>
              <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" style={styles.resultsScroll}>
                {areas.length > 0 && (
                  <Text variant="caption" color={colors.textSecondary} style={styles.resultsLabel}>
                    {t('search.areas')}
                  </Text>
                )}
                {areas.map((area) => (
                  <ResultRow
                    key={`${area.kind}:${area.city}:${area.district}:${area.name}`}
                    icon={area.kind === 'city' ? 'building.2.fill' : area.kind === 'district' ? 'map.fill' : 'mappin.and.ellipse'}
                    title={area.name}
                    subtitle={[t(`region.kinds.${area.kind}`), area.kind === 'neighborhood' ? area.district : area.city]
                      .filter(Boolean)
                      .join(' · ')}
                    highlight={trimmed}
                    onPress={() => chooseArea(area)}
                  />
                ))}
                {places.length > 0 && (
                  <Text variant="caption" color={colors.textSecondary} style={styles.resultsLabel}>
                    {t('common.places')}
                  </Text>
                )}
                {places.map((place) => (
                  <ResultRow
                    key={place.id}
                    photo={place.thumbUrl ?? place.photoUrl}
                    title={place.name}
                    subtitle={placeSubtitle(place)}
                    highlight={trimmed}
                    onPress={() => choosePlace(place)}
                  />
                ))}
                {!areas.length && !places.length && (
                  <Text variant="subhead" color={colors.textSecondary} align="center" style={styles.noResults}>
                    {placeSearch.isFetching || areaSearch.isFetching ? ' ' : t('search.noResults', { query: trimmed })}
                  </Text>
                )}
              </ScrollView>
            </GlassSurface>
          </Animated.View>
        ) : (
          <Animated.View key="filters" entering={FadeInUp.duration(180)}>
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
          </Animated.View>
        )}
      </View>

      {pins.length === 0 && !searching && !(filter === 'puanla' && community.isPending) && (
        <View style={styles.emptyWrap} pointerEvents="none">
          <GlassSurface style={styles.emptyCard}>
            <Text variant="subhead" color={colors.textSecondary} align="center">
              {filter === 'want' ? t('map.emptyWant') : filter === 'been' ? t('map.emptyBeen') : t('map.emptyCommunity')}
            </Text>
          </GlassSurface>
        </View>
      )}

      {selected ? (
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
                  {placeSubtitle(selected.place)}
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
                <SymbolView name="chevron.right" tintColor={colors.textTertiary} size={14} weight="semibold" />
              )}
            </GlassSurface>
          </PressableScale>
        </Animated.View>
      ) : (
        focusArea && (
          // Bölgeye gidince: "Kadıköy'ün en yüksek puanlıları" kısayolu (✕ ile kapanır)
          <Animated.View
            key={`area:${focusArea.kind}:${focusArea.name}`}
            entering={FadeInDown.springify()}
            exiting={FadeOutDown.duration(150)}
            style={[styles.areaWrap, { bottom: insets.bottom + 64 }]}>
            <PressableScale onPress={() => openArea(focusArea)} style={styles.areaShrink}>
              <GlassSurface interactive style={styles.areaChip}>
                <SymbolView name="star.fill" tintColor={colors.primary} size={15} />
                <Text variant="subhead" style={[styles.bold, styles.areaShrink]} numberOfLines={1}>
                  {t('search.areaTop', {
                    area: currentLanguage() === 'tr' ? turkishPossessive(focusArea.name) : focusArea.name,
                  })}
                </Text>
                <SymbolView name="chevron.right" tintColor={colors.textSecondary} size={12} weight="semibold" />
              </GlassSurface>
            </PressableScale>
            <PressableScale onPress={() => setFocusArea(null)} hitSlop={hitSlop} accessibilityLabel={t('common.close')}>
              <GlassSurface style={styles.areaClose}>
                <SymbolView name="xmark" tintColor={colors.textSecondary} size={12} weight="semibold" />
              </GlassSurface>
            </PressableScale>
          </Animated.View>
        )
      )}
    </View>
  );
}

/** Arama panelindeki satır: bölgede simge, mekânda küçük fotoğraf; yazılan kısım vurgulu */
function ResultRow({
  icon,
  photo,
  title,
  subtitle,
  highlight,
  onPress,
}: {
  icon?: React.ComponentProps<typeof SymbolView>['name'];
  photo?: string;
  title: string;
  subtitle: string;
  highlight: string;
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={onPress} scaleTo={0.98} haptic={false} style={styles.resultRow}>
      {icon ? (
        <View style={styles.resultIcon}>
          <SymbolView name={icon} tintColor={colors.primary} size={16} />
        </View>
      ) : (
        <PlaceImage uri={photo} style={styles.resultPhoto} />
      )}
      <View style={styles.resultText}>
        <HighlightText variant="subhead" numberOfLines={1} text={title} query={highlight} />
        <Text variant="caption" color={colors.textSecondary} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  top: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    gap: spacing.sm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 46,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    color: colors.text,
  },
  results: {
    paddingVertical: spacing.xs,
  },
  resultsScroll: {
    maxHeight: 380,
  },
  resultsLabel: {
    fontWeight: '600',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: 2,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  resultIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultPhoto: {
    width: 36,
    height: 36,
    borderRadius: radius.button,
  },
  resultText: {
    flex: 1,
    gap: 1,
  },
  noResults: {
    padding: spacing.lg,
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
  areaWrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  areaShrink: {
    flexShrink: 1,
  },
  areaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    height: 44,
    borderRadius: radius.full,
  },
  areaClose: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bold: {
    fontWeight: '600',
  },
});
