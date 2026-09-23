import { SymbolView } from 'expo-symbols';
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Avatar, PlaceImage, Text } from '@/components/ui';
import { colors, radius, scoreColor, spacing } from '@/constants/theme';
import { placeById, userById } from '@/data/mock';
import { formatScore } from '@/lib/format';

/* ---------- Süzülme animasyonu ---------- */

/** Öğeyi yavaşça yukarı-aşağı süzdürür; her öğeye farklı gecikme verilir */
function Floating({
  delay = 0,
  distance = 6,
  duration = 2400,
  style,
  children,
}: {
  delay?: number;
  distance?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const y = useSharedValue(0);
  useEffect(() => {
    const ease = Easing.inOut(Easing.sin);
    y.set(
      withDelay(
        delay,
        withRepeat(
          withSequence(withTiming(-distance, { duration, easing: ease }), withTiming(distance, { duration, easing: ease })),
          -1,
          true,
        ),
      ),
    );
  }, [delay, distance, duration, y]);
  const animated = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/* ---------- 1. Sırala: sıralı mekân kartları ---------- */

const RANKED = [
  { id: 'p1', score: 9.4 },
  { id: 'p7', score: 8.7 },
  { id: 'p4', score: 8.1 },
];

export function RankScene() {
  return (
    <View style={styles.scene}>
      {RANKED.map((r, i) => {
        const place = placeById(r.id);
        if (!place) return null;
        return (
          <Floating key={r.id} delay={i * 350} style={[styles.rankCard, { marginLeft: i * 18, opacity: 1 - i * 0.12 }]}>
            <Text variant="title3" color={colors.primary} style={styles.rankNumber}>
              {i + 1}
            </Text>
            <PlaceImage uri={place.photoUrl} style={styles.rankThumb} />
            <View style={{ flex: 1 }}>
              <Text variant="subhead" numberOfLines={1} style={styles.bold}>
                {place.name}
              </Text>
              <Text variant="caption" color={colors.textSecondary}>
                {place.cuisine} · {place.neighborhood}
              </Text>
            </View>
            <ScoreChip score={r.score} />
          </Floating>
        );
      })}
    </View>
  );
}

/* ---------- 2. Güven: arkadaş puanları ---------- */

const FRIENDS = [
  { userId: 'u1', score: 9.6, style: { top: '6%', left: '4%' } },
  { userId: 'u3', score: 9.1, style: { top: '38%', right: '2%' } },
  { userId: 'u5', score: 8.8, style: { bottom: '6%', left: '10%' } },
] as const;

export function TrustScene() {
  const place = placeById('p6');
  return (
    <View style={styles.scene}>
      <Floating distance={4} style={styles.trustCard}>
        <PlaceImage uri={place?.photoUrl} style={styles.trustImage} />
        <View style={styles.trustInfo}>
          <Text variant="headline" numberOfLines={1}>
            {place?.name}
          </Text>
          <View style={styles.row}>
            <SymbolView name="person.2.fill" tintColor={colors.primary} size={13} />
            <Text variant="caption" color={colors.primary} style={styles.bold}>
              3 arkadaşın · ort. 9,2
            </Text>
          </View>
        </View>
      </Floating>
      {FRIENDS.map((f, i) => {
        const user = userById(f.userId);
        if (!user) return null;
        return (
          <Floating key={f.userId} delay={300 + i * 400} distance={8} style={[styles.bubble, f.style]}>
            <Avatar uri={user.avatarUrl} name={user.name} size={30} />
            <Text variant="caption" style={styles.bold}>
              {user.name.split(' ')[0]}
            </Text>
            <ScoreChip score={f.score} small />
          </Floating>
        );
      })}
    </View>
  );
}

/* ---------- 3. Keşfet: yakındaki popüler mekânlar ---------- */

const NEARBY = ['p1', 'p2', 'p5', 'p13', 'p18'] as const;

export function DiscoverScene() {
  const places = NEARBY.flatMap((id) => placeById(id) ?? []);
  return (
    <View style={styles.scene}>
      <Floating distance={3} style={styles.mapCard}>
        <MapView
          style={StyleSheet.absoluteFill}
          initialRegion={{ latitude: 40.988, longitude: 29.028, latitudeDelta: 0.028, longitudeDelta: 0.028 }}
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          showsPointsOfInterests={false}
          pointerEvents="none">
          {places.map((p, i) => (
            <Marker key={p.id} coordinate={p}>
              <View style={[styles.pin, { backgroundColor: scoreColor(9.4 - i * 0.4) }]}>
                <Text variant="caption" color={colors.onPrimary} style={styles.pinText}>
                  {formatScore(9.4 - i * 0.4)}
                </Text>
              </View>
            </Marker>
          ))}
        </MapView>
        <View style={styles.locationChip}>
          <SymbolView name="location.fill" tintColor={colors.onPrimary} size={11} />
          <Text variant="caption" color={colors.onPrimary} style={styles.bold}>
            Kadıköy · 3 km
          </Text>
        </View>
      </Floating>
      <Floating delay={500} distance={5} style={styles.nearbyCard}>
        <SymbolView name="flame.fill" tintColor={colors.primary} size={16} />
        <Text variant="footnote" style={[styles.bold, { flex: 1 }]} numberOfLines={1}>
          Bu hafta yakınında en popüler
        </Text>
        <ScoreChip score={9.4} small />
      </Floating>
    </View>
  );
}

/* ---------- Ortak ---------- */

function ScoreChip({ score, small }: { score: number; small?: boolean }) {
  return (
    <View style={[styles.chip, small && styles.chipSmall, { backgroundColor: scoreColor(score) }]}>
      <Text variant={small ? 'caption' : 'footnote'} color={colors.onPrimary} style={styles.chipText}>
        {formatScore(score)}
      </Text>
    </View>
  );
}

const cardShadow = {
  shadowColor: colors.shadow,
  shadowOpacity: 0.18,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 10 },
} as const;

const styles = StyleSheet.create({
  scene: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  bold: {
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  rankCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.background,
    ...cardShadow,
  },
  rankNumber: {
    width: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  rankThumb: {
    width: 44,
    height: 44,
    borderRadius: radius.button,
  },
  trustCard: {
    alignSelf: 'center',
    width: '72%',
    borderRadius: radius.card,
    backgroundColor: colors.background,
    overflow: 'hidden',
    ...cardShadow,
  },
  trustImage: {
    width: '100%',
    aspectRatio: 1.35,
  },
  trustInfo: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  bubble: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.xs,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    ...cardShadow,
  },
  mapCard: {
    height: '72%',
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    ...cardShadow,
  },
  locationChip: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  nearbyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.background,
    ...cardShadow,
  },
  pin: {
    minWidth: 34,
    height: 24,
    paddingHorizontal: spacing.xs + 2,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinText: {
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  chip: {
    minWidth: 40,
    height: 26,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSmall: {
    minWidth: 34,
    height: 22,
  },
  chipText: {
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
