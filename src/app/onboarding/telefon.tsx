import { router } from 'expo-router';

import { PhoneVerification } from '@/components/phone-verification';

const next = () => router.push('/onboarding/takip');

/**
 * İlk puandan sonra telefonu SMS koduyla doğrulama (isteğe bağlı; rehberden arkadaş bulma için). Kayıt yolundan
 * bağımsız: e-postayla da Google'la da gelen, numarası doğrulanmamış herkes görür. Yalnızca
 * `PHONE_VERIFICATION_ENABLED` açıkken `ilk-puan` buraya yönlendirir.
 */
export default function PhoneStep() {
  return <PhoneVerification onVerified={next} onSkip={next} />;
}
