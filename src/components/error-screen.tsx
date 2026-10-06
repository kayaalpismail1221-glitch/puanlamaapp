import type { ErrorBoundaryProps } from 'expo-router';
import { router } from 'expo-router';
import * as Updates from 'expo-updates';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { SymbolView } from '@/components/symbol';
import { Button, Text } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { queryClient } from '@/lib/query-client';

/**
 * Çizim sırasında çöken ekranın yerine (beyaz ekran yerine). Başlık ve geri tuşu çalışmaya devam eder:
 * kök gezgindeki `unstable_screenErrorBoundary` her ekranı ayrı sarar, iç içe gezginler (sekmeler) de bunu devralır.
 * Tekrar denerken önbellekteki veriler yenilenir: hatanın sebebi bozuk/eski veri olabilir.
 */
export function ScreenError({ error, retry }: ErrorBoundaryProps) {
  const { t } = useTranslation();
  const [retrying, setRetrying] = useState(false);

  const onRetry = async () => {
    setRetrying(true);
    await queryClient.invalidateQueries().catch(() => {});
    await retry();
    setRetrying(false);
  };

  return (
    <ErrorLayout
      error={error}
      title={t('crash.title')}
      text={t('crash.text')}
      primary={{ title: t('common.retry'), onPress: onRetry, loading: retrying }}
      secondary={{
        title: router.canGoBack() ? t('crash.back') : t('common.goHome'),
        onPress: () => (router.canGoBack() ? router.back() : router.replace('/')),
      }}
    />
  );
}

/**
 * Kök düzen (sağlayıcılar, gezgin) çökerse: gezinme yok, uygulama paketi baştan yüklenir (temiz durum).
 * Yeniden yükleme yapılamazsa (Expo Go) yalnızca yeniden çizilir.
 */
export function RootError({ error, retry }: ErrorBoundaryProps) {
  const { t } = useTranslation();
  const restart = () => Updates.reloadAsync().catch(() => retry());
  return (
    <ErrorLayout
      error={error}
      title={t('crash.title')}
      text={t('crash.rootText')}
      primary={{ title: t('crash.restart'), onPress: restart }}
    />
  );
}

type Action = { title: string; onPress: () => void; loading?: boolean };

function ErrorLayout({
  error,
  title,
  text,
  primary,
  secondary,
}: {
  error: Error;
  title: string;
  text: string;
  primary: Action;
  secondary?: Action;
}) {
  return (
    <View style={styles.container} accessibilityRole="alert">
      <SymbolView name="exclamationmark.bubble" tintColor={colors.textTertiary} size={40} />
      <View style={styles.copy}>
        <Text variant="title3" align="center">
          {title}
        </Text>
        <Text variant="subhead" color={colors.textSecondary} align="center">
          {text}
        </Text>
        {__DEV__ && (
          <Text variant="footnote" color={colors.danger} align="center" selectable>
            {error.message}
          </Text>
        )}
      </View>
      <View style={styles.actions}>
        <Button title={primary.title} onPress={primary.onPress} loading={primary.loading} style={styles.button} />
        {secondary && (
          <Button title={secondary.title} variant="ghost" onPress={secondary.onPress} style={styles.button} />
        )}
      </View>
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
  copy: {
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: 320,
  },
  actions: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: spacing.xs,
  },
  button: {
    minWidth: 220,
  },
});
