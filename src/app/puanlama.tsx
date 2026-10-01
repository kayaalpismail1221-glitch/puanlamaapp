import { SymbolView, type SFSymbol } from '@/components/symbol';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { BottomInsetSpacer } from '@/components/bottom-inset';
import { Text } from '@/components/ui';
import { SEGMENTS } from '@/constants/segments';
import { colors, radius, spacing } from '@/constants/theme';

type SectionKey = 'compare' | 'kinds' | 'bands' | 'favorite' | 'same' | 'many' | 'post' | 'community' | 'friends';
type Section = { key: SectionKey; icon: SFSymbol };

/** Sırayla anlatılan başlıklar; metinler i18n `scoring.<key>.title/body` */
const SECTIONS: Section[] = [
  { key: 'compare', icon: 'arrow.left.arrow.right' },
  { key: 'kinds', icon: 'list.bullet' },
  { key: 'bands', icon: 'hand.thumbsup' },
  { key: 'favorite', icon: 'star' },
  { key: 'same', icon: 'equal.circle' },
  { key: 'many', icon: 'chart.line.uptrend.xyaxis' },
  { key: 'post', icon: 'camera' },
  { key: 'community', icon: 'person.3' },
  { key: 'friends', icon: 'person.2' },
];

/**
 * "Puanlar nasıl hesaplanır?": kişisel puan (kıyaslama, izlenim aralıkları, favori 10, eşitlik, eğri),
 * gönderideki puan, topluluk ve arkadaş puanı. Kurallar lib/ranking.ts ve topluluk migration'larıyla aynı.
 */
export default function ScoringScreen() {
  const { t } = useTranslation();
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
      <Text variant="subhead" color={colors.textSecondary}>
        {t('scoring.intro')}
      </Text>
      {SECTIONS.map(({ key, icon }) => (
        <View key={key} style={styles.section}>
          <View style={styles.icon}>
            <SymbolView name={icon} tintColor={colors.primary} size={18} />
          </View>
          <View style={styles.flex}>
            <Text variant="headline">{t(`scoring.${key}.title`)}</Text>
            <Text variant="subhead" color={colors.textSecondary} style={styles.body}>
              {/* Türler listesi segmentlerden (constants/segments), yeni tür eklenince metin kendiliğinden güncel */}
              {t(`scoring.${key}.body`, { kinds: SEGMENTS.map((s) => t(`segments.${s}`)).join(' · ') })}
            </Text>
          </View>
        </View>
      ))}
      <BottomInsetSpacer />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  section: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  flex: {
    flex: 1,
    gap: spacing.xs,
  },
  body: {
    lineHeight: 21,
  },
});
