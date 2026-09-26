import { Alert } from 'react-native';

import i18n from '@/i18n';
import { haptics } from '@/lib/haptics';

/**
 * Puanı silme onayı (mekân sayfası ve Top 3). Puan sıralamadan ve Top 3'ten çıkar;
 * gönderiler kendi puanlarını sakladığı için olduğu gibi kalır.
 */
export function confirmRemoveScore(placeName: string, remove: () => void) {
  Alert.alert(i18n.t('place.removeScoreTitle'), i18n.t('place.removeScoreText', { place: placeName }), [
    { text: i18n.t('common.cancel'), style: 'cancel' },
    {
      text: i18n.t('place.removeScore'),
      style: 'destructive',
      onPress: () => {
        haptics.success();
        remove();
      },
    },
  ]);
}
