import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';

import { Text } from '@/components/ui';
import { SUPPORT_EMAIL } from '@/constants/app';
import { legalText, type LegalDoc } from '@/constants/legal';
import { colors, spacing } from '@/constants/theme';
import { currentLanguage } from '@/i18n';

const DOCS: Record<string, LegalDoc> = { kosullar: 'terms', gizlilik: 'privacy' };

/** Kullanım Koşulları / Gizlilik Politikası (kayıt öncesi de açılabilir) */
export default function LegalScreen() {
  const { belge } = useLocalSearchParams<{ belge: string }>();
  const doc = DOCS[belge] ?? 'terms';
  const lang = currentLanguage();
  const text = legalText(lang, doc, SUPPORT_EMAIL);

  return (
    <>
      <Stack.Screen options={{ title: text.title }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
        <Text variant="footnote" color={colors.textSecondary}>
          {text.updated}
        </Text>
        <Text variant="callout">{text.intro}</Text>
        {text.sections.map((section) => (
          <Text key={section.heading} variant="callout" style={styles.section}>
            <Text variant="headline" color={colors.primary}>
              {section.heading}
              {'\n'}
            </Text>
            {section.paragraphs.join('\n\n')}
          </Text>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  section: {
    lineHeight: 22,
  },
});
