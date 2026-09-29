import { router } from 'expo-router';
import { SymbolView } from '@/components/symbol';
import { useTranslation } from 'react-i18next';

import { PressableScale } from '@/components/ui';
import { colors, hitSlop } from '@/constants/theme';

/**
 * Büyük lezzet haritasının sağ üstündeki paylaş düğmesi. Rota tanımında sabit durur (kök düzen):
 * ekran her dokunuşta başlık ayarlarını yeniden vermez; yakınlaşma geçişiyle açılan ekranda başlık düğmeleri
 * böylece kaybolmaz.
 */
export function FoodMapShareButton({ userId }: { userId: string }) {
  const { t } = useTranslation();
  return (
    <PressableScale
      onPress={() => router.push({ pathname: '/harita-paylas/[id]', params: { id: userId } })}
      hitSlop={hitSlop}
      accessibilityLabel={t('tasteMap.share')}>
      <SymbolView name="square.and.arrow.up" tintColor={colors.primary} size={20} />
    </PressableScale>
  );
}
