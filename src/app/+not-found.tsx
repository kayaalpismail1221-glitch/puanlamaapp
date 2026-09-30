import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { SymbolView } from '@/components/symbol';
import { Button, Text } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';

/** Uygulamada karşılığı olmayan bağlantı (eski/bozuk `puanla://…`): expo-router'ın İngilizce ekranı yerine */
export default function NotFoundScreen() {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <SymbolView name="questionmark.circle" tintColor={colors.textTertiary} size={40} />
      <Text variant="headline" align="center">
        {t('common.pageNotFound')}
      </Text>
      <Button
        title={t('common.goHome')}
        variant="secondary"
        size="sm"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xxl,
    backgroundColor: colors.background,
  },
});
