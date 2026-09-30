import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { BackHandler, Platform } from 'react-native';

/**
 * Android geri tuşu/hareketi, ekran odaktayken: `handler` true dönerse varsayılan geri gitme olmaz.
 * iOS'ta karşılığı `gestureEnabled: false` / `headerBackVisible: false`; orada hiçbir şey yapmaz.
 * `handler` her çizimde yeniden bağlanmasın diye çağıran taraf onu `useCallback` ile sabitlemeli
 * (React Compiler açık ekranlarda kendiliğinden sabitlenir).
 */
export function useHardwareBack(handler: () => boolean) {
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;
      const subscription = BackHandler.addEventListener('hardwareBackPress', handler);
      return () => subscription.remove();
    }, [handler]),
  );
}

/** Hesap açıldıktan sonraki kurulum adımları: geri tuşu kayıt ekranlarına döndürmesin */
const stay = () => true;
export const useBlockHardwareBack = () => useHardwareBack(stay);
