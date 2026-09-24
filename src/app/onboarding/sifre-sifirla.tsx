import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { sendLoginCode, updatePassword, verifyLoginCode } from '@/api/auth';
import { showError } from '@/api/errors';
import { BigInput, OnboardingStep } from '@/components/onboarding-step';
import { Button, Text } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { haptics } from '@/lib/haptics';
import { isAcceptablePassword, isValidEmail } from '@/lib/validation';

type Step = 'email' | 'code' | 'password';

/**
 * Şifre sıfırlama, bağlantıya tıklamadan: e-postaya gelen 6 haneli kodla giriş yapılır,
 * ardından yeni şifre belirlenir.
 *
 * Kod doğrulanınca oturum açılır ve kök düzen kullanıcıyı uygulamaya taşır. Yeni şifre adımı
 * o yüzden kod doğrulanmadan önce, aynı ekranda sorulur.
 */
export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState(params.email ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const normalizedEmail = email.trim().toLowerCase();

  const sendCode = async () => {
    if (!isValidEmail(email) || busy) return;
    setBusy(true);
    try {
      await sendLoginCode(normalizedEmail);
      haptics.success();
      setStep('password');
    } catch (error) {
      haptics.warning();
      showError(error, t('failures.codeSend'));
    } finally {
      setBusy(false);
    }
  };

  /** Kodu doğrular (oturum açılır) ve yeni şifreyi kaydeder */
  const finish = async (value = code) => {
    if (value.length !== 6 || busy) return;
    setBusy(true);
    try {
      await verifyLoginCode(normalizedEmail, value);
      await updatePassword(password);
      haptics.success();
    } catch (error) {
      haptics.warning();
      setCode('');
      showError(error, t('failures.passwordReset'));
    } finally {
      setBusy(false);
    }
  };

  if (step === 'email') {
    return (
      <OnboardingStep
        title={t('onboarding.resetTitle')}
        subtitle={t('onboarding.resetSubtitle')}
        footer={<Button title={t('onboarding.sendCode')} onPress={sendCode} disabled={!isValidEmail(email)} loading={busy} />}>
        <BigInput
          value={email}
          onChangeText={setEmail}
          placeholder={t('onboarding.emailPlaceholder')}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          onSubmitEditing={sendCode}
          style={styles.email}
        />
      </OnboardingStep>
    );
  }

  if (step === 'password') {
    return (
      <OnboardingStep
        title={t('onboarding.newPasswordTitle')}
        subtitle={t('onboarding.passwordSubtitle')}
        footer={
          <Button title={t('onboarding.next')} onPress={() => setStep('code')} disabled={!isAcceptablePassword(password)} />
        }>
        <BigInput
          value={password}
          onChangeText={setPassword}
          placeholder={t('onboarding.newPassword')}
          secureTextEntry
          textContentType="newPassword"
          autoComplete="new-password"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          onSubmitEditing={() => isAcceptablePassword(password) && setStep('code')}
        />
        <Text variant="footnote" color={colors.textSecondary} style={styles.hint}>
          {t('onboarding.codeSentHint', { email: normalizedEmail })}
        </Text>
      </OnboardingStep>
    );
  }

  return (
    <OnboardingStep
      title={t('onboarding.enterCode')}
      subtitle={t('onboarding.enterCodeSubtitle', { email: normalizedEmail })}
      footer={<Button title={t('onboarding.savePassword')} onPress={() => finish()} disabled={code.length !== 6} loading={busy} />}>
      <BigInput
        value={code}
        onChangeText={(text) => {
          const digits = text.replace(/\D/g, '').slice(0, 6);
          setCode(digits);
          if (digits.length === 6) finish(digits);
        }}
        placeholder="000000"
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        autoFocus
        maxLength={6}
        style={styles.code}
      />
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  email: {
    fontSize: 24,
  },
  code: {
    letterSpacing: 8,
    fontVariant: ['tabular-nums'],
  },
  hint: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
});
