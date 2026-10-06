import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import type MapView from 'react-native-maps';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppMapView, PinMarker } from '@/components/app-map';
import { GoogleSignInButton } from '@/components/google-button';
import { LegalConsent } from '@/components/legal-consent';
import { SymbolView } from '@/components/symbol';
import { Button, PressableScale, Text } from '@/components/ui';
import { colors, fixed, fonts, onScoreColor, radius, scoreColor, spacing, withAlpha } from '@/constants/theme';
import { WELCOME_HEROES, WELCOME_PINS } from '@/constants/welcome-map';
import { usePalette } from '@/hooks/use-palette';
import { formatScore } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { useAppSelector } from '@/store/app-store';

const SLIDES = ['discover', 'trust', 'remember'] as const;

type CameraStop = {
  center: { latitude: number; longitude: number };
  altitude: number;
  zoom: number;
  heading: number;
  pitch: number;
};

/**
 * Her kaydırmada harita şehre biraz daha dalar: Keşfet şehrin tamamı, Güven Anadolu yakası, Hatırla 1,6 km ötede daha
 * alçakta (Selimiye–Harem). Duraklar pinlerin yoğun olduğu yerler. iOS (Apple Haritalar) yüksekliği `altitude`,
 * Android (MapLibre) `zoom` ile okur.
 */
const CAMERAS: Record<(typeof SLIDES)[number], CameraStop> = {
  discover: { center: { latitude: 41.028, longitude: 29.018 }, altitude: 14000, zoom: 12.5, heading: 0, pitch: 0 },
  trust: { center: { latitude: 41.0, longitude: 29.035 }, altitude: 6500, zoom: 13.6, heading: -12, pitch: 35 },
  remember: { center: { latitude: 41.011, longitude: 29.021 }, altitude: 4000, zoom: 14.3, heading: -26, pitch: 45 },
};

/**
 * Geçişler aynı sürede ve aynı yumuşaklıkta; dönüş gidişin tam tersi. Kamera her karede buradan konur
 * (`setCamera`): `animateCamera` iOS'ta süreyi yok sayıp Apple Haritalar'ın kendi hızıyla gidiyordu (Keşfet → Güven
 * yavaş, geri dönüş ve Güven → Hatırla "pıt" diye hızlı).
 */
const FLIGHT_MS = 1800;
/**
 * Keşfet → Güven Apple Haritalar'ın kendi animasyonuyla (`animateCamera`): büyük yakınlaşmada karede bir kamera koymak
 * yeni harita parçaları yüklenirken titriyordu; kullanıcı bu geçişin eski pürüzsüz halini istedi (2026-10-05).
 */
const NATIVE_FLIGHTS = [{ from: 0, to: 1 }];

/** Yumuşak başlar, yumuşak biter; ortası kübik eğriden sakin */
const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

/**
 * Uçuş yolundaki kamera (`u`: 0–1, yumuşatılmış ilerleme). Yükseklik logaritmik: yakınlaşma her anda aynı hızda görünür.
 * Merkez o anki yükseklikle orantılı ilerler: zemin ekranda sabit hızla kayar (yüksekte çok, alçakta az yol). Açı en
 * kısa yönden, eğim doğrusal.
 */
function cameraAt(a: CameraStop, b: CameraStop, u: number): CameraStop {
  const ratio = b.altitude / a.altitude;
  const travel = Math.abs(ratio - 1) < 1e-3 ? u : (Math.pow(ratio, u) - 1) / (ratio - 1);
  const turn = ((((b.heading - a.heading) % 360) + 540) % 360) - 180;
  return {
    center: {
      latitude: a.center.latitude + (b.center.latitude - a.center.latitude) * travel,
      longitude: a.center.longitude + (b.center.longitude - a.center.longitude) * travel,
    },
    altitude: a.altitude * Math.pow(ratio, u),
    zoom: a.zoom + (b.zoom - a.zoom) * u,
    heading: a.heading + turn * u,
    pitch: a.pitch + (b.pitch - a.pitch) * u,
  };
}

/** Android'de harita pini bit eşlem olarak çizilir: içindeki canlandırma görünmez, durağa göre son hali çizilir */
const ANDROID = Platform.OS === 'android';
/** Semtin ek pinleri kamera durağa yaklaşınca belirir; arkadaş simgesi Güven'e inerken gelir */
const PIN_REVEAL_DELAY = 700;
const HERO_IN_DELAY = 650;
/** Arkadaşlar sırayla, aralarında bu kadar arayla süzülür */
const HERO_STAGGER = 140;
/**
 * Güven'deki arkadaşların puanları ve fotoğrafları (`WELCOME_HEROES` sırasıyla). Fotoğraflar App Store görselleri ve
 * tanıtım videosundaki arkadaşların aynısı (docs/app-store-screenshots/reel, puan rozetinden uzak kırpıldı).
 */
