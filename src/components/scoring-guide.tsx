import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SymbolView, type SFSymbol } from '@/components/symbol';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, PressableScale, Text } from '@/components/ui';
import { colors, fixed, fonts, gradients, hitSlop, onScoreColor, radius, scoreColor, spacing } from '@/constants/theme';
import { formatScore } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { scoreAt } from '@/lib/ranking';
import type { Sentiment } from '@/types';

const SEEN_KEY = 'puanla:scoring-guide:v1';
const STEPS = 4;
const INK_SOFT = 'rgba(255,255,255,0.72)';
const INK_FAINT = 'rgba(255,255,255,0.14)';

/**
 * Puanlama rehberi: `auto` ise kullanıcının ilk puanlamasında bir kez kendiliğinden açılır (görüldü bilgisi
 * cihazda); her yerde `open()` ile yeniden açılır.
 */
export function useScoringGuide({ auto = false }: { auto?: boolean } = {}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!auto) return;
    AsyncStorage.getItem(SEEN_KEY)
      .then((seen) => !seen && setVisible(true))
      .catch(() => {});
  }, [auto]);
  return {
    visible,
    open: () => setVisible(true),
    close: () => {
      setVisible(false);
      AsyncStorage.setItem(SEEN_KEY, '1').catch(() => {});
    },
  };
}

const BANDS: { sentiment: Sentiment; icon: SFSymbol; range: string; sample: number }[] = [
  { sentiment: 'liked', icon: 'hand.thumbsup.fill', range: '6,7 – 10', sample: 9 },
  { sentiment: 'fine', icon: 'hand.raised.fill', range: '3,4 – 6,6', sample: 5 },
  { sentiment: 'disliked', icon: 'hand.thumbsdown.fill', range: '0 – 3,3', sample: 1.5 },
];

/** "Beğendim" listesinde 5 mekânın puanı (eğri: üst taraf yüksek kalır) */
const LADDER = [0, 1, 2, 3, 4].map((i) => scoreAt('liked', i, 5));

/**
 * Puanlamanın mantığı, dört kısa sayfada: hissin aralığı belirler → aynı türdekilerle kıyaslarsın ("İkisi aynı"
 * da olur) → favorin hep 10, sevdiklerin yüksek kalır → Puanla puanı neden güvenilir. Her sayfanın üstünde marka
 * degradesinde bir görsel; son sayfada tüm ayrıntılar.
 */
