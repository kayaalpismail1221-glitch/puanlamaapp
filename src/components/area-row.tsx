import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { HighlightText } from '@/components/highlight-text';
import { PressableScale, Text } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { currentLocale } from '@/i18n';
import type { AreaHit } from '@/types';

/** Bölgenin en yüksek puanlı mekânları ekranı */
export function openArea(area: AreaHit) {
  router.push({
    pathname: '/bolge',
    params: { tur: area.kind, ad: area.name, sehir: area.city, ilce: area.district ?? '' },
  });
}

/** "İlçe · İstanbul · 1.240 mekân"; mahallede ilçesi: "Mahalle · Kadıköy · 86 mekân" */
export function useAreaSubtitle() {
  const { t } = useTranslation();
  return (area: AreaHit) =>
    [
      t(`region.kinds.${area.kind}`),
      area.kind === 'neighborhood' ? area.district : area.kind === 'district' ? area.city : undefined,
      t('region.places', { count: area.placeCount, formattedCount: area.placeCount.toLocaleString(currentLocale()) }),
    ]
      .filter(Boolean)
      .join(' · ');
}

/** Keşfet'te bulunan semt/ilçe satırı; dokununca bölgenin en iyileri açılır */
export function AreaRow({ area, highlight }: { area: AreaHit; highlight?: string }) {
  const subtitle = useAreaSubtitle();
  return (
    <PressableScale onPress={() => openArea(area)} scaleTo={0.98} style={styles.row}>
      <View style={styles.icon}>
        <SymbolView
          name={area.kind === 'city' ? 'building.2.fill' : area.kind === 'district' ? 'map.fill' : 'mappin.and.ellipse'}
          tintColor={colors.primary}
          size={20}
        />
      </View>
      <View style={styles.info}>
        <HighlightText variant="headline" numberOfLines={1} text={area.name} query={highlight} />
        <Text variant="footnote" color={colors.textSecondary} numberOfLines={1}>
          {subtitle(area)}
        </Text>
      </View>
      <SymbolView name="chevron.right" tintColor={colors.textTertiary} size={13} weight="semibold" />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.background,
  },
  icon: {
    width: 52,
    height: 52,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: 2,
  },
});
