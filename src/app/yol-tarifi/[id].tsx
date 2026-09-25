import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassSurface } from '@/components/glass-surface';
import { SegmentedControl } from '@/components/segmented-control';
import { Button, PressableScale, Text } from '@/components/ui';
import { cuisineLabel } from '@/constants/cuisines';
import { colors, hitSlop, radius, spacing } from '@/constants/theme';
import { usePlace } from '@/data/entities';
import { currentLocale } from '@/i18n';
import {
  ARRIVED_M,
  arrivalTime,
  currentStep,
  distanceToRoute,
  fetchEta,
  fetchRoute,
  formatDuration,
  formatMeters,
  inAppDirections,
  meters,
  OFF_ROUTE_M,
  openInAppleMaps,
  remainingMeters,
  type Route,
  type TravelMode,
} from '@/lib/directions';
import { distanceKm, formatDistance, type Coords } from '@/lib/geo';
import { haptics } from '@/lib/haptics';
import { useUserLocation } from '@/lib/location';

const MODE_ICONS: Record<TravelMode, SFSymbol> = {
  walking: 'figure.walk',
  driving: 'car.fill',
  transit: 'tram.fill',
};

/** Rota yeniden hesaplanırken en az bu kadar beklenir (sürekli istek atılmasın) */
const REROUTE_COOLDOWN_MS = 15_000;

/**
 * Mekân haritası ve uygulama içi yol tarifi.
 * Önizleme: rota çizgisi, süre, mesafe, varış saati ve adımlar (yürüyerek / arabayla; toplu taşımada süre).
 * Başlat: harita konumu takip eder, sıradaki talimat üstte yazılı ve sesli okunur, rotadan çıkınca yeniden hesaplanır.
 */