export function ScoringGuide({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const [step, setStep] = useState(0);
  // Modal kapanınca içi bağlı kalır: son sayfada kapatılan rehber yeniden açılınca bir an son sayfayı ("Tüm
  // ayrıntılar" düğmesiyle) gösterip başa atlıyordu. Her açılışta adım sıfırlanır ve sayfalar baştan kurulur.
  const [session, setSession] = useState(0);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setSession((s) => s + 1);
      setStep(0);
    }
  }

  const goTo = (next: number) => {
    haptics.select();
    setStep(next);
    scroll.current?.scrollTo({ x: next * width, animated: true });
  };
  const last = step === STEPS - 1;

  const openDetails = () => {
    onClose();
    router.push('/puanlama');
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <View
        style={[
          styles.sheet,
          // iOS'ta sayfa (pageSheet) durum çubuğunun altında açılır; Android'de tam ekran, üst boşluk bizden
          { paddingTop: Platform.OS === 'android' ? insets.top : 0, paddingBottom: Math.max(insets.bottom, spacing.lg) },
        ]}>
        <View style={styles.top}>
          <Text variant="caption" color={colors.textSecondary} style={styles.kicker}>
            {t('scoringGuide.kicker')}
          </Text>
          <PressableScale onPress={onClose} hitSlop={hitSlop} style={styles.close} accessibilityLabel={t('scoringGuide.close')}>
            <SymbolView name="xmark" tintColor={colors.textSecondary} size={13} weight="bold" />
          </PressableScale>
        </View>

        {/* Sayfalar yalnızca yana kayar; sayfa sheet'in güvenli alan ayarıyla dikeyde oynamaz */}
        <ScrollView
          key={session}
          ref={scroll}
          horizontal
          pagingEnabled
          bounces={false}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setStep(Math.round(e.nativeEvent.contentOffset.x / width))}>
          {/* 1) His aralığı belirler */}
          <Page width={width} step={1} title={t('scoringGuide.s1Title')} text={t('scoringGuide.s1Text')}>
            <View style={styles.stack}>
              {BANDS.map((b, i) => (
                <Animated.View
                  key={b.sentiment}
                  entering={step === 0 ? FadeInDown.delay(120 + 90 * i).springify() : undefined}
                  style={styles.band}>
                  <View style={styles.bandIcon}>
                    <SymbolView name={b.icon} tintColor={fixed.navy} size={17} />
                  </View>
                  <Text variant="headline" color={fixed.white} style={styles.flex}>
                    {t(`sentiments.${b.sentiment}`)}
                  </Text>
                  <View style={[styles.rangePill, { backgroundColor: scoreColor(b.sample) }]}>
                    <Text variant="footnote" color={onScoreColor(b.sample)} style={styles.heavy}>
                      {b.range}
                    </Text>
                  </View>
                </Animated.View>
              ))}
            </View>
          </Page>

          {/* 2) Kıyasla; "İkisi aynı" da olur */}
          <Page width={width} step={2} title={t('scoringGuide.s2Title')} text={t('scoringGuide.s2Text')}>
            <View style={styles.compare}>
              <MiniPlace label={t('scoringGuide.placeA')} icon="fork.knife" tilt="-4deg" delay={0} animate={step === 1} />
              <Animated.View entering={step === 1 ? ZoomIn.delay(260).springify() : undefined} style={styles.vs}>
                <Text variant="subhead" color={fixed.navy} style={styles.heavy}>
                  ?
                </Text>
              </Animated.View>
              <MiniPlace label={t('scoringGuide.placeB')} icon="cup.and.saucer.fill" tilt="4deg" delay={120} animate={step === 1} />
            </View>
            <Animated.View entering={step === 1 ? FadeInUp.delay(380) : undefined} style={styles.samePill}>
              <SymbolView name="equal.circle.fill" tintColor={fixed.white} size={16} />
              <Text variant="subhead" color={fixed.white} style={styles.bold}>
                {t('rate.same')}
              </Text>
            </Animated.View>
          </Page>

          {/* 3) Favorin hep 10, sevdiklerin yüksek kalır */}
          <Page width={width} step={3} title={t('scoringGuide.s3Title')} text={t('scoringGuide.s3Text')}>
            <View style={styles.ladder}>
              {LADDER.map((score, i) => (
                <Animated.View
                  key={i}
                  entering={step === 2 ? FadeInDown.delay(80 * i).springify() : undefined}
                  style={styles.ladderRow}>
                  <Text variant="subhead" color={INK_SOFT} style={styles.rank}>
                    {i + 1}
                  </Text>
                  <View style={styles.flex}>
                    <View
                      style={[
                        styles.ladderBar,
                        { width: `${45 + ((score - 6.7) / 3.3) * 55}%`, backgroundColor: scoreColor(score) },
                      ]}
                    />
                  </View>
                  <View style={[styles.disc, { backgroundColor: scoreColor(score) }]}>
                    <Text variant="footnote" color={onScoreColor(score)} style={styles.heavy}>
                      {formatScore(score)}
                    </Text>
                  </View>
                  {i === 0 && (
                    <View style={styles.crown}>
                      <SymbolView name="crown.fill" tintColor="#FFD84D" size={14} />
                    </View>
                  )}
                </Animated.View>
              ))}
            </View>
          </Page>

          {/* 4) Puanla puanı neden güvenilir */}
          <Page width={width} step={4} title={t('scoringGuide.s4Title')} text={t('scoringGuide.s4Text')}>
            <Animated.View entering={step === 3 ? ZoomIn.springify() : undefined} style={styles.shield}>
              <SymbolView name="checkmark.shield.fill" tintColor={fixed.white} size={40} />
            </Animated.View>
            <View style={styles.stack}>
              {(['s4Point1', 's4Point2', 's4Point3'] as const).map((key, i) => (
                <Animated.View
                  key={key}
                  entering={step === 3 ? FadeInDown.delay(120 + 90 * i).springify() : undefined}
                  style={styles.point}>
                  <SymbolView
                    name={i === 0 ? 'person.3.fill' : i === 1 ? 'person.badge.clock.fill' : 'chart.line.uptrend.xyaxis'}
                    tintColor={fixed.white}
                    size={16}
                  />
                  <Text variant="footnote" color={fixed.white} style={[styles.flex, styles.pointText]}>
                    {t(`scoringGuide.${key}`)}
                  </Text>
                </Animated.View>
              ))}
            </View>
          </Page>
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.dots}>
            {Array.from({ length: STEPS }, (_, i) => (
              <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
            ))}
          </View>
          <Button
            title={last ? t('scoringGuide.done') : t('scoringGuide.next')}
            onPress={() => (last ? onClose() : goTo(step + 1))}
          />
          {last && <Button title={t('scoringGuide.details')} variant="ghost" size="sm" onPress={openDetails} />}
        </View>
      </View>
    </Modal>
  );
}

