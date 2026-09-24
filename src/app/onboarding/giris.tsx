import * as AppleAuthentication from 'expo-apple-authentication';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { isAppleSignInAvailable, resendSignupCode, signIn, signInWithApple } from '@/api/auth';
import { showError } from '@/api/errors';
import { BigInput, OnboardingStep } from '@/components/onboarding-step';
import { Button, PressableScale, Text } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { haptics } from '@/lib/haptics';
import { isValidEmail } from '@/lib/validation';

/**
 * Giriş: e-posta + şifre ya da Apple ile.
 * Başarılı olunca oturum açılır; kök düzen kullanıcıyı sekmelere (ya da yarım kalan kuruluma) taşır.
 */
export default function SignInScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  useEffect(() => {
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
      } else showError(error, 'Giriş yapılamadı');
    } finally {
      setBusy(false);
    }
  };

  const apple = async () => {
    try {
      await signInWithApple();
    } catch (error) {
      showError(error, 'Apple ile giriş yapılamadı');
    }
  };

  return (
    <OnboardingStep
      title="Tekrar hoş geldin"
      subtitle="Hesabına giriş yap."
      footer={<Button title="Giriş yap" onPress={submit} disabled={!canSubmit} loading={busy} />}>
      <View style={styles.fields}>
        <BigInput
          value={email}
          onChangeText={setEmail}
          placeholder="E-posta"
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
          placeholder="Şifre"
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
        <PressableScale
          onPress={() => router.push({ pathname: '/onboarding/sifre-sifirla', params: { email } })}
          haptic={false}
          style={styles.forgot}>
          <Text variant="footnote" color={colors.primary} style={styles.bold}>
            Şifremi unuttum
          </Text>
        </PressableScale>

        {appleAvailable && (
          <View style={styles.apple}>
            <View style={styles.or}>
              <View style={styles.line} />
              <Text variant="caption" color={colors.textSecondary}>
                veya
              </Text>
              <View style={styles.line} />
            </View>
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
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