const FRIENDS = [
  { score: 10, photo: require('../../../assets/images/onboarding/friend-1.jpg') },
  { score: 9.6, photo: require('../../../assets/images/onboarding/friend-2.jpg') },
  { score: 9.4, photo: require('../../../assets/images/onboarding/friend-3.jpg') },
];

/** Karşılama: harita arka planı + kaydırılabilir tanıtım */
export default function WelcomeRoute() {
  // Hesap açılmış ama kurulum yarım kalmışsa kaldığı yerden devam
  const status = useAppSelector((s) => s.status);
  if (status === 'signedIn') return <Redirect href="/onboarding/ilk-puan" />;
  return <WelcomeScreen />;
}

function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const palette = usePalette();
  const { width, height } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const mapRef = useRef<MapView>(null);
  const camera = useRef(CAMERAS[SLIDES[0]]);
  const frame = useRef(0);
  const flight = useRef(0);
  const detail = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  const { t } = useTranslation();

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const flyTo = async (from: number, to: number) => {
    const target = CAMERAS[SLIDES[to]];
    const map = mapRef.current;
    const id = ++flight.current;
    cancelAnimationFrame(frame.current);
    if (!map) return;
    if (reduceMotion) {
      camera.current = target;
      map.setCamera(target);
      return;
    }
    if (NATIVE_FLIGHTS.some((f) => f.from === from && f.to === to)) {
      camera.current = target;
      map.animateCamera(target, { duration: FLIGHT_MS }); // iOS süreyi yok sayar, Android kullanır
      return;
    }
    // Önceki uçuş (özellikle Apple Haritalar'ın kendi animasyonu) yarıdaysa haritanın o anki kamerasından devam et.
    // Android'deki harita sarmalayıcısında getCamera yok: orada son konulan kamera kullanılır.
    const live = 'getCamera' in map && typeof map.getCamera === 'function' ? await map.getCamera().catch(() => null) : null;
    if (id !== flight.current) return;
    const start =
      live?.center && live.altitude
        ? {
            center: live.center,
            altitude: live.altitude,
            zoom: camera.current.zoom,
            heading: live.heading ?? camera.current.heading,
            pitch: live.pitch ?? camera.current.pitch,
          }
        : camera.current;
    const startedAt = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - startedAt) / FLIGHT_MS, 1);
      camera.current = cameraAt(start, target, easeInOutSine(progress));
      mapRef.current?.setCamera(camera.current);
      if (progress < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  };

  // Slaytlar yalnızca kullanıcı kaydırınca değişir; yarıyı geçince harita yeni yerine süzülmeye başlar
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.min(Math.max(Math.round(e.nativeEvent.contentOffset.x / width), 0), SLIDES.length - 1);
    if (next === page) return;
    haptics.select();
    setPage(next);
    void flyTo(page, next);
    detail.value = reduceMotion
      ? next
      : next > page
        ? withDelay(PIN_REVEAL_DELAY, withTiming(next, { duration: 700 }))
        : withTiming(next, { duration: 350 });
  };

  return (
    <View style={styles.container}>
      {/* Arka plan haritası */}
      <View style={[styles.mapWrap, { height: height * 0.64 }]} pointerEvents="none">
        <AppMapView
          ref={mapRef}
          decorative
          style={StyleSheet.absoluteFill}
          initialCamera={CAMERAS[SLIDES[0]]}
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          showsPointsOfInterests={false}
          showsCompass={false}
          toolbarEnabled={false}>
          {WELCOME_PINS.map((p, i) => (
            <PinMarker
              key={i}
              coordinate={p}
              anchor={{ x: 0.5, y: 1 }}
              redraw={ANDROID && p.stage > 0 ? page >= p.stage : undefined}>
              <ScorePin score={p.score} stage={p.stage} page={page} detail={detail} />
            </PinMarker>
          ))}
          {WELCOME_HEROES.map((hero, i) => (
            <HeroMarker key={i} hero={hero} index={i} stage={page} reduceMotion={reduceMotion} />
          ))}
        </AppMapView>
        <LinearGradient
          // Harita alttaki zemine erir (açık ve koyu görünümde)
          colors={[
            withAlpha(palette.background, 0),
            withAlpha(palette.background, 0.35),
            withAlpha(palette.background, 0.85),
            palette.background,
          ]}
          locations={[0.3, 0.55, 0.8, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        {/* Sayfalar ekranın üstüne kadar uzanır: harita üstünde de kaydırılır, yazı altta durur */}
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={32}
          onScroll={onScroll}
          style={styles.pager}>
          {SLIDES.map((s) => (
            <View key={s} style={[styles.slide, { width }]}>
              <View style={styles.slideBody}>
                <Text style={styles.slideTitle}>{t(`onboarding.slides.${s}Title`)}</Text>
                <Text variant="title3" color={colors.primary} align="center" style={styles.slideText}>
                  {t(`onboarding.slides.${s}Text`)}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.dots}>
          {SLIDES.map((s, i) => (
            <Dot key={s} active={i === page} />
          ))}
        </View>

        <Animated.View entering={FadeIn.delay(400)} style={styles.actions}>
          <Button title={t('onboarding.start')} onPress={() => router.push('/onboarding/eposta')} style={styles.cta} />
          <GoogleSignInButton />
          <PressableScale
            onPress={() => router.push('/onboarding/giris')}
            style={styles.login}>
            <Text variant="callout" color={colors.textSecondary}>
              {t('onboarding.haveAccount')}
              <Text variant="callout" color={colors.primary} style={styles.bold}>
                {t('onboarding.signIn')}
              </Text>
            </Text>
          </PressableScale>
          <LegalConsent variant="welcome" style={styles.legal} />
        </Animated.View>
      </View>
    </View>
  );
}

/**
 * Puana göre renklenen, aşağı sivri uçlu harita pini. `stage` > 0: semtin ek pini; kamera o durağa gelince büyüyerek
 * belirir (`detail` sayfa numarasına doğru canlanır), geri dönünce kaybolur.
 */
function ScorePin({
  score,
  stage,
  page,
  detail,
}: {
  score: number;
  stage: number;
  page: number;
  detail: SharedValue<number>;
}) {
  const color = scoreColor(score);
  const reveal = useAnimatedStyle(() => {
    if (stage === 0) return { opacity: 1, transform: [{ scale: 1 }] };
    const v = Math.min(Math.max(detail.value - stage + 1, 0), 1);
    return { opacity: v, transform: [{ scale: 0.6 + 0.4 * v }] };
  });
  return (
    <Animated.View style={[styles.pinWrap, ANDROID ? { opacity: page >= stage ? 1 : 0 } : reveal]}>
      <View style={[styles.pin, { backgroundColor: color }]}>
        <Text variant="caption" color={onScoreColor(score)} style={styles.pinText}>
          {formatScore(score)}
        </Text>
      </View>
      <View style={[styles.pinTail, { backgroundColor: color }]} />
    </Animated.View>
  );
}

/**
 * Yazıyla uyumlu simgeler: Güven'de arkadaşlar (puanlarıyla), Hatırla'da kaydet. Keşfet → Güven inerken arkadaşlar
 * sırayla yukarıdan süzülerek gelir; Güven → Hatırla'da her biri harita üstünde kendi kaydet simgesinin yerine
 * kayarken ona dönüşür (kamerayla aynı süre ve eğri); geri kaydırınca tersi. Keşfet'te görünmez.
 */
function HeroMarker({
  hero,
  index,
  stage,
  reduceMotion,
}: {
  hero: (typeof WELCOME_HEROES)[number];
  index: number;
  stage: number;
  reduceMotion: boolean;
}) {
  const friend = FRIENDS[index % FRIENDS.length];
  const [coord, setCoord] = useState(stage === 2 ? hero.save : hero.friend);
  const coordRef = useRef(coord);
  const shown = useSharedValue(stage >= 1 ? 1 : 0);
  const morph = useSharedValue(stage === 2 ? 1 : 0);

  useEffect(() => {
    const visible = stage >= 1;
    if (reduceMotion) {
      shown.value = visible ? 1 : 0;
      morph.value = stage === 2 ? 1 : 0;
    } else {
      const arrival = HERO_IN_DELAY + index * HERO_STAGGER;
      shown.value = visible
        ? withDelay(shown.value < 0.5 ? arrival : 0, withSpring(1, { damping: 13, stiffness: 110 }))
        : withTiming(0, { duration: 350 });
      morph.value = withTiming(stage === 2 ? 1 : 0, { duration: FLIGHT_MS, easing: Easing.inOut(Easing.sin) });
    }

    const target = stage === 2 ? hero.save : hero.friend;
    const from = coordRef.current;
    if (from.latitude === target.latitude && from.longitude === target.longitude) return;
    const duration = reduceMotion ? 0 : FLIGHT_MS;
    let frame = 0;
    const startedAt = performance.now();
    const step = (now: number) => {
      const progress = duration ? Math.min((now - startedAt) / duration, 1) : 1;
      const e = easeInOutSine(progress);
      const next = {
        latitude: from.latitude + (target.latitude - from.latitude) * e,
        longitude: from.longitude + (target.longitude - from.longitude) * e,
      };
      coordRef.current = next;
      setCoord(next);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [stage, reduceMotion, shown, morph, hero, index]);

  const heroStyle = useAnimatedStyle(() => ({
    opacity: Math.min(shown.value, 1),
    transform: [{ translateY: (1 - shown.value) * -26 }, { scale: 0.5 + 0.5 * shown.value }],
  }));
  const friendStyle = useAnimatedStyle(() => ({
    opacity: 1 - morph.value,
    transform: [{ scale: 1 - 0.35 * morph.value }],
  }));
  const saveStyle = useAnimatedStyle(() => ({
    opacity: morph.value,
    transform: [{ scale: 0.65 + 0.35 * morph.value }],
  }));

  return (
    <PinMarker coordinate={coord} anchor={{ x: 0.5, y: 0.5 }} zIndex={10} redraw={ANDROID ? stage : undefined}>
      <Animated.View style={[styles.hero, ANDROID ? { opacity: stage >= 1 ? 1 : 0 } : heroStyle]}>
        <Animated.View style={[styles.heroLayer, ANDROID ? { opacity: stage === 2 ? 0 : 1 } : friendStyle]}>
          <View style={styles.heroShadow}>
            <View style={[styles.heroCircle, styles.friendCircle]}>
              <Image source={friend.photo} style={styles.friendPhoto} fadeDuration={0} />
            </View>
          </View>
          <View style={[styles.heroScore, { backgroundColor: scoreColor(friend.score) }]}>
            <Text style={[styles.heroScoreText, { color: onScoreColor(friend.score) }]}>
              {formatScore(friend.score)}
            </Text>
          </View>
        </Animated.View>
        <Animated.View style={[styles.heroLayer, ANDROID ? { opacity: stage === 2 ? 1 : 0 } : saveStyle]}>
          <View style={[styles.heroShadow, styles.heroCircle, styles.saveCircle]}>
            <SymbolView name="bookmark.fill" size={21} tintColor={fixed.white} />
          </View>
        </Animated.View>
      </Animated.View>
    </PinMarker>
  );
}

function Dot({ active }: { active: boolean }) {
  const style = useAnimatedStyle(() => ({
    width: withSpring(active ? 22 : 8, { duration: 300 }),
    opacity: withSpring(active ? 1 : 0.25, { duration: 300 }),
  }));
  return <Animated.View style={[styles.dot, style]} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  mapWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  pinWrap: {
    alignItems: 'center',
    shadowColor: fixed.navy,
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  pin: {
    minWidth: 40,
    height: 28,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinTail: {
    width: 10,
    height: 10,
    marginTop: -6,
    transform: [{ rotate: '45deg' }],
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.background,
  },
  pinText: {
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  hero: {
    width: 80,
    height: 64,
  },
  heroLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroShadow: {
    borderRadius: radius.full,
    shadowColor: fixed.navy,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  heroCircle: {
    width: 50,
    height: 50,
    borderRadius: radius.full,
    borderWidth: 3,
    borderColor: fixed.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  saveCircle: {
    backgroundColor: fixed.navy,
    overflow: 'visible',
  },
  friendCircle: {
    backgroundColor: colors.surface,
  },
  friendPhoto: {
    width: '100%',
    height: '100%',
  },
  heroScore: {
    position: 'absolute',
    top: 0,
    right: 2,
    minWidth: 36,
    height: 23,
    paddingHorizontal: 6,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: fixed.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroScoreText: {
    fontSize: 11.5,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  bottom: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  pager: {
    flex: 1,
  },
  slide: {
    justifyContent: 'flex-end',
  },
  // Başlıklar her sayfada aynı yükseklikte (metin kısa da olsa)
  slideBody: {
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xxl,
    minHeight: 150,
  },
  slideTitle: {
    fontFamily: fonts.serif,
    fontSize: 44,
    lineHeight: 52,
    fontWeight: '800',
    color: colors.primary,
  },
  slideText: {
    fontWeight: '500',
    lineHeight: 26,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  dot: {
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  actions: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  cta: {
    borderRadius: radius.full,
    height: 56,
  },
  login: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  bold: {
    fontWeight: '700',
  },
  legal: {
    paddingHorizontal: spacing.sm,
    lineHeight: 17,
  },
});
