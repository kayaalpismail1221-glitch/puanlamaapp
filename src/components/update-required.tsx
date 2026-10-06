import { useTranslation } from 'react-i18next';
import { Linking, Platform, StyleSheet, View } from 'react-native';

import { Image } from '@/components/image';
import { Button, Text } from '@/components/ui';
import { storePageUrls } from '@/constants/app';
import { colors, spacing } from '@/constants/theme';

const icon = require('../../assets/images/icon.png');

/** Önce mağaza uygulaması (App Store / Google Play), açılamazsa tarayıcıda mağaza sayfası */
async function openStore() {
  for (const url of storePageUrls()) {
    try {
      await Linking.openURL(url);
      return;
    } catch {
      // sıradaki adres
    }
  }
}

/**
 * Yüklü sürüm artık desteklenmiyorsa uygulamanın tamamının yerine (`hooks/use-update-required`).
 * Kapatılamaz: tek çıkış mağazadan güncellemek.
 */
export function UpdateRequired() {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <Image source={icon} style={styles.icon} accessibilityIgnoresInvertColors />
      <View style={styles.copy}>
        <Text variant="title2" align="center">
          {t('forceUpdate.title')}
        </Text>
        <Text variant="callout" color={colors.textSecondary} align="center">
          {t('forceUpdate.text')}
        </Text>
      </View>
      <Button title={t('forceUpdate.button')} onPress={openStore} style={styles.button} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
    padding: spacing.xxl,
    backgroundColor: colors.background,
  },
  icon: {
    width: 96,
    height: 96,
    // iOS ikon köşesi (≈ %22,4) ve Android'in yuvarlatılmış kare uyarlanabilir ikonu
    borderRadius: Platform.OS === 'ios' ? 22 : 28,
    borderCurve: 'continuous',
  },
  copy: {
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: 320,
  },
  button: {
    width: '100%',
    maxWidth: 320,
  },
});
