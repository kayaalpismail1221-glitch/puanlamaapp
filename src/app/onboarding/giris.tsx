import * as AppleAuthentication from 'expo-apple-authentication';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';

import { isAppleSignInAvailable, resendSignupCode, signIn, signInWithApple } from '@/api/auth';
import { showError } from '@/api/errors';
import { BigInput, OnboardingStep } from '@/components/onboarding-step';
import { Button, PressableScale, Text } from '@/components/ui';
import { APPLE_SIGN_IN_ENABLED, EMAIL_CODES_ENABLED } from '@/constants/features';
import { colors, radius, spacing } from '@/constants/theme';
import { useScheme } from '@/hooks/use-palette';
import { haptics } from '@/lib/haptics';
import { isValidEmail } from '@/lib/validation';

/**
 * Giriş: e-posta + şifre ya da Apple ile.
 * Başarılı olunca oturum açılır; kök düzen kullanıcıyı sekmelere (ya da yarım kalan kuruluma) taşır.
 */
export default function SignInScreen() {
  // Apple'ın kuralı: koyu zeminde beyaz, açık zeminde siyah düğme (siyah düğme koyu zeminde kaybolur)
  const scheme = useScheme();
  const params = useLocalSearchParams<{ email?: string }>();
  const { t } = useTranslation();
  const [email, setEmail] = useState(params.email ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!APPLE_SIGN_IN_ENABLED) return;
    isAppleSignInAvailable()
      .then(setAppleAvailable)
      .catch(() => {});
  }, []);

  const canSubmit = isValidEmail(email) && password.length > 0;

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    const normalized = email.trim().toLowerCase();
    try {
      await signIn(normalized, password);
      haptics.success();
    } catch (error) {
      haptics.warning();
      // Kayıt olup e-postasını doğrulamadan çıkan kullanıcı: yeni kod gönder ve doğrulamaya geç
      if (/email not confirmed/i.test((error as Error).message ?? '')) {
        resendSignupCode(normalized).catch(() => {});
        router.push({ pathname: '/onboarding/dogrula', params: { email: normalized } });
      } else showError(error, t('failures.signIn'));
    } finally {
      setBusy(false);
    }
  };

  const apple = async () => {
    try {
      await signInWithApple();
    } catch (error) {
      showError(error, t('failures.appleSignIn'));
    }
  };

  return (
    <OnboardingStep
      title={t('onboarding.welcomeBack')}
      subtitle={t('onboarding.signInSubtitle')}
      footer={<Button title={t('onboarding.signIn')} onPress={submit} disabled={!canSubmit} loading={busy} />}>
      <View style={styles.fields}>
        <BigInput
          value={email}
          onChangeText={setEmail}
          placeholder={t('onboarding.emailField')}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={!params.email}
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          style={styles.input}
        />
        <BigInput
          ref={passwordRef}
          value={password}
          onChangeText={setPassword}
          placeholder={t('onboarding.password')}
          secureTextEntry
          textContentType="password"
          autoComplete="current-password"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={!!params.email}
          returnKeyType="go"
          onSubmitEditing={submit}
          style={styles.input}
        />
        {EMAIL_CODES_ENABLED && (
          <PressableScale
            onPress={() => router.push({ pathname: '/onboarding/sifre-sifirla', params: { email } })}
            haptic={false}
            style={styles.forgot}>
            <Text variant="footnote" color={colors.primary} style={styles.bold}>
              {t('onboarding.forgot')}
            </Text>
          </PressableScale>
        )}

        {appleAvailable && (
          <View style={styles.apple}>
            <View style={styles.or}>
              <View style={styles.line} />
              <Text variant="caption" color={colors.textSecondary}>
                {t('onboarding.or')}
              </Text>
              <View style={styles.line} />
            </View>
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={
                scheme === 'dark'
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={radius.button}
              style={styles.appleButton}
              onPress={apple}
            />
          </View>
        )}
      </View>
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  fields: {
    gap: spacing.xl,
  },
  input: {
    fontSize: 24,
  },
  forgot: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.xl,
  },
  bold: {
    fontWeight: '600',
  },
  apple: {
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  or: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  appleButton: {
    height: 52,
  },
});
