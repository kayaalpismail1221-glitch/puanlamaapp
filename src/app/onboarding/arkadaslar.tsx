import { Alert } from 'react-native';

import { FriendFinder } from '@/components/friend-finder';
import { OnboardingStep } from '@/components/onboarding-step';
import { Button } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { useAppStore } from '@/store/app-store';

/** 5. Arkadaş bul (atlanabilir) */
export default function FindFriendsScreen() {
  const { dispatch, following } = useAppStore();
  const hasFriends = following.length > 0;

  // Protected rota, onboarded=true olunca kullanıcıyı otomatik olarak sekmelere taşır
  const finish = () => {
    haptics.success();
    dispatch({ type: 'completeOnboarding' });
  };

  return (
    <OnboardingStep
      step={4}
      title="Arkadaşlarını bul"
      subtitle="Onların nerede yediğini gör, tavsiyelerini kaçırma."
      footer={
        <Button
          title={hasFriends ? 'Bitir' : 'Şimdilik atla'}
          variant={hasFriends ? 'primary' : 'ghost'}
          onPress={finish}
        />
      }>
      <FriendFinder
        header={
          <Button
            title="Rehberden bul"
            icon="person.crop.circle.badge.plus"
            variant="secondary"
            onPress={() =>
              Alert.alert('Yakında', 'Rehber eşleştirmesi hesap sistemi bağlanınca gelecek.')
            }
          />
        }
      />
    </OnboardingStep>
  );
}
