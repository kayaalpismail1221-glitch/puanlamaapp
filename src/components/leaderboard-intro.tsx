import { SymbolView } from '@/components/symbol';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, PressableScale, Text } from '@/components/ui';
import { colors, hitSlop, radius, spacing } from '@/constants/theme';
import { haptics } from '@/lib/haptics';
import { LEVELS, XP_RULES } from '@/lib/xp';

const STEPS = 4;

/**
 * Tanıtım yalnızca istenince açılır (başlıktaki ⓘ ya da alttaki "senin durumun" kartı). Kullanıcı kararı
 * (2026-10-09): sıralamaya dokunan doğrudan lige gelsin, ilk girişte kendiliğinden açılmasın.
 */
export function useLeaderboardIntro() {
  const [visible, setVisible] = useState(false);
  const [startAt, setStartAt] = useState(0);
  return {
    visible,
    startAt,
    open: (step = 0) => {
      setStartAt(step);
      setVisible(true);
    },
    close: () => setVisible(false),
  };
}

/**
 * Puanla Ligi tanıtımı, adım adım: hoş geldin → XP nasıl kazanılır → üç lig ve aylık sıfırlama → seviyeler.
 * Yandan kaydırılır ya da İleri'ye basılır; son adımda Başla.
 */
export function LeaderboardIntro({ visible, startAt, onClose }: { visible: boolean; startAt: number; onClose: () => void }) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const [step, setStep] = useState(startAt);

  const goTo = (next: number) => {
    haptics.select();
    setStep(next);
    scroll.current?.scrollTo({ x: next * width, animated: true });
  };

  const last = step === STEPS - 1;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onShow={() => {
        setStep(startAt);
        scroll.current?.scrollTo({ x: startAt * width, animated: false });
      }}>
      <View
        style={[
          styles.sheet,
          // iOS'ta sayfa (pageSheet) durum çubuğunun altında açılır; Android'de tam ekran, üst boşluk bizden
          { paddingTop: Platform.OS === 'android' ? insets.top : 0, paddingBottom: Math.max(insets.bottom, spacing.lg) },
        ]}>
        <View style={styles.top}>
          <PressableScale onPress={onClose} hitSlop={hitSlop} accessibilityLabel={t('leaderboard.intro.skip')}>
            <Text variant="subhead" color={colors.textSecondary} style={styles.bold}>
              {t('leaderboard.intro.skip')}
            </Text>
          </PressableScale>
        </View>

        <ScrollView
          ref={scroll}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setStep(Math.round(e.nativeEvent.contentOffset.x / width))}>
          <Page width={width}>
            <Hero icon="trophy.fill" />
            <Text variant="title" align="center">
              {t('leaderboard.intro.step1Title')}
            </Text>
            <Text variant="body" color={colors.textSecondary} align="center">
              {t('leaderboard.intro.step1Text')}
            </Text>
          </Page>

          <Page width={width}>
            <Text variant="title" align="center">
              {t('leaderboard.intro.step2Title')}
            </Text>
            <XpRuleList animate={step === 1} />
          </Page>

          <Page width={width}>
            <Hero icon="person.3.fill" />
            <Text variant="title" align="center">
              {t('leaderboard.intro.step3Title')}
            </Text>
            <View style={styles.leagues}>
              {(['overall', 'mySchool', 'friends'] as const).map((key, i) => (
                <View key={key} style={styles.league}>
                  <SymbolView
                    name={i === 0 ? 'globe.europe.africa.fill' : i === 1 ? 'graduationcap.fill' : 'person.2.fill'}
                    tintColor={colors.primary}
                    size={22}
                  />
                  <Text variant="footnote" style={styles.bold}>
                    {t(`leaderboard.${key}`)}
                  </Text>
                </View>
              ))}
            </View>
            <Text variant="body" color={colors.textSecondary} align="center">
              {t('leaderboard.intro.step3Text')}
            </Text>
          </Page>

          <Page width={width}>
            <Text variant="title" align="center">
              {t('leaderboard.intro.step4Title')}
            </Text>
            <LevelList animate={step === 3} />
            <Text variant="subhead" color={colors.textSecondary} align="center">
              {t('leaderboard.intro.step4Text')}
            </Text>
          </Page>
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.dots}>
            {Array.from({ length: STEPS }, (_, i) => (
              <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
            ))}
          </View>
          <Button
            title={last ? t('leaderboard.intro.start') : t('leaderboard.intro.next')}
            onPress={() => (last ? onClose() : goTo(step + 1))}
          />
        </View>
      </View>
    </Modal>
  );
}

function Page({ width, children }: { width: number; children: React.ReactNode }) {
  return (
    <ScrollView style={{ width }} contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  );
}

function Hero({ icon }: { icon: React.ComponentProps<typeof SymbolView>['name'] }) {
  return (
    <View style={styles.hero}>
      <SymbolView name={icon} tintColor={colors.onPrimary} size={40} />
    </View>
  );
}

/** XP kuralları: simge, ne yapınca, notu ve kaç XP */
export function XpRuleList({ animate = true }: { animate?: boolean }) {
  const { t } = useTranslation();
  return (
    <View style={styles.list}>
      {XP_RULES.map((rule, i) => (
        <Animated.View
          key={`${rule.key}-${animate}`}
          entering={animate ? FadeInDown.delay(60 * i).springify() : undefined}
          style={styles.rule}>
          <View style={styles.ruleIcon}>
            <SymbolView name={rule.icon} tintColor={colors.primary} size={18} />
          </View>
          <View style={styles.flex}>
            <Text variant="subhead" style={styles.bold}>
              {t(`leaderboard.rules.${rule.key}`)}
            </Text>
            <Text variant="caption" color={colors.textSecondary}>
              {t(`leaderboard.ruleNotes.${rule.key}`)}
            </Text>
          </View>
          <View style={styles.xpPill}>
            <Text variant="subhead" color={colors.onPrimary} style={styles.bold}>
              +{rule.xp} XP
            </Text>
          </View>
        </Animated.View>
      ))}
    </View>
  );
}

/** Seviyeler ve eşikleri */
export function LevelList({ animate = true }: { animate?: boolean }) {
  const { t } = useTranslation();
  return (
    <View style={styles.list}>
      {LEVELS.map((level, i) => (
        <Animated.View
          key={`${level.key}-${animate}`}
          entering={animate ? FadeInDown.delay(60 * i).springify() : undefined}
          style={styles.rule}>
          <View style={[styles.ruleIcon, { opacity: 0.55 + (i / LEVELS.length) * 0.45 }]}>
            <SymbolView name={level.icon} tintColor={colors.primary} size={18} />
          </View>
          <Text variant="subhead" style={[styles.bold, styles.flex]}>
            {t(`leaderboard.levels.${level.key}`)}
          </Text>
          <Text variant="subhead" color={colors.textSecondary} style={styles.tabular}>
            {level.min === 0 ? '0' : `${level.min.toLocaleString('tr-TR')}+`} XP
          </Text>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: colors.background,
  },
  top: {
    alignItems: 'flex-end',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  page: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  hero: {
    alignSelf: 'center',
    width: 88,
    height: 88,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  leagues: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
  },
  league: {
    alignItems: 'center',
    gap: spacing.xs,
    width: 92,
    paddingVertical: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  list: {
    gap: spacing.sm,
  },
  rule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  ruleIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  xpPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  footer: {
    gap: spacing.lg,
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
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
