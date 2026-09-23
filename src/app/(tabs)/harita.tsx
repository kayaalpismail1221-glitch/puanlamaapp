import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlaceImage, PressableScale, ScoreBadge, Text } from '@/components/ui';
import { colors, radius, scoreColor, spacing } from '@/constants/theme';
import { DEFAULT_REGION, placeById } from '@/data/mock';
import { formatScore } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { useAppStore } from '@/store/app-store';
import type { Place } from '@/types';

type Filter = 'all' | 'been' | 'want';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'been', label: 'Gittiklerim' },
  { key: 'want', label: 'Listem' },
];

type Pin = { place: Place; score?: number };

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { scored, saved } = useAppStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const pins = useMemo<Pin[]>(() => {
    const been = scored
      .map((e) => ({ place: placeById(e.placeId), score: e.score }))
      .filter((p): p is { place: Place; score: number } => !!p.place);
    const want = saved
      .map((s) => placeById(s.placeId))
      .filter((p): p is Place => !!p)
      .map((place) => ({ place }));
    if (filter === 'been') return been;
    if (filter === 'want') return want;
    return [...been, ...want];
  }, [scored, saved, filter]);

  const selected = pins.find((p) => p.place.id === selectedId);

  return (
    <View style={styles.container}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={DEFAULT_REGION}
        showsPointsOfInterests={false}
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

      {/* Üstte bulanık filtre çubuğu */}
      <BlurView intensity={80} tint="light" style={[styles.filterBar, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.segment}>
          {FILTERS.map((f) => {
            const active = f.key === filter;
            return (
              <PressableScale
                key={f.key}
                onPress={() => {
                  haptics.select();
                  setFilter(f.key);
                  setSelectedId(null);
                }}
                haptic={false}
                style={[styles.segmentItem, active && styles.segmentActive]}>
                <Text
                  variant="footnote"
                  color={active ? colors.onPrimary : colors.primary}
                  style={styles.segmentText}
                  numberOfLines={1}>
                  {f.label}
                </Text>
              </PressableScale>
            );
          })}
        </View>
      </BlurView>

      {pins.length === 0 && (
        <View style={styles.emptyWrap} pointerEvents="none">
          <BlurView intensity={80} tint="light" style={styles.emptyCard}>
            <Text variant="subhead" color={colors.textSecondary} align="center">
              {filter === 'want'
                ? 'Listene kaydettiğin mekânlar burada görünecek.'
                : 'Puanladığın mekânlar haritada görünecek.'}
            </Text>
          </BlurView>
        </View>
      )}

      {selected && (
        <Animated.View
          key={selected.place.id}
          entering={FadeInDown.springify()}
          exiting={FadeOutDown.duration(150)}
          style={[styles.cardWrap, { bottom: insets.bottom + 64 }]}>
          <PressableScale
            onPress={() => router.push({ pathname: '/mekan/[id]', params: { id: selected.place.id } })}
            style={styles.card}>
            <PlaceImage uri={selected.place.photoUrl} style={styles.cardImage} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="headline" numberOfLines={1}>
                {selected.place.name}
              </Text>
              <Text variant="footnote" color={colors.textSecondary} numberOfLines={1}>
                {selected.place.cuisine} · {selected.place.neighborhood}
              </Text>
            </View>
            {selected.score !== undefined ? (
              <ScoreBadge score={selected.score} />
            ) : (
              <SymbolView name="bookmark.fill" tintColor={colors.primary} size={20} />
            )}
          </PressableScale>
        </Animated.View>
      )}
    </View>
  );
}

/** Puana göre renklenen pin; puansızsa "gitmek istiyorum" pini */
function MapPin({ score, active }: { score?: number; active: boolean }) {
  const isWant = score === undefined;
  const color = isWant ? colors.primary : scoreColor(score);
  return (
    <View
      style={[
        styles.pin,
        isWant
          ? { backgroundColor: colors.background, borderColor: color }
          : { backgroundColor: color, borderColor: colors.background },
        active && styles.pinActive,
      ]}>
      {isWant ? (
        <SymbolView name="bookmark.fill" tintColor={color} size={12} />
      ) : (
        <Text variant="caption" color={colors.onPrimary} style={styles.pinText}>
          {formatScore(score)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  filterBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.button,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  segmentItem: {
    flex: 1,
    height: 32,
    borderRadius: radius.button - 4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  segmentActive: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    fontWeight: '600',
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
  pin: {
    minWidth: 36,
    height: 28,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  pinActive: {
    transform: [{ scale: 1.2 }],
  },
  pinText: {
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
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
    borderRadius: radius.card,
    backgroundColor: colors.background,
    shadowColor: colors.primary,
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
  cardImage: {
    width: 56,
    height: 56,
    borderRadius: radius.button,
  },
});
