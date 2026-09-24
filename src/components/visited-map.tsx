import { Link } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { MapDot } from '@/components/map-pin';
import { PressableScale } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { useVisitedPlaces } from '@/hooks/use-visited-places';
import { initialCity, ISTANBUL_REGION, visitedCities } from '@/lib/visited';

/** Önizlemede çizilecek en fazla nokta (performans için) */
const MAX_DOTS = 150;

/**
 * Profilde gönderilerin üstündeki küçük harita: kişinin gittiği yerler nokta olarak.
 * Dokununca (iOS 18+'da yakınlaşarak) büyük haritaya açılır. Hiç yer yoksa gösterilmez.
 */
export function VisitedMap({ userId }: { userId: string }) {
  const { items } = useVisitedPlaces(userId);
  const region = useMemo(() => initialCity(visitedCities(items))?.region ?? ISTANBUL_REGION, [items]);

  if (!items.length) return null;

  return (
    <Link href={{ pathname: '/gittigi-yerler/[id]', params: { id: userId } }} asChild>
      <Link.AppleZoom>
        <PressableScale scaleTo={0.98} style={styles.card} accessibilityRole="button" accessibilityLabel="Gittiği yerler haritası">
          {/* Önizleme: dokunma karta gider, harita kaydırılmaz */}
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <MapView
              // Yeni bir şehir eklenince haritayı yeniden konumlandır
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
          <View style={styles.expand} pointerEvents="none">
            <SymbolView name="arrow.up.left.and.arrow.down.right" tintColor={colors.primary} size={12} weight="bold" />
          </View>
        </PressableScale>
      </Link.AppleZoom>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 160,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  expand: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
