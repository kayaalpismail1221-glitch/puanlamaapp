import * as AppleAuthentication from 'expo-apple-authentication';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { OnboardingStep } from '@/components/onboarding-step';
import { Button, Text } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { haptics } from '@/lib/haptics';
import { useAppStore } from '@/store/app-store';

/** 2. Giriş / kayıt. Şimdilik sahte: Supabase bağlanınca gerçek kimlik doğrulama yapılacak. */
export default function SignInScreen() {
  const { dispatch } = useAppStore();
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
  }, []);

  const continueSignedIn = () => {
    haptics.success();
    dispatch({ type: 'signIn' });
    router.replace('/onboarding/profil');
  };

  return (
    <OnboardingStep
      step={1}
      title="Hesabını oluştur"
      subtitle="Puanların ve listelerin her cihazda seninle olsun.">
      <View style={styles.actions}>
        {appleAvailable ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={radius.button}
            style={styles.apple}
            onPress={continueSignedIn}
          />
        ) : (
          <Button title="Apple ile devam et" icon="apple.logo" onPress={continueSignedIn} />
        )}
        <Button
          title="E-posta ile devam et"
          icon="envelope"
          variant="secondary"
          onPress={continueSignedIn}
        />
        <Text variant="footnote" color={colors.textSecondary} align="center" style={styles.legal}>
          Devam ederek Kullanım Koşulları ve Gizlilik Politikası’nı kabul etmiş olursun.
        </Text>
      </View>
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  actions: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  apple: {
    height: 52,
    width: '100%',
  },
  legal: {
    marginTop: spacing.sm,
  },
});
