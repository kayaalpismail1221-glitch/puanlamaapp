import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { SymbolView, type SFSymbol } from '@/components/symbol';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';

import { PressableScale, Text } from '@/components/ui';
import { colors, hitSlop, radius, spacing } from '@/constants/theme';
import { haptics } from '@/lib/haptics';
import { formatPhone, fullAddress, isInstagram, placeArea, websiteLabel } from '@/lib/place';
import type { Place } from '@/types';

/**
 * Mekânın adresi ve iletişim bilgileri, gruplu satırlar hâlinde:
 * adres (dokununca yol tarifi, yanında kopyala) · telefon (ara) · web sitesi / Instagram.
 */
export function PlaceInfo({ place }: { place: Place }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const area = `${placeArea(place)}, ${place.city}`;
  const rows: { key: string; icon: SFSymbol; title: string; subtitle?: string; onPress: () => void; label: string }[] = [
    {
      key: 'address',
      icon: 'mappin.and.ellipse',
      title: place.address || area,
      subtitle: place.address ? area : undefined,
      onPress: () => router.push({ pathname: '/yol-tarifi/[id]', params: { id: place.id } }),
      label: t('place.directions'),
    },
  ];
  if (place.phone) {
    const phone = place.phone;
    rows.push({
      key: 'phone',
      icon: 'phone.fill',
      title: formatPhone(phone),
      onPress: () => Linking.openURL(`tel:${phone}`),
      label: t('place.call'),
    });
  }
  if (place.website) {
    const website = place.website;
    rows.push({
      key: 'website',
      icon: isInstagram(website) ? 'at' : 'safari',
      title: websiteLabel(website),
      onPress: () => Linking.openURL(website),
      label: isInstagram(website) ? t('place.instagram') : t('place.website'),
    });
  }

  const copy = async () => {
    await Clipboard.setStringAsync(fullAddress(place));
    haptics.success();
    setCopied(true);
  };

  return (
    <View style={styles.group}>
      {rows.map((row, i) => (
        <View key={row.key}>
          {i > 0 && <View style={styles.separator} />}
          <View style={styles.row}>
            <PressableScale
              onPress={row.onPress}
              scaleTo={0.98}
              style={styles.main}
              accessibilityRole="button"
              accessibilityLabel={`${row.label}: ${row.title}`}>
              <View style={styles.icon}>
                <SymbolView name={row.icon} tintColor={colors.primary} size={17} />
              </View>
              <View style={styles.text}>
                <Text variant="body" numberOfLines={2}>
                  {row.title}
                </Text>
                {row.subtitle && (
                  <Text variant="footnote" color={colors.textSecondary} numberOfLines={1}>
                    {row.subtitle}
                  </Text>
                )}
              </View>
            </PressableScale>
            {row.key === 'address' ? (
              <PressableScale
                onPress={copy}
                hitSlop={hitSlop}
                style={styles.trailing}
                accessibilityLabel={copied ? t('place.addressCopied') : t('place.copyAddress')}>
                <SymbolView
                  name={copied ? 'checkmark' : 'doc.on.doc'}
                  tintColor={copied ? colors.primary : colors.textSecondary}
                  size={16}
                />
              </PressableScale>
            ) : (
              <SymbolView name="chevron.right" tintColor={colors.textTertiary} size={13} style={styles.trailing} />
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: spacing.md,
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingLeft: spacing.lg,
  },
  icon: {
    width: 24,
    alignItems: 'center',
  },
  text: {
    flex: 1,
    gap: 2,
  },
  trailing: {
    marginLeft: spacing.sm,
    padding: spacing.xs,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: spacing.lg + 24 + spacing.md,
  },
});
