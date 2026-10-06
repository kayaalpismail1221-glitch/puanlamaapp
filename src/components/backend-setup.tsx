import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';

const STEPS = [
  'supabase.com’da Frankfurt bölgesinde bir proje aç.',
  'Proje klasöründe `.env.example` dosyasını `.env.local` adıyla kopyala.',
  'Supabase paneli → Project Settings → API’deki Project URL ve anon key değerlerini `.env.local` içine yaz.',
  'Veritabanını kur: SUPABASE.md’deki adımları izle (migration’lar ve isteğe bağlı demo verisi).',
  '`npx expo start --clear` ile uygulamayı yeniden başlat.',
];

/** Bağlantı bilgileri girilmemişse gösterilen geliştirici ekranı */
export function BackendSetup() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xxl }]}>
      <Text variant="title" color={colors.primary}>
        Sunucu bağlantısı yok
      </Text>
      <Text variant="body" color={colors.textSecondary}>
        Expeat verilerini Supabase’te saklıyor. Uygulamayı çalıştırmak için bağlantı bilgilerini bir kez girmen gerekiyor.
      </Text>
      <View style={styles.steps}>
        {STEPS.map((step, i) => (
          <View key={step} style={styles.step}>
            <View style={styles.number}>
              <Text variant="footnote" color={colors.onPrimary} style={styles.bold}>
                {i + 1}
              </Text>
            </View>
            <Text variant="callout" style={{ flex: 1 }}>
              {step}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
  steps: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  step: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  number: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bold: {
    fontWeight: '700',
  },
});