/** Sayfa: üstte marka degradesinde görsel kart, altında serif başlık ve kısa metin */
function Page({
  width,
  step,
  title,
  text,
  children,
}: {
  width: number;
  step: number;
  title: string;
  text: string;
  children: ReactNode;
}) {
  return (
    <ScrollView
      style={{ width }}
      contentContainerStyle={styles.page}
      contentInsetAdjustmentBehavior="never"
      automaticallyAdjustContentInsets={false}
      bounces={false}
      showsVerticalScrollIndicator={false}>
      <View style={styles.visual}>
        <LinearGradient
          colors={gradients.share}
          locations={gradients.shareStops}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.stepBadge}>
          <Text variant="caption" color={fixed.white} style={styles.heavy}>
            {step}/{STEPS}
          </Text>
        </View>
        {children}
      </View>
      <Animated.View entering={FadeIn} style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text variant="body" color={colors.textSecondary} align="center" style={styles.text}>
          {text}
        </Text>
      </Animated.View>
    </ScrollView>
  );
}

function MiniPlace({
  label,
  icon,
  tilt,
  delay,
  animate,
}: {
  label: string;
  icon: SFSymbol;
  tilt: string;
  delay: number;
  animate: boolean;
}) {
  return (
    <Animated.View
      entering={animate ? FadeInDown.delay(delay).springify() : undefined}
      style={[styles.miniPlace, { transform: [{ rotate: tilt }] }]}>
      <View style={styles.miniPhoto}>
        <SymbolView name={icon} tintColor={fixed.navy} size={24} />
      </View>
      <Text variant="footnote" color={fixed.navy} style={styles.bold} numberOfLines={1}>
        {label}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: colors.background,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  kicker: {
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  close: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  page: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  visual: {
    minHeight: 280,
    justifyContent: 'center',
    gap: spacing.lg,
    padding: spacing.xl,
    borderRadius: 28,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  stepBadge: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: INK_FAINT,
  },
  copy: {
    gap: spacing.sm,
    alignItems: 'center',
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  text: {
    lineHeight: 24,
  },
  stack: {
    gap: spacing.sm,
  },
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.card,
    backgroundColor: INK_FAINT,
  },
  bandIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: fixed.white,
  },
  rangePill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  compare: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  miniPlace: {
    width: 112,
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.card,
    backgroundColor: fixed.white,
    boxShadow: '0 10px 24px rgba(0, 0, 0, 0.25)',
  },
  miniPhoto: {
    height: 84,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2F8',
  },
  vs: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: fixed.white,
  },
  samePill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: INK_FAINT,
  },
  ladder: {
    gap: spacing.md,
  },
  ladderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rank: {
    width: 16,
    textAlign: 'center',
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  ladderBar: {
    height: 12,
    borderRadius: radius.full,
  },
  disc: {
    minWidth: 46,
    height: 30,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crown: {
    position: 'absolute',
    right: 16,
    top: -13,
  },
  shield: {
    alignSelf: 'center',
    width: 76,
    height: 76,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: INK_FAINT,
  },
  point: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.card,
    backgroundColor: INK_FAINT,
  },
  pointText: {
    lineHeight: 18,
  },
  footer: {
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: radius.full,
    backgroundColor: colors.border,
  },
  dotActive: {
    width: 20,
    backgroundColor: colors.primary,
  },
  flex: {
    flex: 1,
  },
  bold: {
    fontWeight: '600',
  },
  heavy: {
    fontWeight: '700',
  },
});
