import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { GlassSurface } from '@/components/glass-surface';
import { MapDot } from '@/components/map-pin';
import { PressableScale, Text } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { useFootprint } from '@/hooks/use-footprint';
import { footprintCities, footprintStats, initialCity, ISTANBUL_REGION } from '@/lib/footprint';

/** Önizlemede çizilecek en fazla nokta (performans için) */
const MAX_DOTS = 150;

/**
 * Profildeki küçük "ayak izi" haritası: puanlanan mekânlar puan renginde noktalar.
 * Açılışta İstanbul'a odaklanır; dokununca tam ekran harita ve puanlar açılır.
 */
export function FootprintCard({ userId, title }: { userId: string; title: string }) {
  const { items } = useFootprint(userId);
  const cities = useMemo(() => footprintCities(items), [items]);
  const stats = useMemo(() => footprintStats(items), [items]);
  const region = initialCity(cities)?.region ?? ISTANBUL_REGION;
  const empty = items.length === 0;

  return (
    <View style={styles.section}>
      <Text variant="title3" style={styles.title}>
        {title}
      </Text>
      <PressableScale
        scaleTo={0.98}
        onPress={() => router.push({ pathname: '/ayak-izi/[id]', params: { id: userId } })}
        style={styles.card}
        accessibilityRole="button"
        accessibilityLabel={`${title}: ${stats.places} mekân, ${stats.cities} şehir`}>
        {/* Önizleme: dokunma kartın kendisine gider, harita kaydırılmaz */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <MapView
            // Bölge değişince (ör. yeni şehir) haritayı yeniden konumlandır
            key={`${region.latitude.toFixed(3)},${region.longitude.toFixed(3)}`}
            style={StyleSheet.absoluteFill}
            initialRegion={region}
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            showsPointsOfInterests={false}
            toolbarEnabled={false}>
            {items.slice(0, MAX_DOTS).map(({ place, score }) => (
              <Marker
                key={place.id}
                coordinate={{ latitude: place.latitude, longitude: place.longitude }}
                tracksViewChanges={false}
                anchor={{ x: 0.5, y: 0.5 }}>
                <MapDot score={score} />
              </Marker>
            ))}
          </MapView>
        </View>

        <View style={styles.footer} pointerEvents="none">
          <GlassSurface style={styles.stats}>
            {empty ? (
              <Text variant="footnote" color={colors.textSecondary} style={styles.flex}>
                İlk puanla birlikte ayak izi burada belirir.
              </Text>
            ) : (
              <View style={styles.statRow}>
                <Stat value={stats.places} label="mekân" />
                <Stat value={stats.districts} label="ilçe" />
                <Stat value={stats.cities} label="şehir" />
              </View>
            )}
            <SymbolView name="arrow.up.left.and.arrow.down.right" tintColor={colors.primary} size={14} weight="semibold" />
          </GlassSurface>
        </View>
      </PressableScale>
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <Text variant="footnote" color={colors.textSecondary}>
      <Text variant="headline" color={colors.primary} style={styles.value}>
        {value}
      </Text>{' '}
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingTop: spacing.xl,
  },
  title: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  card: {
    height: 200,
    marginHorizontal: spacing.lg,
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  footer: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    bottom: spacing.sm,
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  statRow: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.lg,
  },
  flex: {
    flex: 1,
  },
  value: {
    fontVariant: ['tabular-nums'],
  },
});
