import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppMapView, PinMarker } from '@/components/app-map';
import { GoogleSignInButton } from '@/components/google-button';
import { LegalConsent } from '@/components/legal-consent';
import { Button, PressableScale, Text } from '@/components/ui';
import { colors, fixed, fonts, onScoreColor, radius, scoreColor, spacing, withAlpha } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { formatScore } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { useAppSelector } from '@/store/app-store';

const SLIDES = ['remember', 'trust', 'discover'] as const;

/** Dekoratif pinler: İstanbul'un iki yakasına yayılmış, sabit (tohumlu) rastgele dağılım */
const PINS = (() => {
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  return Array.from({ length: 46 }, (_, i) => {
    const high = rand() < 0.82;
    const score = high ? 6.8 + rand() * 3.2 : 3 + rand() * 3.6;
    return {
      id: i,
      latitude: 40.975 + rand() * 0.11,
      longitude: 28.965 + rand() * 0.1,
      score: Math.round(score * 10) / 10,
    };
  });
})();

const CAMERA = { latitude: 41.028, longitude: 29.018 };

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
  const { t } = useTranslation();

  // Slaytlar yalnızca kullanıcı kaydırınca değişir
  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    if (next !== page) haptics.select();
    setPage(next);
  };

  return (
    <View style={styles.container}>
      {/* Arka plan haritası */}
      <View style={[styles.mapWrap, { height: height * 0.64 }]} pointerEvents="none">
        <AppMapView
          decorative
          style={StyleSheet.absoluteFill}
          initialCamera={{ center: CAMERA, pitch: 0, heading: 0, altitude: 14000, zoom: 12.5 }}
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          showsPointsOfInterests={false}
          showsCompass={false}
          toolbarEnabled={false}>
          {PINS.map((p) => (
            <PinMarker key={p.id} coordinate={p} anchor={{ x: 0.5, y: 1 }}>
              <ScorePin score={p.score} />
            </PinMarker>
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
        <Animated.Text entering={FadeInDown.delay(200).springify()} style={styles.wordmark}>
          puanla
        </Animated.Text>

        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}
          style={styles.pager}>
          {SLIDES.map((s) => (
            <View key={s} style={[styles.slide, { width }]}>
              <Text style={styles.slideTitle}>{t(`onboarding.slides.${s}Title`)}</Text>
              <Text variant="title3" color={colors.primary} align="center" style={styles.slideText}>
                {t(`onboarding.slides.${s}Text`)}
              </Text>
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

/** Puana göre renklenen, aşağı sivri uçlu harita pini */
function ScorePin({ score }: { score: number }) {
  const color = scoreColor(score);
  return (
    <View style={styles.pinWrap}>
      <View style={[styles.pin, { backgroundColor: color }]}>
        <Text variant="caption" color={onScoreColor(score)} style={styles.pinText}>
          {formatScore(score)}
        </Text>
      </View>
      <View style={[styles.pinTail, { backgroundColor: color }]} />
    </View>
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
  bottom: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  wordmark: {
    fontFamily: fonts.serif,
    fontSize: 40,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  pager: {
    flexGrow: 0,
    marginTop: spacing.lg,
  },
  slide: {
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
