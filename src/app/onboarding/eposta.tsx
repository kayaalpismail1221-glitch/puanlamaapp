import { router } from 'expo-router';
import { useState } from 'react';

import { BigInput, OnboardingStep } from '@/components/onboarding-step';
import { Button } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { isValidEmail } from '@/lib/validation';
import { useAppStore } from '@/store/app-store';

/** 2. E-posta */
export default function EmailStep() {
  const { profile, dispatch } = useAppStore();
  const [email, setEmail] = useState(profile?.email ?? '');
  const [touched, setTouched] = useState(false);
  const valid = isValidEmail(email);

  const next = () => {
    if (!valid) {
      setTouched(true);
      haptics.warning();
      return;
    }
    dispatch({ type: 'updateProfile', patch: { email: email.trim().toLocaleLowerCase('tr') } });
    router.push('/onboarding/ad');
  };

  return (
    <OnboardingStep
      step={2}
      title="E-posta adresin?"
      subtitle="Hesabını kurtarmak ve önemli bildirimler için kullanacağız."
      footer={<Button title="Devam" onPress={next} disabled={!email.trim()} />}>
      <BigInput
        value={email}
        onChangeText={(t) => {
          setEmail(t);
          if (touched) setTouched(false);
        }}
        placeholder="ornek@mail.com"
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        onSubmitEditing={next}
        style={{ fontSize: 24 }}
        error={touched && !valid ? 'Bu e-posta adresi geçerli görünmüyor.' : undefined}
      />
    </OnboardingStep>
  );
}
