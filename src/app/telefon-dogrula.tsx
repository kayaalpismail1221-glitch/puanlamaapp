import { router } from 'expo-router';

import { PhoneVerification } from '@/components/phone-verification';

/** Uygulama içinden telefon doğrulama (Arkadaş bul → Rehberinden bul) */
export default function VerifyPhoneModal() {
  return <PhoneVerification onVerified={() => router.back()} />;
}
