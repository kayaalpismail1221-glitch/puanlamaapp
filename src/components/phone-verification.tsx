import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { sendPhoneCode, verifyPhoneCode } from '@/api/auth';
import { showError } from '@/api/errors';
import { BigInput, OnboardingStep } from '@/components/onboarding-step';
import { Button, PressableScale, Text } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { haptics } from '@/lib/haptics';
import { formatPhone, isValidPhone, phoneDigits } from '@/lib/validation';
import { useAppActions } from '@/store/app-store';

const CODE_LENGTH = 6;

type Props = {
  /** Kayıtta girilen numara (10 hane, 5 ile başlar); verilirse kod hemen gönderilir */
  initialDigits?: string;
  onVerified: () => void;
  /** Atlanabilir adım (onboarding); yoksa atlama düğmesi gösterilmez */
  onSkip?: () => void;
};

/**
 * Telefonu SMS koduyla doğrulama: numara → 6 haneli kod.
 * Kod doğrulanınca veritabanı numarayı onaylı sayar; rehber eşleştirmesi açılır ve
 * rehberinde bu numara olanlara "arkadaşın katıldı" bildirimi gider.
 */
export function PhoneVerification({ initialDigits, onVerified, onSkip }: Props) {
  const { t } = useTranslation();
  const actions = useAppActions();
  const [digits, setDigits] = useState(initialDigits ?? '');
  const [phase, setPhase] = useState<'phone' | 'code'>('phone');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);
  const phone = `+90${digits}`;

  const send = async () => {
    if (!isValidPhone(digits) || busy) return;
    setBusy(true);
    try {
      await sendPhoneCode(phone);
      setPhase('code');
      setCode('');
    } catch (error) {
      haptics.warning();
      showError(error, t('failures.codeSend'));
    } finally {
      setBusy(false);
    }
  };

  // Kayıtta numara girildiyse kod hemen gönderilir
  const autoSent = useRef(false);
  useEffect(() => {
    if (autoSent.current || !initialDigits || !isValidPhone(initialDigits)) return;
    autoSent.current = true;
    send();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDigits]);

  const verify = async (value = code) => {
    if (value.length !== CODE_LENGTH || busy) return;
    setBusy(true);
    try {
      await verifyPhoneCode(phone, value);
      haptics.success();
      actions.markPhoneVerified();
      onVerified();
    } catch (error) {
      haptics.warning();
      setCode('');
      showError(error, t('failures.verify'));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    try {
      await sendPhoneCode(phone);
      setResent(true);
      haptics.success();
    } catch (error) {
      showError(error, t('failures.codeSend'));
    }
  };

  const skip = onSkip && <Button title={t('onboarding.skip')} variant="ghost" onPress={onSkip} />;

  if (phase === 'phone') {
    return (
      <OnboardingStep
        title={t('phoneVerify.title')}
        subtitle={t('phoneVerify.subtitle')}
        footer={
          <>
            <Button title={t('phoneVerify.send')} onPress={send} disabled={!isValidPhone(digits)} loading={busy} />
            {skip}
          </>
        }>
        <BigInput
          prefix="🇹🇷 +90"
          valid={isValidPhone(digits)}
          value={formatPhone(digits)}
          onChangeText={(text) => setDigits(phoneDigits(text))}
          placeholder="5XX XXX XX XX"
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          autoFocus
          maxLength={13}
          onSubmitEditing={send}
        />
      </OnboardingStep>
    );
  }

  return (
    <OnboardingStep
      title={t('phoneVerify.codeTitle')}
      subtitle={t('phoneVerify.codeSubtitle', { phone: `+90 ${formatPhone(digits)}` })}
      footer={
        <>
          <Button
            title={t('phoneVerify.verify')}
            onPress={() => verify()}
            disabled={code.length !== CODE_LENGTH}
            loading={busy}
          />
          {skip}
        </>
      }>
      <BigInput
        value={code}
        onChangeText={(text) => {
          const next = text.replace(/\D/g, '').slice(0, CODE_LENGTH);
          setCode(next);
          if (next.length === CODE_LENGTH) verify(next);
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
      <View style={styles.links}>
        {resent ? (
          <Text variant="footnote" color={colors.textSecondary}>
            {t('phoneVerify.resent')}
          </Text>
        ) : (
          <PressableScale onPress={resend} haptic={false}>
            <Text variant="footnote" color={colors.primary} style={styles.bold}>
              {t('phoneVerify.resend')}
            </Text>
          </PressableScale>
        )}
        <PressableScale onPress={() => setPhase('phone')} haptic={false}>
          <Text variant="footnote" color={colors.primary} style={styles.bold}>
            {t('phoneVerify.changeNumber')}
          </Text>
        </PressableScale>
      </View>
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  code: {
    letterSpacing: 8,
    fontVariant: ['tabular-nums'],
  },
  links: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  bold: {
    fontWeight: '600',
  },
});
