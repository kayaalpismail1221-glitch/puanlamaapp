import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import { Component, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  makeMutable,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { LaunchText } from '@/components/launch-text';
import { LAUNCH, LAUNCH_REVEAL_TOTAL, type LaunchPhase } from '@/constants/launch';
import { fixed } from '@/constants/theme';

/**
 * Açılış animasyonu. Sistem açılış ekranı "Expeat" yazısını hemen gösterir (her görünümde lacivert üstüne beyaz,
 * ikondaki gibi); bu örtü aynı kareyle devralır: yazının görseli yüklenince sistem ekranı kalkar (yüklenmeden kalkarsa yazı bir
 * an kaybolup beyaz bir parlama gibi görünüyordu). Uygulama altta yerleşene kadar yazı sabit kalır (ilk çizimle aynı
 * anda başlayan yakınlaşma takılıyordu); sonra yazı yavaşça büyür ve büyürken önceden bulanıklaştırılmış kopyasına
 * geçerek erir, ardından ortada slogan harf harf bulanıktan nete gelir. Slogan okunacak kadar kaldıktan ve uygulama
 * hazır olunca (`markLaunchReady`) örtü solar, uygulama hafif geriden yerine oturur (`LaunchStage`). Yalnızca soğuk
 * açılışta, bir kez. Zamanlama ve ölçüler: constants/launch.
 */

const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
/** Yakınlaşma: yavaş başlar, ortada hızlanır, yavaşça biter */
const EASE_ZOOM = Easing.bezier(0.45, 0.05, 0.55, 0.95);

/**
 * Sistem açılış ekranının devri. Lacivert açılış ekranlı derlemelerde (iOS 1.0.5 ve sonrası) sistem ekranı bu örtünün
 * ilk karesiyle aynı: anında devralınır (yumuşak geçiş iki yazıyı üst üste gösterirdi). Daha eski derlemelerde sistem
 * ekranı farklı (beyaz ya da koyu zeminde "Expeat", en eskilerde boş beyaz): örtüye yumuşakça geçer (iOS).
 */
const LEGACY_SPLASH_RUNTIMES = ['1.0.0', '1.0.1', '1.0.2', '1.0.3', '1.0.4', 'android-2'];
SplashScreen.setOptions({ fade: LEGACY_SPLASH_RUNTIMES.includes(Updates.runtimeVersion ?? ''), duration: 300 });

/**
 * Sistem açılış ekranıyla aynı renk ve görseller (app.json → expo-splash-screen): telefonun ve uygulamanın
 * görünümünden bağımsız, lacivert üstüne beyaz. Uygulama içindeki açık/koyu görünüm örtü kalktıktan sonra görünür.
 * `blur`: yazının erirken geçtiği bulanık kopyası.
 */
const SCHEME = {
  background: fixed.navy,
  ink: fixed.white,
  wordmark: require('../../assets/images/splash-wordmark.png'),
  blur: require('../../assets/images/splash-wordmark-blur.png'),
} as const;

const WORDMARK_WIDTH = LAUNCH.wordmarkWidth;
const WORDMARK_HEIGHT = WORDMARK_WIDTH / LAUNCH.wordmarkAspect;
/** Bulanık kopya her yandan aynı kenar payıyla büyük (scripts/generate-icons.py → BLUR_MARGIN) */
const BLUR_MARGIN = WORDMARK_WIDTH * LAUNCH.blurMargin;

/** 0–1 aralığına sıkıştırılmış yumuşak geçiş */
function smooth(x: number) {
  'worklet';
  const t = Math.min(Math.max(x, 0), 1);
  return t * t * (3 - 2 * t);
}

let ready = false;
const listeners = new Set<() => void>();

/** Uygulama altta çizilmeye hazır (sistem açılış ekranının eskiden kapandığı an): animasyon başlar */
export function markLaunchReady() {
  if (ready) return;
  ready = true;
  listeners.forEach((fn) => fn());
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

const useLaunchReady = () => useSyncExternalStore(subscribe, () => ready);

/**
 * Örtünün altında ne zaman iş yapılabileceği: `holding` slogan tamamlanıp ekranda beklerken (animasyon durgun, ağır
 * iş takılma yaratmaz), `exiting` örtü kalkmaya başlarken, `done` örtü yokken. Ör. harita sekmesi bu arada önceden
 * çizilir (bkz. app/(tabs)/_layout).
 */
export type LaunchMoment = 'running' | 'holding' | 'exiting' | 'done';

let moment: LaunchMoment = 'running';
const momentListeners = new Set<(m: LaunchMoment) => void>();

function setMoment(next: LaunchMoment) {
  if (moment === next || moment === 'done') return;
  moment = next;
  momentListeners.forEach((fn) => fn(next));
}

export const getLaunchMoment = () => moment;

export function subscribeLaunchMoment(fn: (m: LaunchMoment) => void) {
  momentListeners.add(fn);
  return () => {
    momentListeners.delete(fn);
  };
}

/** Uygulamanın ölçeği: örtünün altında hafif geride (0), örtü kalkarken yerine oturur (1) */
const stage = makeMutable(0);

/** Uygulamanın tamamını sarar: örtü kalkarken içerik hafif geriden yerine oturur */
export function LaunchStage({ children }: { children: ReactNode }) {
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: LAUNCH.stageFrom + (1 - LAUNCH.stageFrom) * stage.value }],
  }));
  return <Animated.View style={[styles.stage, style]}>{children}</Animated.View>;
}

