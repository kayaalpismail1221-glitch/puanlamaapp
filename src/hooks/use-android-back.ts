import { useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';

/**
 * Android geri tuşu/hareketi ekran içi bir adımı geri alsın (ör. ilçe listesinden şehirlere dönmek); `handler`
 * yoksa varsayılan davranış (ekranı kapatma) geçerli. iOS'ta etkisiz.
 */
export function useAndroidBack(handler: (() => void) | null) {
  useEffect(() => {
    if (Platform.OS !== 'android' || !handler) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      handler();
      return true;
    });
    return () => subscription.remove();
  }, [handler]);
}
