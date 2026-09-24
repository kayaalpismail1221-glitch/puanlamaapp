import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BigInput, OnboardingStep } from '@/components/onboarding-step';
import { Button } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { isValidEmail } from '@/lib/validation';
import { useAppStore } from '@/store/app-store';

/** 2. E-posta */
export default function EmailStep() {
  const { draft, actions } = useAppStore();
  const { t } = useTranslation();
  const [email, setEmail] = useState(draft.email ?? '');
  const [touched, setTouched] = useState(false);
  const valid = isValidEmail(email);

  const next = () => {
    if (!valid) {
      setTouched(true);
      haptics.warning();
      return;
    }
    actions.updateDraft({ email: email.trim().toLowerCase() });
    router.push('/onboarding/ad');
  };

  return (
    <OnboardingStep
      title={t('onboarding.emailTitle')}
      subtitle={t('onboarding.emailSubtitle')}
      footer={<Button title={t('onboarding.next')} onPress={next} disabled={!email.trim()} />}>
      <BigInput
        value={email}
        onChangeText={(text) => {
          setEmail(text);
          if (touched) setTouched(false);
        }}
        placeholder={t('onboarding.emailPlaceholder')}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        onSubmitEditing={next}
        style={{ fontSize: 24 }}
        valid={valid}
        error={touched && !valid ? t('onboarding.emailInvalid') : undefined}
      />
    </OnboardingStep>
  );
}
