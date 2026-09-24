import { router } from 'expo-router';
import { Trans } from 'react-i18next';
import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';

import { Text } from '@/components/ui';
import { colors } from '@/constants/theme';

const open = (belge: 'kosullar' | 'gizlilik') => router.push({ pathname: '/yasal/[belge]', params: { belge } });

/**
 * "Devam ederek Kullanım Koşulları'nı … kabul etmiş olursun" cümlesi; koşullar ve gizlilik
 * bağlantıları dile göre cümle içinde doğru yerde durur (Trans + <terms>/<privacy> etiketleri).
 */
export function LegalConsent({ variant, style }: { variant: 'welcome' | 'signup'; style?: StyleProp<TextStyle> }) {
  return (
    <Text variant="caption" color={colors.textSecondary} align="center" style={style}>
      <Trans
        i18nKey={variant === 'signup' ? 'legal.agreeSignup' : 'legal.agreeWelcome'}
        components={{
          terms: (
            <Text
              variant="caption"
              color={colors.primary}
              style={styles.link}
              onPress={() => open('kosullar')}
              accessibilityRole="link"
            />
          ),
          privacy: (
            <Text
              variant="caption"
              color={colors.primary}
              style={styles.link}
              onPress={() => open('gizlilik')}
              accessibilityRole="link"
            />
          ),
        }}
      />
    </Text>
  );
}

const styles = StyleSheet.create({
  link: {
    fontWeight: '600',
  },
});
