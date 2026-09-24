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
import { colors, radius, spacing } from '@/constants/theme';
import { useUser } from '@/data/entities';
import { useVisitedPlaces } from '@/hooks/use-visited-places';
import { haptics } from '@/lib/haptics';
import { isMe } from '@/lib/session';
import { initialCity, ISTANBUL_REGION, regionFor, visitedCities, type Region, type VisitedPlace } from '@/lib/visited';

/** Mekâna yakınlaşınca kullanılan bölge boyutu */
const PLACE_DELTA = 0.012;

/** Şehir seçicide "Tümü" */
const ALL = '*';

const openPost = (id: string) => router.push({ pathname: '/gonderi/[id]', params: { id } });
const openPlace = (id: string) => router.push({ pathname: '/mekan/[id]', params: { id } });

/**
 * Profildeki küçük haritanın büyümüş hâli: kişinin gittiği yerler.
 * Bir yere dokununca o yerdeki gönderileri çıkar; gönderiye dokununca açılır.
 */
export default function VisitedPlacesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const user = useUser(id);
  const mine = isMe(id);
  const { items, loading } = useVisitedPlaces(id);

  const cities = useMemo(() => visitedCities(items), [items]);
  const start = initialCity(cities);
  const [city, setCity] = useState<string>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeCity = city ?? start?.name;
  const selected = items.find((i) => i.place.id === selectedId);

  const title = mine ? 'Gittiğim yerler' : user ? `${user.name.split(' ')[0]} nerelere gitti` : '';

  const moveTo = (region: Region | undefined) => region && mapRef.current?.animateToRegion(region, 450);

  const chooseCity = (name: string) => {
    haptics.select();
    setCity(name);
    setSelectedId(null);
    moveTo(name === ALL ? regionFor(items.map((i) => i.place), 0.2) : cities.find((c) => c.name === name)?.region);
  };

  const select = ({ place }: VisitedPlace) => {
    haptics.select();
    setSelectedId(place.id);
    if (activeCity !== ALL) setCity(place.city);
    moveTo({
      latitude: place.latitude,
      longitude: place.longitude,
      latitudeDelta: PLACE_DELTA,
      longitudeDelta: PLACE_DELTA,
    });
  };

  if (loading && !items.length) return <LoadingView style={styles.container} />;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title }} />
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={start?.region ?? ISTANBUL_REGION}
        showsPointsOfInterests={false}
        onPress={() => setSelectedId(null)}>
        {items.map((item) => (
          <Marker
            key={item.place.id}
            coordinate={{ latitude: item.place.latitude, longitude: item.place.longitude }}
            // Seçili pin öne çıksın
            zIndex={item.place.id === selectedId ? 1 : 0}
            onPress={(e) => {
              e.stopPropagation();
              select(item);
            }}>
            <MapPin score={item.score} active={item.place.id === selectedId} unscored="visited" />
          </Marker>
        ))}
      </MapView>

      {/* Şehirler (birden fazla şehir varsa) */}
      {cities.length > 1 && (
        <View style={styles.citiesWrap} pointerEvents="box-none">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cities}>
            <CityChip label="Tümü" count={items.length} active={activeCity === ALL} onPress={() => chooseCity(ALL)} />
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

      {selected && (
        <Animated.View
          key={selected.place.id}
          entering={FadeInDown.springify()}
          exiting={FadeOutDown.duration(150)}
          style={[styles.cardWrap, { bottom: insets.bottom + spacing.lg }]}>
          <PlaceCard item={selected} />
        </Animated.View>
      )}
    </View>
  );
}

/**
 * Seçilen yer: tek gönderi varsa dokununca o gönderi açılır;
 * birden fazlaysa küçük fotoğraflardan biri seçilir; hiç yoksa mekân sayfası açılır.
 */
function PlaceCard({ item }: { item: VisitedPlace }) {
  const { place, score, posts } = item;
  const [latest] = posts;
  const cover = latest?.thumbs[0] ?? place.thumbUrl ?? place.photoUrl;

  return (
    <GlassSurface interactive style={styles.card}>
      <PressableScale
        onPress={() => (latest ? openPost(latest.id) : openPlace(place.id))}
        scaleTo={0.98}
        style={styles.cardMain}>
        <PlaceImage uri={cover} style={styles.cardImage} />
        <View style={styles.cardText}>
          <Text variant="headline" numberOfLines={1}>
            {place.name}
          </Text>
          <Text variant="footnote" color={colors.textSecondary} numberOfLines={1}>
            {place.cuisine} · {place.neighborhood || place.district}
          </Text>
          <View style={styles.cardLink}>
            <Text variant="footnote" color={colors.primary} style={styles.bold}>
              {posts.length === 0 ? 'Mekânı gör' : posts.length === 1 ? 'Gönderiyi gör' : `${posts.length} gönderi`}
            </Text>
            <SymbolView name="chevron.right" tintColor={colors.primary} size={11} weight="bold" />
          </View>
        </View>
        {score !== undefined && <ScoreBadge score={score} />}
      </PressableScale>

      {posts.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
          {posts.map((post) => (
            <PressableScale key={post.id} onPress={() => openPost(post.id)} scaleTo={0.94} style={styles.thumb}>
              {post.thumbs[0] ? (
                <PlaceImage uri={post.thumbs[0]} style={StyleSheet.absoluteFill} />
              ) : (
                <Text variant="caption" numberOfLines={3} style={styles.thumbText}>
                  {post.caption}
                </Text>
              )}
            </PressableScale>
          ))}
        </ScrollView>
      )}
    </GlassSurface>
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
    top: spacing.sm,
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
  cardWrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
  },
  card: {
    gap: spacing.md,
    padding: spacing.md,
  },
  cardMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  cardImage: {
    width: 64,
    height: 64,
    borderRadius: radius.button,
  },
  cardText: {
    flex: 1,
    gap: 2,
  },
  cardLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: 2,
  },
  thumbs: {
    gap: spacing.sm,
  },
  thumb: {
    width: 64,
    height: 80,
    borderRadius: radius.button,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  thumbText: {
    padding: spacing.xs,
  },
});
