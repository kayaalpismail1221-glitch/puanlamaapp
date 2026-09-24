import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
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
      showError(error, 'Kod gönderilemedi');
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
      showError(error, 'Şifre sıfırlanamadı');
    } finally {
      setBusy(false);
    }
  };

  if (step === 'email') {
    return (
      <OnboardingStep
        title="Şifreni sıfırla"
        subtitle="E-posta adresine 6 haneli bir kod göndereceğiz."
        footer={<Button title="Kod gönder" onPress={sendCode} disabled={!isValidEmail(email)} loading={busy} />}>
        <BigInput
          value={email}
          onChangeText={setEmail}
          placeholder="ornek@mail.com"
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
        title="Yeni şifre"
        subtitle="En az 8 karakter; harf ve rakam içersin."
        footer={
          <Button title="Devam" onPress={() => setStep('code')} disabled={!isAcceptablePassword(password)} />
        }>
        <BigInput
          value={password}
          onChangeText={setPassword}
          placeholder="Yeni şifre"
          secureTextEntry
          textContentType="newPassword"
          autoComplete="new-password"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          onSubmitEditing={() => isAcceptablePassword(password) && setStep('code')}
        />
        <Text variant="footnote" color={colors.textSecondary} style={styles.hint}>
          {normalizedEmail} adresine kod gönderdik; bir sonraki adımda gireceksin.
        </Text>
      </OnboardingStep>
    );
  }

  return (
    <OnboardingStep
      title="Kodu gir"
      subtitle={`${normalizedEmail} adresine gelen 6 haneli kodu yaz.`}
      footer={<Button title="Şifreyi kaydet" onPress={() => finish()} disabled={code.length !== 6} loading={busy} />}>
      <BigInput
        value={code}
        onChangeText={(t) => {
          const digits = t.replace(/\D/g, '').slice(0, 6);
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
