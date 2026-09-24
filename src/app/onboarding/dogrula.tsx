import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
      showError(error, t('failures.verify'));
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
      showError(error, t('failures.codeSend'));
    }
  };

  return (
    <OnboardingStep
      title={t('onboarding.verifyTitle')}
      subtitle={t('onboarding.verifySubtitle', { email })}
      footer={
        <Button title={t('onboarding.verify')} onPress={() => verify()} disabled={code.length !== CODE_LENGTH} loading={verifying} />
      }>
      <BigInput
        value={code}
        onChangeText={(text) => {
          const digits = text.replace(/\D/g, '').slice(0, CODE_LENGTH);
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
            {t('onboarding.codeResent')}
          </Text>
        ) : (
          <PressableScale onPress={resend} haptic={false}>
            <Text variant="footnote" color={colors.primary} style={styles.bold}>
              {t('onboarding.resend')}
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
