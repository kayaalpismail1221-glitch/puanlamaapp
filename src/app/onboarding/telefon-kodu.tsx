import { router } from 'expo-router';

import { PhoneVerification } from '@/components/phone-verification';
import { useAppActions, useAppSelector } from '@/store/app-store';

/** Kayıt sonrası: kayıtta girilen numarayı SMS koduyla doğrula (atlanabilir), sonra ilk puan */
export default function PhoneCodeStep() {
  const phone = useAppSelector((s) => s.draft.phone);
  const actions = useAppActions();
  const next = () => {
    actions.updateDraft({ phone: undefined });
    router.replace('/onboarding/ilk-puan');
  };
  return <PhoneVerification initialDigits={phone} onVerified={next} onSkip={next} />;
}
