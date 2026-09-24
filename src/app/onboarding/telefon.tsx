import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BigInput, OnboardingStep } from '@/components/onboarding-step';
import { Button } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { formatPhone, isValidPhone, phoneDigits } from '@/lib/validation';
import { useAppStore } from '@/store/app-store';

/** 1. Telefon numarası (isteğe bağlı; rehberden arkadaş bulma için) */
export default function PhoneStep() {
  const { draft, actions } = useAppStore();
  const { t } = useTranslation();
  const [digits, setDigits] = useState(draft.phone ?? '');
  const [touched, setTouched] = useState(false);
  const valid = isValidPhone(digits);

  const next = () => {
    if (!valid) {
      setTouched(true);
      haptics.warning();
      return;
    }
    actions.updateDraft({ phone: digits });
    router.push('/onboarding/eposta');
  };

  const skip = () => {
    actions.updateDraft({ phone: undefined });
    router.push('/onboarding/eposta');
  };

  return (
    <OnboardingStep
      title={t('onboarding.phoneTitle')}
      subtitle={t('onboarding.phoneSubtitle')}
      footer={
        <>
          <Button title={t('onboarding.next')} onPress={next} disabled={digits.length < 10} />
          <Button title={t('onboarding.skip')} variant="ghost" onPress={skip} />
        </>
      }>
      <BigInput
        prefix="🇹🇷 +90"
        valid={valid}
        value={formatPhone(digits)}
        onChangeText={(text) => {
          setDigits(phoneDigits(text));
          if (touched) setTouched(false);
        }}
        placeholder="5XX XXX XX XX"
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        autoFocus
        maxLength={13}
        onSubmitEditing={next}
        error={touched && !valid ? t('onboarding.phoneInvalid') : undefined}
      />
    </OnboardingStep>
  );
}
