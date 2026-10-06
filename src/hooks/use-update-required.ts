import * as Application from 'expo-application';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { fetchMinVersion } from '@/api/app';
import { isBelowMinVersion } from '@/lib/version';

/** Expo Go'da yüklü sürüm Expo Go'nun kendisi; web'de mağaza yok */
const checkable =
  (Platform.OS === 'ios' || Platform.OS === 'android') &&
  Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

/** Uygulamaya dönüşte en fazla bu sıklıkla sorulur */
const CHECK_INTERVAL = 30 * 60 * 1000;

/**
 * Yüklü sürüm (`nativeApplicationVersion`, ör. "1.0.1") sunucudaki en düşük sürümün altındaysa true.
 * Açılışta ve uygulamaya her dönüşte (30 dakikada bir) denetlenir. Yanıt alınamazsa önceki sonuç korunur:
 * çevrimdışı açılış kilitlenmez, kilitlenmiş uygulama da ağ hatasıyla açılmaz.
 */
export function useUpdateRequired() {
  const [required, setRequired] = useState(false);

  useEffect(() => {
    if (!checkable) return;
    let lastCheck = 0;
    let active = true;
    const check = async () => {
      if (Date.now() - lastCheck < CHECK_INTERVAL) return;
      lastCheck = Date.now();
      const min = await fetchMinVersion(Platform.OS as 'ios' | 'android').catch(() => null);
      if (!active) return;
      if (min === null) {
        lastCheck = 0; // bir sonraki dönüşte yeniden dene
        return;
      }
      setRequired(isBelowMinVersion(Application.nativeApplicationVersion, min));
    };
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  return required;
}
