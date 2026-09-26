import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { PressableScale, Text } from '@/components/ui';
import { LEADERBOARD_SPONSOR } from '@/constants/sponsors';
import { hitSlop, radius, spacing } from '@/constants/theme';
import { currentLanguage, currentLocale } from '@/i18n';
import { useLeaderboard } from '@/hooks/queries';
import { haptics } from '@/lib/haptics';

/**
 * Liderlik tablosu sponsor kartı, sponsorun kendi tasarım dilinde (Culinora: siyah zemin, turuncu vurgu, logo +
 * "ulin"/"ora" wordmark). Uygunluk hangi sekme açık olursa olsun sponsorun tablosuna göre (genel · bu ay):
 * ilk N'deysen tebrik + indirim (kod varsa kopyalanır), değilsen kaç değerlendirme kaldığı ya da kampanya.
 * "Culinora'ya git" platformun mağazasını açar.
 */
export function LeaderboardSponsorCard({ userId }: { userId: string }) {
  const sponsor = LEADERBOARD_SPONSOR;
  const { t } = useTranslation();
  const board = useLeaderboard(sponsor?.scope ?? 'all', sponsor?.period ?? 'month');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!sponsor) return null;
  const { brand } = sponsor;
  const lang = currentLanguage() === 'en' ? 'en' : 'tr';

  const entries = board.data ?? [];
  const mine = entries.find((e) => e.userId === userId && e.xp > 0);
  const winner = !!mine && mine.rank <= sponsor.topN;
  // İlk N'in son sırasındakini geçmek için gereken değerlendirme (eşitlikte beğeni belirler, bu yüzden +1)
  const ranked = entries.filter((e) => e.xp > 0);
  const cutoff = ranked.filter((e) => e.rank <= sponsor.topN).at(-1);
  const toGo = !winner && cutoff && ranked.length >= sponsor.topN ? cutoff.xp - (mine?.xp ?? 0) + 1 : undefined;
  const month = new Date().toLocaleDateString(currentLocale(), { month: 'long' });
  const values = { sponsor: sponsor.name, percent: sponsor.discountPercent, top: sponsor.topN, month };

  const openStore = () => {
    haptics.tap();
    Linking.openURL(Platform.OS === 'android' ? sponsor.playStoreUrl : sponsor.appStoreUrl);
  };
  const copyCode = async () => {
    if (!sponsor.promoCode) return;
    await Clipboard.setStringAsync(sponsor.promoCode);
    haptics.success();
    setCopied(true);
  };

  return (
    <View style={[styles.card, { backgroundColor: brand.background }]}>
      {/* Sitedeki gibi köşeden yayılan turuncu ışık */}
      <LinearGradient
        colors={[brand.glow, 'transparent']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.35, y: 0.75 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={styles.header}>
        <View style={styles.brandBlock}>
          <View style={styles.wordmark} accessible accessibilityRole="text" accessibilityLabel={sponsor.name}>
            <Image source={sponsor.logo} style={styles.logo} contentFit="contain" />
            <Text style={[styles.wordmarkText, { color: brand.accent }]}>
              {sponsor.wordmark[0]}
              <Text style={[styles.wordmarkText, { color: brand.text }]}>{sponsor.wordmark[1]}</Text>
            </Text>
          </View>
          <Text variant="caption" color={brand.textSoft} style={styles.category}>
            {sponsor.category[lang]}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: brand.accent }]}>
          <Text variant="footnote" color={brand.text} style={styles.badgeText}>
            {t('sponsor.badge', values)}
          </Text>
        </View>
      </View>

      <Text variant="title2" color={brand.text} style={styles.title}>
        {winner ? t('sponsor.winnerLead', { ...values, rank: mine!.rank }) : t('sponsor.lead', values)}
        <Text variant="title2" color={brand.accent} style={styles.title}>
          {t('sponsor.accent', values)}
        </Text>
      </Text>

      <Text variant="subhead" color={brand.textSoft}>
        {winner
          ? t(sponsor.promoCode ? 'sponsor.winnerTextCode' : 'sponsor.winnerText', values)
          : toGo !== undefined && toGo > 0
            ? t('sponsor.toGo', { ...values, count: toGo })
            : t('sponsor.text', values)}
      </Text>

      {winner && sponsor.promoCode && (
        <PressableScale
          onPress={copyCode}
          hitSlop={hitSlop}
          style={[styles.code, { backgroundColor: brand.surface, borderColor: brand.accent }]}
          accessibilityLabel={t('sponsor.copyCode')}>
          <Text variant="headline" color={brand.text} style={styles.codeText}>
            {sponsor.promoCode}
          </Text>
          <View style={styles.copy}>
            <SymbolView name={copied ? 'checkmark' : 'doc.on.doc'} tintColor={brand.accent} size={15} />
            <Text variant="footnote" color={brand.accent} style={styles.bold}>
              {copied ? t('sponsor.copied') : t('sponsor.copyCode')}
            </Text>
          </View>
        </PressableScale>
      )}

      <PressableScale
        onPress={openStore}
        style={[styles.button, { backgroundColor: brand.accent }]}
        accessibilityRole="link"
        accessibilityLabel={t('sponsor.cta', values)}>
        <Text variant="headline" color={brand.text}>
          {t('sponsor.cta', values)}
        </Text>
        <SymbolView name="arrow.up.right" tintColor={brand.text} size={15} weight="semibold" />
      </PressableScale>

      {/* Ne yaptığı: şeflerin gerçek kursları ve öne çıkanlar */}
      <View style={[styles.showcase, { borderTopColor: brand.surface }]}>
        <Text variant="footnote" color={brand.textSoft}>
          {sponsor.tagline[lang]}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.courses}
          style={styles.coursesScroll}>
          {sponsor.courses.map((course) => (
            <PressableScale
              key={course.title}
              onPress={openStore}
              scaleTo={0.97}
              style={[styles.course, { backgroundColor: brand.surface }]}
              accessibilityRole="link"
              accessibilityLabel={course.title}>
              <Image source={course.image} style={styles.courseImage} contentFit="cover" />
              <LinearGradient
                colors={['transparent', 'rgba(0, 0, 0, 0.85)']}
                style={styles.courseShade}
                pointerEvents="none"
              />
              <View style={[styles.play, { backgroundColor: brand.accent }]}>
                <SymbolView name="play.fill" tintColor={brand.text} size={10} />
              </View>
              <Text variant="caption" color={brand.text} numberOfLines={2} style={styles.courseTitle}>
                {course.title}
              </Text>
            </PressableScale>
          ))}
        </ScrollView>
        <View style={styles.features}>
          {sponsor.features.map((feature) => (
            <View key={feature.icon} style={styles.feature}>
              <SymbolView name={feature.icon} tintColor={brand.accent} size={14} />
              <Text variant="caption" color={brand.textSoft} style={styles.bold}>
                {feature.label[lang]}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <Text variant="caption" color={brand.textFaint}>
        {t('sponsor.fine', values)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    // Altındaki tablo açıklaması karta yapışmasın
    marginBottom: spacing.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandBlock: {
    gap: 2,
  },
  wordmark: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  category: {
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  logo: {
    width: 30,
    height: 26,
    marginRight: 1,
  },
  wordmarkText: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  badgeText: {
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  title: {
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  code: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.button,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  codeText: {
    letterSpacing: 1.5,
    fontVariant: ['tabular-nums'],
  },
  copy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  bold: {
    fontWeight: '600',
  },
  showcase: {
    gap: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  // Kurs şeridi kartın iç boşluğunu aşıp kenara kadar kayar
  coursesScroll: {
    marginHorizontal: -spacing.lg,
  },
  courses: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  course: {
    width: 148,
    height: 102,
    borderRadius: radius.button,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  courseImage: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  courseShade: {
    position: 'absolute',
    top: '35%',
    right: 0,
    bottom: 0,
    left: 0,
  },
  play: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    width: 22,
    height: 22,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  courseTitle: {
    fontWeight: '700',
    padding: spacing.sm,
  },
  features: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  button: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.button,
  },
});
