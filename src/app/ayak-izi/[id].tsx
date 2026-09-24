import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassSurface } from '@/components/glass-surface';
import { MapPin } from '@/components/map-pin';
import { LoadingView, PlaceImage, PressableScale, ScoreBadge, Text } from '@/components/ui';
import { colors, hitSlop, radius, spacing } from '@/constants/theme';
import { useUser } from '@/data/entities';
import { useFootprint } from '@/hooks/use-footprint';
import { footprintCities, initialCity, ISTANBUL_REGION, regionFor, type Region } from '@/lib/footprint';
import { haptics } from '@/lib/haptics';
import { isMe } from '@/lib/session';

/** Mekâna yakınlaşınca kullanılan bölge boyutu */
const PLACE_DELTA = 0.012;

/** Şehir seçicide "Tümü" */
const ALL = '*';

/**
 * Dijital ayak izi: kullanıcının puanladığı tüm mekânlar haritada, puanlarıyla.
 * Üstte şehirler arasında geçiş; pine dokununca mekân kartı, oklarla puan sırasına göre gezinti.
 */
export default function FootprintScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const user = useUser(id);
  const mine = isMe(id);
  const { items, loading } = useFootprint(id);

  const cities = useMemo(() => footprintCities(items), [items]);
  const start = initialCity(cities);
  const [city, setCity] = useState<string>();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const activeCity = city ?? start?.name;
  const selected = selectedIndex !== null ? items[selectedIndex] : undefined;

  const firstName = user?.name.split(' ')[0] ?? '';
  const title = mine ? 'Ayak izim' : firstName ? `${firstName} · ayak izi` : 'Ayak izi';

  const moveTo = (region: Region | undefined) => region && mapRef.current?.animateToRegion(region, 450);

  const chooseCity = (name: string) => {
    haptics.select();
    setCity(name);
    setSelectedIndex(null);
    moveTo(name === ALL ? regionFor(items.map((i) => i.place), 0.2) : cities.find((c) => c.name === name)?.region);
  };

  const select = (index: number) => {
    const item = items[index];
    if (!item) return;
    haptics.select();
    setSelectedIndex(index);
    if (activeCity !== ALL) setCity(item.place.city);
    moveTo({
      latitude: item.place.latitude,
      longitude: item.place.longitude,
      latitudeDelta: PLACE_DELTA,
      longitudeDelta: PLACE_DELTA,
    });
  };

  // Oklarla puan sırasına göre bir sonraki / önceki mekân
  const step = (delta: number) => {
    if (selectedIndex === null || !items.length) return;
    select((selectedIndex + delta + items.length) % items.length);
  };

  if (loading) return <LoadingView style={styles.container} />;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title }} />
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={start?.region ?? ISTANBUL_REGION}
        showsPointsOfInterests={false}
        onPress={() => setSelectedIndex(null)}>
        {items.map(({ place, score }, i) => (
          <Marker
            key={place.id}
            coordinate={{ latitude: place.latitude, longitude: place.longitude }}
            // Seçili pin öne çıksın
            zIndex={i === selectedIndex ? 1 : 0}
            onPress={(e) => {
              e.stopPropagation();
              select(i);
            }}>
            <MapPin score={score} active={i === selectedIndex} />
          </Marker>
        ))}
      </MapView>

      {/* Şehirler */}
      {cities.length > 0 && (
        <View style={[styles.citiesWrap, { top: spacing.sm }]} pointerEvents="box-none">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cities}>
            {cities.length > 1 && (
              <CityChip label="Tümü" count={items.length} active={activeCity === ALL} onPress={() => chooseCity(ALL)} />
            )}
            {cities.map((c) => (
              <CityChip
                key={c.name}
                label={c.name}
                count={c.count}
                active={activeCity === c.name}
                onPress={() => chooseCity(c.name)}
              />
            ))}
          </ScrollView>
        </View>
      )}

      {items.length === 0 && (
        <View style={styles.emptyWrap} pointerEvents="none">
          <GlassSurface style={styles.emptyCard}>
            <SymbolView name="map" tintColor={colors.primary} size={28} />
            <Text variant="subhead" color={colors.textSecondary} align="center">
              {mine
                ? 'Puanladığın her mekân burada iz bırakır. İlk puanınla başla!'
                : `${firstName || 'Bu kişi'} henüz bir mekân puanlamadı.`}
            </Text>
          </GlassSurface>
        </View>
      )}

      {selected && selectedIndex !== null && (
        <Animated.View
          key={selected.place.id}
          entering={FadeInDown.springify()}
          exiting={FadeOutDown.duration(150)}
          style={[styles.cardWrap, { bottom: insets.bottom + spacing.lg }]}>
          <GlassSurface interactive style={styles.card}>
            <PressableScale
              onPress={() => router.push({ pathname: '/mekan/[id]', params: { id: selected.place.id } })}
              scaleTo={0.98}
              style={styles.cardMain}>
              <PlaceImage uri={selected.place.thumbUrl ?? selected.place.photoUrl} style={styles.cardImage} />
              <View style={styles.cardText}>
                <Text variant="caption" color={colors.textSecondary}>
                  {mine ? 'Sıralamanda' : 'Sıralamasında'} {selectedIndex + 1}. / {items.length}
                </Text>
                <Text variant="headline" numberOfLines={1}>
                  {selected.place.name}
                </Text>
                <Text variant="footnote" color={colors.textSecondary} numberOfLines={1}>
                  {selected.place.cuisine} · {selected.place.neighborhood || selected.place.district}
                </Text>
              </View>
              <ScoreBadge score={selected.score} />
            </PressableScale>
            {items.length > 1 && (
              <View style={styles.stepper}>
                <PressableScale onPress={() => step(-1)} hitSlop={hitSlop} style={styles.stepButton} accessibilityLabel="Önceki mekân">
                  <SymbolView name="chevron.left" tintColor={colors.primary} size={14} weight="semibold" />
                </PressableScale>
                <PressableScale onPress={() => step(1)} hitSlop={hitSlop} style={styles.stepButton} accessibilityLabel="Sonraki mekân">
                  <SymbolView name="chevron.right" tintColor={colors.primary} size={14} weight="semibold" />
                </PressableScale>
              </View>
            )}
          </GlassSurface>
        </Animated.View>
      )}
    </View>
  );
}

function CityChip({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={onPress} haptic={false} scaleTo={0.95}>
      <GlassSurface interactive style={[styles.chip, active && styles.chipActive]}>
        <Text variant="subhead" color={active ? colors.onPrimary : colors.primary} style={styles.bold}>
          {label}
        </Text>
        <Text variant="caption" color={active ? colors.onPrimary : colors.textSecondary}>
          {count}
        </Text>
      </GlassSurface>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  citiesWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  cities: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  chipActive: {
    backgroundColor: colors.primary,
  },
  bold: {
    fontWeight: '600',
  },
  emptyWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  emptyCard: {
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xl,
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
    gap: spacing.sm,
    padding: spacing.md,
  },
  cardMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  cardImage: {
    width: 56,
    height: 56,
    borderRadius: radius.button,
  },
  cardText: {
    flex: 1,
    gap: 2,
  },
  stepper: {
    gap: spacing.sm,
  },
  stepButton: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
