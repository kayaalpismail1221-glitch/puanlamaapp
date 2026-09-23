import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, type ComponentType } from 'react';
import { Alert, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Extrapolation,
  FadeIn,
  FadeInDown,
  interpolate,
  scrollTo,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DiscoverScene, RankScene, TrustScene } from '@/components/onboarding-scenes';
import { Button, PressableScale, Text } from '@/components/ui';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { haptics } from '@/lib/haptics';

type Slide = { title: string; text: string; Scene: ComponentType };

const SLIDES: Slide[] = [
  { title: 'Sırala', text: 'Gittiğin her mekânı puanla; Puanla senin için 0–10 arası sıralasın.', Scene: RankScene },
  { title: 'Güven', text: 'Tanımadığın yorumculara değil, arkadaşlarının puanına güven.', Scene: TrustScene },
  { title: 'Keşfet', text: 'Yakınında bu hafta en sevilen lezzetleri tek bakışta gör.', Scene: DiscoverScene },
];

const AUTO_ADVANCE_MS = 5000;

/** Karşılama: lacivert kahraman kartta canlı sahneler, kaydırmaya bağlı parallax */
export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const x = useSharedValue(0);
  const page = useRef(0);
  const dragging = useRef(false);

  const heroHeight = Math.min(height * 0.5, 440);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      x.set(e.contentOffset.x);
    },
    onMomentumEnd: (e) => {
      const next = Math.round(e.contentOffset.x / width);
      scheduleOnRN(settle, next);
    },
  });

  function settle(next: number) {
    if (next !== page.current) haptics.select();
    page.current = next;
    dragging.current = false;
  }

  // Slaytlar kendiliğinden ilerler; kullanıcı kaydırırken bekler
  useEffect(() => {
    const t = setInterval(() => {
      if (dragging.current) return;
      const next = (page.current + 1) % SLIDES.length;
      page.current = next;
      scheduleOnUI(() => {
        'worklet';
        scrollTo(scrollRef, next * width, 0, true);
      });
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(t);
  }, [scrollRef, width]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      {/* Lacivert kahraman kart */}
      <Animated.View entering={FadeIn.duration(500)} style={[styles.hero, { height: heroHeight }]}>
        <LinearGradient
          colors={[colors.primary, colors.primaryLight]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Derinlik için soluk halkalar */}
        <View style={[styles.ring, { width: width * 0.9, height: width * 0.9, top: -width * 0.35, right: -width * 0.3 }]} />
        <View style={[styles.ring, { width: width * 0.6, height: width * 0.6, bottom: -width * 0.25, left: -width * 0.2 }]} />

        <View style={styles.brand}>
          <View style={styles.logo}>
            <SymbolView name="star.fill" tintColor={colors.primary} size={13} />
          </View>
          <Text style={styles.wordmark}>puanla</Text>
        </View>

        {SLIDES.map(({ title, Scene }, i) => (
          <ParallaxScene key={title} index={i} x={x} width={width}>
            <Scene />
          </ParallaxScene>
        ))}
      </Animated.View>

      {/* Metinler: kahramanla birlikte kayar */}
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => (dragging.current = true)}
        style={styles.pager}>
        {SLIDES.map((s, i) => (
          <SlideText key={s.title} slide={s} index={i} x={x} width={width} />
        ))}
      </Animated.ScrollView>

      <View style={styles.dots}>
        {SLIDES.map((s, i) => (
          <Dot key={s.title} index={i} x={x} width={width} />
        ))}
      </View>

      <Animated.View
        entering={FadeInDown.delay(300).springify()}
        style={[styles.actions, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <Button title="Başla" icon="arrow.right" onPress={() => router.push('/onboarding/telefon')} style={styles.cta} />
        <PressableScale
          onPress={() => Alert.alert('Giriş yap', 'Hesap sistemi (Supabase) bağlandığında buradan giriş yapabileceksin.')}
          style={styles.login}>
          <Text variant="callout" color={colors.textSecondary}>
            Zaten hesabın var mı?{' '}
            <Text variant="callout" color={colors.primary} style={styles.bold}>
              Giriş yap
            </Text>
          </Text>
        </PressableScale>
        <Text variant="caption" color={colors.textTertiary} align="center">
          Devam ederek Kullanım Koşulları’nı ve Gizlilik Politikası’nı kabul etmiş olursun.
        </Text>
      </Animated.View>
    </View>
  );
}

/** Kahraman kart içindeki sahne: kaydırmaya göre yana kayar ve solar */
function ParallaxScene({
  index,
  x,
  width,
  children,
}: {
  index: number;
  x: SharedValue<number>;
  width: number;
  children: React.ReactNode;
}) {
  const style = useAnimatedStyle(() => {
    const input = [(index - 1) * width, index * width, (index + 1) * width];
    return {
      opacity: interpolate(x.get(), input, [0, 1, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: interpolate(x.get(), input, [width * 0.5, 0, -width * 0.5], Extrapolation.CLAMP) },
        { scale: interpolate(x.get(), input, [0.92, 1, 0.92], Extrapolation.CLAMP) },
      ],
    };
  });
  return (
    <Animated.View style={[styles.sceneLayer, style]} pointerEvents="none">
      {children}
    </Animated.View>
  );
}

function SlideText({ slide, index, x, width }: { slide: Slide; index: number; x: SharedValue<number>; width: number }) {
  const style = useAnimatedStyle(() => {
    const input = [(index - 1) * width, index * width, (index + 1) * width];
    return {
      opacity: interpolate(x.get(), input, [0.2, 1, 0.2], Extrapolation.CLAMP),
      transform: [{ translateY: interpolate(x.get(), input, [12, 0, 12], Extrapolation.CLAMP) }],
    };
  });
  return (
    <Animated.View style={[styles.slide, { width }, style]}>
      <Text style={styles.slideTitle}>{slide.title}</Text>
      <Text variant="title3" color={colors.textSecondary} style={styles.slideText}>
        {slide.text}
      </Text>
    </Animated.View>
  );
}

/** Sayfa noktası: kaydırmayı parmakla birlikte takip eder */
function Dot({ index, x, width }: { index: number; x: SharedValue<number>; width: number }) {
  const style = useAnimatedStyle(() => {
    const input = [(index - 1) * width, index * width, (index + 1) * width];
    return {
      width: interpolate(x.get(), input, [8, 24, 8], Extrapolation.CLAMP),
      opacity: interpolate(x.get(), input, [0.25, 1, 0.25], Extrapolation.CLAMP),
    };
  });
  return <Animated.View style={[styles.dot, style]} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  hero: {
    marginHorizontal: spacing.md,
    borderRadius: radius.hero,
    overflow: 'hidden',
    backgroundColor: colors.primary,
  },
  ring: {
    position: 'absolute',
    borderRadius: radius.full,
    borderWidth: 40,
    borderColor: colors.onPrimaryFaint,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  logo: {
    width: 26,
    height: 26,
    borderRadius: radius.button - 4,
    backgroundColor: colors.onPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    fontFamily: fonts.serif,
    fontSize: 24,
    fontWeight: '800',
    color: colors.onPrimary,
    letterSpacing: -0.3,
  },
  sceneLayer: {
    ...StyleSheet.absoluteFill,
    top: 64,
    bottom: spacing.lg,
  },
  pager: {
    flexGrow: 0,
    marginTop: spacing.xl,
  },
  slide: {
    paddingHorizontal: spacing.xl + spacing.sm,
    gap: spacing.sm,
  },
  slideTitle: {
    fontFamily: fonts.serif,
    fontSize: 44,
    lineHeight: 50,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: -0.5,
  },
  slideText: {
    fontWeight: '400',
    lineHeight: 27,
  },
  dots: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl + spacing.sm,
    paddingTop: spacing.lg,
  },
  dot: {
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  actions: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  cta: {
    height: 56,
    borderRadius: radius.card,
    flexDirection: 'row-reverse',
  },
  login: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  bold: {
    fontWeight: '700',
  },
});
