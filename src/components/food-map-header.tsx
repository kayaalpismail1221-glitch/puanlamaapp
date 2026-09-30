import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { HeaderAction } from '@/components/header-button';

/**
 * Büyük lezzet haritasının sağ üstündeki paylaş düğmesi. Rota tanımında sabit durur (kök düzen):
 * ekran her dokunuşta başlık ayarlarını yeniden vermez; yakınlaşma geçişiyle açılan ekranda başlık düğmeleri
 * böylece kaybolmaz.
 */
export function FoodMapShareButton({ userId }: { userId: string }) {
  const { t } = useTranslation();
  return (
    <HeaderAction
      icon="square.and.arrow.up"
      iosSize={20}
      onPress={() => router.push({ pathname: '/harita-paylas/[id]', params: { id: userId } })}
      accessibilityLabel={t('tasteMap.share')}
    />
  );
}
