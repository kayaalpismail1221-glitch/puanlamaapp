import { router } from 'expo-router';
import { useState } from 'react';

import { BigInput, OnboardingStep } from '@/components/onboarding-step';
import { Button } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { formatPhone, isValidPhone, phoneDigits } from '@/lib/validation';
import { useAppStore } from '@/store/app-store';

/** 1. Telefon numarası */
export default function PhoneStep() {
  const { profile, dispatch } = useAppStore();
  const [digits, setDigits] = useState(profile?.phone ?? '');
  const [touched, setTouched] = useState(false);
  const valid = isValidPhone(digits);

  const next = () => {
    if (!valid) {
      setTouched(true);
      haptics.warning();
      return;
    }
    dispatch({ type: 'updateProfile', patch: { phone: digits } });
    router.push('/onboarding/eposta');
  };

  return (
    <OnboardingStep
      title="Telefon numaran ne?"
      subtitle="Arkadaşların seni rehberinden bulabilsin. Numaran profilinde görünmez."
      footer={<Button title="Devam" onPress={next} disabled={digits.length < 10} />}>
      <BigInput
        prefix="🇹🇷 +90"
        valid={valid}
        value={formatPhone(digits)}
        onChangeText={(t) => setDigits(phoneDigits(t))}
        placeholder="5XX XXX XX XX"
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        autoFocus
        maxLength={13}
        onSubmitEditing={next}
        error={touched && !valid ? 'Geçerli bir cep telefonu gir (5 ile başlamalı).' : undefined}
        hint="Doğrulama kodu hesap sistemi bağlanınca gönderilecek."
      />
    </OnboardingStep>
  );
}