function Intro() {
  const appReady = useLaunchReady();
  const reduceMotion = useReducedMotion();
  const [laidOut, setLaidOut] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [held, setHeld] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [done, setDone] = useState(false);
  const zoom = useSharedValue(0);
  const dissolve = useSharedValue(0);
  const fade = useSharedValue(1);

  const visible = laidOut && imageReady;
  const exiting = (appReady && held) || timedOut;
  const phase: LaunchPhase = exiting ? 'gone' : revealed ? 'shown' : 'hidden';

  // Görsel bir türlü yüklenmezse bekleme sürmesin
  useEffect(() => {
    if (!laidOut) return;
    const timer = setTimeout(() => setImageReady(true), 600);
    return () => clearTimeout(timer);
  }, [laidOut]);

  // Örtüdeki yazı ekrandayken sistem açılış ekranı kalkar (aynı kare)
  useEffect(() => {
    if (visible) SplashScreen.hideAsync().catch(() => {});
  }, [visible]);

  // Uygulama altta yerleşince (kısa bir beklemeyle) animasyon başlar; hazır olmazsa bir süre sonra yine başlar
  useEffect(() => {
    if (!visible || started) return;
    const timer = setTimeout(() => setStarted(true), appReady ? LAUNCH.settle : LAUNCH.startTimeout);
    return () => clearTimeout(timer);
  }, [visible, started, appReady]);

  // Yazı büyüyüp erir, slogan ardından başlar
  useEffect(() => {
    if (!started) return;
    if (!reduceMotion) zoom.value = withTiming(1, { duration: LAUNCH.zoom, easing: EASE_ZOOM });
    dissolve.value = withDelay(
      reduceMotion ? 300 : LAUNCH.dissolveStart,
      withTiming(1, { duration: LAUNCH.dissolve, easing: Easing.inOut(Easing.quad) }),
    );
    const timer = setTimeout(() => setRevealed(true), reduceMotion ? 700 : LAUNCH.taglineDelay);
    return () => clearTimeout(timer);
  }, [started, reduceMotion, zoom, dissolve]);

  // Slogan tamamlanınca okunacak kadar kalır; uygulama da hazırsa çıkış başlar
  useEffect(() => {
    if (!revealed) return;
    const revealTotal = reduceMotion ? 600 : LAUNCH_REVEAL_TOTAL;
    const hold = setTimeout(() => setMoment('holding'), revealTotal);
    const timer = setTimeout(() => setHeld(true), revealTotal + LAUNCH.hold);
    return () => {
      clearTimeout(hold);
      clearTimeout(timer);
    };
  }, [revealed, reduceMotion]);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), LAUNCH.failsafe);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!exiting) return;
    setMoment('exiting');
    stage.value = withTiming(1, { duration: LAUNCH.stageIn, easing: EASE_OUT });
    fade.value = withDelay(
      LAUNCH.overlayDelay,
      withTiming(0, { duration: LAUNCH.overlayOut, easing: Easing.inOut(Easing.quad) }, (finished) => {
        if (finished) runOnJS(setDone)(true);
      }),
    );
  }, [exiting, fade]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  // Örtü solarken içerik hafifçe büyür: uygulama "içinden" açılıyormuş gibi
  const contentStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + (1 - fade.value) * 0.03 }] }));
  const zoomStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + (LAUNCH.zoomTo - 1) * zoom.value }] }));
  // Erirken önce bulanık kopyasına geçer, o da solar
  const sharpStyle = useAnimatedStyle(() => ({ opacity: 1 - smooth(dissolve.value / 0.55) }));
  const blurStyle = useAnimatedStyle(() => ({
    opacity: 0.85 * smooth(dissolve.value / 0.35) * (1 - smooth((dissolve.value - 0.35) / 0.65)),
  }));

  useEffect(() => {
    if (done) setMoment('done');
  }, [done]);

  if (done) return null;

  return (
    <Animated.View
      style={[styles.overlay, { backgroundColor: SCHEME.background }, overlayStyle]}
      onLayout={() => setLaidOut(true)}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {/* Lacivert üstünde açık durum çubuğu; örtü kalkınca uygulamanın kendi ayarına döner */}
      <StatusBar style="light" />
      <Animated.View style={[StyleSheet.absoluteFill, contentStyle]} pointerEvents="none">
        <View style={styles.center}>
          <Animated.View style={[styles.wordmark, zoomStyle]}>
            <Animated.Image
              source={SCHEME.wordmark}
              fadeDuration={0}
              onLoad={() => setImageReady(true)}
              style={[styles.wordmark, sharpStyle]}
            />
            <Animated.Image source={SCHEME.blur} fadeDuration={0} style={[styles.wordmarkBlur, blurStyle]} />
          </Animated.View>
        </View>
        <LaunchText phase={phase} reduceMotion={reduceMotion} color={SCHEME.ink} />
      </Animated.View>
    </Animated.View>
  );
}

/** Açılış animasyonundaki bir hata uygulamayı asla kilitlemesin: örtü kalkar, uygulama yerine oturur */
class IntroBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    stage.value = 1;
    setMoment('done');
    SplashScreen.hideAsync().catch(() => {});
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function LaunchIntro() {
  return (
    <IntroBoundary>
      <Intro />
    </IntroBoundary>
  );
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
  },
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Sistem açılış ekranındakiyle aynı boyut ve yer (ekranın tam ortası)
  wordmark: {
    width: WORDMARK_WIDTH,
    height: WORDMARK_HEIGHT,
  },
  // Bulanık kopya: kenar payı kadar büyük, aynı merkez
  wordmarkBlur: {
    position: 'absolute',
    left: -BLUR_MARGIN,
    top: -BLUR_MARGIN,
    width: WORDMARK_WIDTH + 2 * BLUR_MARGIN,
    height: WORDMARK_HEIGHT + 2 * BLUR_MARGIN,
  },
});
