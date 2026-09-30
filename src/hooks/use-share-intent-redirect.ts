import { router } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';
import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Android'de "Paylaş → Puanla": sistem uygulamayı bir paylaşım isteğiyle (ACTION_SEND) açar, bağlantı adresi
 * yoktur. Paylaşım geldiğinde karşılama ekranına geçilir; o ekran içeriği alıp Listem'e ekleme ekranını açar.
 * iOS'ta uzantı `puanla://dataUrl=…` bağlantısıyla açtığı için yönlendirme `+native-intent`'te.
 * Uygulama hazır ve kurulum bitmişken çalışır (onboarding'de paylaşım bekler).
 */
export function useShareIntentRedirect(ready: boolean) {
  const { hasShareIntent } = useShareIntentContext();
  useEffect(() => {
    if (Platform.OS !== 'android' || !ready || !hasShareIntent) return;
    router.push('/paylasim-al');
  }, [ready, hasShareIntent]);
}