export default function DirectionsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const place = usePlace(id);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  const location = useUserLocation(true);
  const [mode, setMode] = useState<TravelMode>('walking');
  /** Navigasyonda rotadan çıkınca yeni başlangıç */
  const [rerouteFrom, setRerouteFrom] = useState<Coords | null>(null);
  const [showSteps, setShowSteps] = useState(false);
  const [navigating, setNavigating] = useState(false);
  // Rota başlangıcı: kullanıcının konumu (sorgu anahtarı ~10 m'ye yuvarlı; küçük oynamalarda yeniden hesaplanmaz)
  const origin = rerouteFrom ?? location.coords;

  const target = place ? { latitude: place.latitude, longitude: place.longitude } : null;
  const routeMode = mode === 'transit' ? null : mode;

  const route = useQuery({
    queryKey: ['route', id, routeMode, origin?.latitude.toFixed(4), origin?.longitude.toFixed(4)],
    queryFn: () => fetchRoute(origin!, target!, routeMode!),
    enabled: inAppDirections && !!origin && !!target && !!routeMode,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const transitEta = useQuery({
    queryKey: ['eta', id, 'transit', origin?.latitude.toFixed(3), origin?.longitude.toFixed(3)],
    queryFn: () => fetchEta(origin!, target!, 'transit'),
    enabled: inAppDirections && mode === 'transit' && !!origin && !!target,
    staleTime: 5 * 60_000,
  });

  // Rota gelince harita rotayı ve paneli kapsayacak şekilde yakınlaşır
  useEffect(() => {
    if (!route.data || navigating) return;
    mapRef.current?.fitToCoordinates(route.data.coordinates, {
      edgePadding: { top: insets.top + 80, right: 48, bottom: 360, left: 48 },
      animated: true,
    });
  }, [route.data, navigating, insets.top]);

  if (!place || !target) return <View style={styles.container} />;

  const modes = (['walking', 'driving', 'transit'] as const).map((key) => ({ key, label: t(`directions.modes.${key}`) }));
  const summary =
    mode === 'transit'
      ? transitEta.data
        ? { duration: transitEta.data, distance: undefined }
        : undefined
      : route.data && { duration: route.data.duration, distance: route.data.distance };
  const loading =
    location.status === 'loading' ||
    (!!origin && inAppDirections && (mode === 'transit' ? transitEta.isPending : route.isPending));

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{ ...target, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
        showsUserLocation
        showsCompass={false}
        pitchEnabled
        rotateEnabled>
        {route.data && mode !== 'transit' && (
          <Polyline
            coordinates={route.data.coordinates}
            strokeColor={colors.primary}
            strokeWidth={6}
            lineCap="round"
            lineJoin="round"
          />
        )}
        <Marker coordinate={target}>
          <View style={styles.pin}>
            <SymbolView name="fork.knife" tintColor={colors.onPrimary} size={14} />
          </View>
        </Marker>
      </MapView>

      {navigating && route.data ? (
        <Navigation
          // Rota yeniden hesaplanınca navigasyon yeni rotayla baştan başlar
          key={`${route.data.distance}-${route.data.coordinates.length}`}
          route={route.data}
          target={target}
          mode={mode}
          mapRef={mapRef}
          onReroute={setRerouteFrom}
          onEnd={() => setNavigating(false)}
        />
      ) : (
        <>
          <PressableScale
            onPress={() => router.back()}
            hitSlop={hitSlop}
            style={[styles.back, { top: insets.top + spacing.sm }]}
            accessibilityLabel={t('common.back')}>
            <GlassSurface interactive style={styles.backGlass}>
              <SymbolView name="chevron.left" tintColor={colors.primary} size={18} weight="semibold" />
            </GlassSurface>
          </PressableScale>

          <Animated.View entering={FadeInDown.springify().damping(18)} style={[styles.panelWrap, { bottom: insets.bottom + spacing.sm }]}>
            <GlassSurface style={styles.panel}>
              <View style={styles.placeRow}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="headline" numberOfLines={1}>
                    {place.name}
                  </Text>
                  <Text variant="footnote" color={colors.textSecondary} numberOfLines={1}>
                    {cuisineLabel(place.cuisine)} · {place.neighborhood || place.district}
                  </Text>
                </View>
              </View>

              <SegmentedControl options={modes} value={mode} onChange={setMode} style={styles.segment} />

              {location.status === 'denied' || location.status === 'undetermined' ? (
                <View style={styles.notice}>
                  <Text variant="subhead" color={colors.textSecondary}>
                    {t('directions.locationOff')}
                  </Text>
                  <Button title={t('directions.openSettings')} icon="gear" onPress={() => Linking.openSettings()} />
                </View>
              ) : !inAppDirections ? (
                <Fallback target={target} name={place.name} mode={mode} origin={origin} />
              ) : loading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={colors.primary} />
                  <Text variant="subhead" color={colors.textSecondary}>
                    {origin ? t('directions.calculating') : t('directions.locating')}
                  </Text>
                </View>
              ) : summary ? (
                <Animated.View entering={FadeIn} style={styles.summary}>
                  <View style={styles.summaryRow}>
                    <SymbolView name={MODE_ICONS[mode]} tintColor={colors.primary} size={22} />
                    <Text variant="title2" color={colors.primary}>
                      {formatDuration(summary.duration)}
                    </Text>
                    <Text variant="subhead" color={colors.textSecondary} style={{ flex: 1 }} numberOfLines={1}>
                      {[summary.distance !== undefined ? formatMeters(summary.distance) : null, t('directions.arrival', { time: arrivalTime(summary.duration) })]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>

                  {mode === 'transit' ? (
                    <>
                      <Text variant="footnote" color={colors.textSecondary}>
                        {t('directions.transitNote')}
                      </Text>
                      <Button
                        title={t('directions.transitSteps')}
                        icon="tram.fill"
                        onPress={() => openInAppleMaps(target, place.name, 'transit')}
                      />
                    </>
                  ) : (
                    route.data && (
                      <>
                        <View style={styles.buttons}>
                          <Button
                            title={t('directions.start')}
                            icon="location.north.fill"
                            onPress={() => {
                              haptics.success();
                              setShowSteps(false);
                              setNavigating(true);
                            }}
                            style={{ flex: 1 }}
                          />
                          <Button
                            title=""
                            icon={showSteps ? 'list.bullet.below.rectangle' : 'list.bullet'}
                            variant="secondary"
                            onPress={() => setShowSteps((s) => !s)}
                            style={styles.iconButton}
                            accessibilityLabel={showSteps ? t('directions.hideSteps') : t('directions.steps')}
                          />
                        </View>
                        {showSteps && <StepList route={route.data} />}
                      </>
                    )
                  )}
                </Animated.View>
              ) : (
                <View style={styles.notice}>
                  <Text variant="subhead" color={colors.textSecondary}>
                    {t('directions.noRoute')}
                  </Text>
                  <Button
                    title={t('directions.openInMaps')}
                    icon="map.fill"
                    onPress={() => openInAppleMaps(target, place.name, mode)}
                  />
                </View>
              )}
            </GlassSurface>
          </Animated.View>
        </>
      )}
    </View>
  );
}

/** Adım adım talimatlar */
function StepList({ route }: { route: Route }) {
  return (
    <ScrollView style={styles.steps} contentContainerStyle={{ gap: spacing.md }} showsVerticalScrollIndicator={false}>
      {route.steps.map((step, i) => (
        <View key={i} style={styles.stepRow}>
          <View style={styles.stepDot}>
            <Text variant="caption" color={colors.onPrimary} style={styles.bold}>
              {i + 1}
            </Text>
          </View>
          <Text variant="subhead" style={{ flex: 1 }}>
            {step.instruction}
          </Text>
          <Text variant="footnote" color={colors.textSecondary}>
            {formatMeters(step.distance)}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

/** Yerel modül yoksa (Expo Go): kuş uçuşu mesafe ve Apple Haritalar */
function Fallback({ target, name, mode, origin }: { target: Coords; name: string; mode: TravelMode; origin: Coords | null }) {
  const { t } = useTranslation();
  return (
    <View style={styles.notice}>
      {origin && (
        <Text variant="subhead" color={colors.textSecondary}>
          {t('directions.unavailable', { distance: formatDistance(distanceKm(origin, target)) })}
        </Text>
      )}
      <Button title={t('directions.openInMaps')} icon="map.fill" onPress={() => openInAppleMaps(target, name, mode)} />
    </View>
  );
}

/**
 * Navigasyon: konumu izler, haritayı yöne göre çevirir, sıradaki talimatı yazar ve sesli okur,
 * rotadan çıkınca yeniden hesaplatır, varınca biter. Ekran açık kalır.
 */
function Navigation({
  route,
  target,
  mode,
  mapRef,
  onReroute,
  onEnd,
}: {
  route: Route;
  target: Coords;
  mode: TravelMode;
  mapRef: React.RefObject<MapView | null>;
  onReroute: (from: Coords) => void;
  onEnd: () => void;
}) {
  useKeepAwake();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [position, setPosition] = useState<Coords | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [muted, setMuted] = useState(false);
  const [arrived, setArrived] = useState(false);
  // Konum geri çağrısı en güncel değerleri okusun diye
  const progress = useRef({ stepIndex: 0, arrived: false, muted: false, lastReroute: 0 });

  const say = (text: string) => {
    if (!progress.current.muted) Speech.speak(text, { language: currentLocale() });
  };

  useEffect(() => {
    // İlk talimat hemen okunur
    const first = route.steps[0];
    if (first) say(first.instruction);

    /** Her konumda: haritayı takip ettir, adımı ilerlet, varışı ve rotadan çıkmayı kontrol et */
    const onPosition = ({ coords }: Location.LocationObject) => {
      const here = { latitude: coords.latitude, longitude: coords.longitude };
      const state = progress.current;
      setPosition(here);
      mapRef.current?.animateCamera(
        {
          center: here,
          heading: coords.heading !== null && coords.heading >= 0 ? coords.heading : undefined,
          pitch: 50,
          zoom: mode === 'walking' ? 18 : 17,
        },
        { duration: 600 },
      );
      if (state.arrived) return;

      if (meters(here, target) < ARRIVED_M) {
        state.arrived = true;
        setArrived(true);
        haptics.success();
        say(t('directions.arrived'));
        return;
      }
      const next = currentStep(route.steps, here, state.stepIndex);
      if (next !== state.stepIndex) {
        state.stepIndex = next;
        setStepIndex(next);
        haptics.tap();
        const step = route.steps[next];
        if (step) say(step.instruction);
      }
      if (distanceToRoute(here, route.coordinates) > OFF_ROUTE_M && Date.now() - state.lastReroute > REROUTE_COOLDOWN_MS) {
        state.lastReroute = Date.now();
        say(t('directions.rerouting'));
        onReroute(here);
      }
    };

    let subscription: Location.LocationSubscription | undefined;
    let active = true;
    Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 3 }, onPosition).then(
      (s) => {
        if (active) subscription = s;
        else s.remove();
      },
    );
    return () => {
      active = false;
      subscription?.remove();
      Speech.stop();
    };
    // Rota değişince bileşen yeniden kurulur (key); diğerleri sabit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const step = route.steps[Math.min(stepIndex, route.steps.length - 1)];
  const toStep = position && step ? meters(position, step.end) : step?.distance;
  const remaining = position ? remainingMeters(route.steps, position, stepIndex) : route.distance;
  const remainingTime = route.distance > 0 ? (route.duration * remaining) / route.distance : 0;

  return (
    <>
      <Animated.View entering={FadeInDown} style={[styles.banner, { top: insets.top + spacing.sm }]}>
        <View style={styles.bannerInner}>
          <SymbolView
            name={arrived ? 'flag.checkered' : 'arrow.triangle.turn.up.right.diamond.fill'}
            tintColor={colors.onPrimary}
            size={30}
          />
          <View style={{ flex: 1, gap: 2 }}>
            {!arrived && toStep !== undefined && (
              <Text variant="title2" color={colors.onPrimary}>
                {formatMeters(toStep)}
              </Text>
            )}
            <Text variant="headline" color={colors.onPrimary} numberOfLines={3}>
              {arrived ? t('directions.arrived') : (step?.instruction ?? '')}
            </Text>
          </View>
        </View>
      </Animated.View>

      <View style={[styles.panelWrap, { bottom: insets.bottom + spacing.sm }]}>
        <GlassSurface style={[styles.panel, styles.navPanel]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="title3" color={colors.primary}>
              {arrived ? t('directions.arrivedShort') : formatDuration(remainingTime)}
            </Text>
            {!arrived && (
              <Text variant="footnote" color={colors.textSecondary}>
                {formatMeters(remaining)} · {t('directions.arrival', { time: arrivalTime(remainingTime) })}
              </Text>
            )}
          </View>
          <PressableScale
            onPress={() => {
              if (!muted) Speech.stop();
              progress.current.muted = !muted;
              setMuted(!muted);
            }}
            hitSlop={hitSlop}
            style={styles.roundButton}
            accessibilityLabel={muted ? t('directions.unmute') : t('directions.mute')}>
            <SymbolView name={muted ? 'speaker.slash.fill' : 'speaker.wave.2.fill'} tintColor={colors.primary} size={18} />
          </PressableScale>
          <Button title={t('directions.end')} variant={arrived ? 'primary' : 'secondary'} size="sm" onPress={onEnd} style={styles.endButton} />
        </GlassSurface>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.mapWater,
  },
  bold: {
    fontWeight: '700',
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
  back: {
    position: 'absolute',
    left: spacing.lg,
  },
  backGlass: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelWrap: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
  },
  panel: {
    padding: spacing.lg,
    gap: spacing.md,
    borderRadius: 28,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  segment: {
    paddingHorizontal: 0,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  notice: {
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  summary: {
    gap: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconButton: {
    width: 52,
    paddingHorizontal: 0,
    gap: 0,
  },
  steps: {
    maxHeight: 220,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  banner: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
  },
  bannerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: 24,
    backgroundColor: colors.primary,
    boxShadow: '0 8px 24px rgba(15, 30, 61, 0.3)',
  },
  navPanel: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  roundButton: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endButton: {
    paddingHorizontal: spacing.lg,
  },
});
