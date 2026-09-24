import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { resendSignupCode, verifySignupCode } from '@/api/auth';
import { showError } from '@/api/errors';
import { BigInput, OnboardingStep } from '@/components/onboarding-step';
import { Button, PressableScale, Text } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { haptics } from '@/lib/haptics';

const CODE_LENGTH = 6;

/**
 * E-posta doğrulaması (Supabase'te "Confirm email" açıksa).
 * Kod doğrulanınca oturum açılır ve kök düzen ilk puan adımına yönlendirir.
 */
export default function VerifyEmailStep() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resent, setResent] = useState(false);

  const verify = async (value = code) => {
    if (value.length !== CODE_LENGTH || verifying) return;
    setVerifying(true);
    try {
      await verifySignupCode(email, value);
      haptics.success();
    } catch (error) {
      haptics.warning();
      setCode('');
      showError(error, 'Doğrulanamadı');
    } finally {
      setVerifying(false);
    }
  };

  const resend = async () => {
    try {
      await resendSignupCode(email);
      setResent(true);
      haptics.success();
    } catch (error) {
      showError(error, 'Kod gönderilemedi');
    }
  };

  return (
    <OnboardingStep
      title="E-postanı doğrula"
      subtitle={`${email} adresine 6 haneli bir kod gönderdik.`}
      footer={
        <Button title="Doğrula" onPress={() => verify()} disabled={code.length !== CODE_LENGTH} loading={verifying} />
      }>
      <BigInput
        value={code}
        onChangeText={(t) => {
          const digits = t.replace(/\D/g, '').slice(0, CODE_LENGTH);
          setCode(digits);
          if (digits.length === CODE_LENGTH) verify(digits);
        }}
        placeholder="000000"
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        autoFocus
        maxLength={CODE_LENGTH}
        style={styles.code}
        valid={code.length === CODE_LENGTH}
      />
      <View style={styles.resend}>
        {resent ? (
          <Text variant="footnote" color={colors.textSecondary}>
            Yeni kod gönderildi. Gereksiz klasörünü de kontrol et.
          </Text>
        ) : (
          <PressableScale onPress={resend} haptic={false}>
            <Text variant="footnote" color={colors.primary} style={styles.bold}>
              Kod gelmedi mi? Yeniden gönder
            </Text>
          </PressableScale>
        )}
      </View>
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  code: {
    letterSpacing: 8,
    fontVariant: ['tabular-nums'],
  },
  resend: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  bold: {
    fontWeight: '600',
  },
});
