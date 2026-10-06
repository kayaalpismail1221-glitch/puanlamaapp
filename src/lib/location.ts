import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import type { Coords } from '@/lib/geo';

export type LocationStatus = 'loading' | 'granted' | 'denied' | 'undetermined' | 'error';

/**
 * Güncel konum. Dengeli hassasiyet (Wi-Fi/baz istasyonu) hızlıdır ama bazen konum veremez ("Current location is
 * unavailable": kapalı alan, Android'de ağ konumu yok); o zaman GPS'le bir kez daha denenir.
 */
async function currentPosition() {
  for (const accuracy of [Location.Accuracy.Balanced, Location.Accuracy.High]) {
    try {
      return await Location.getCurrentPositionAsync({ accuracy });
    } catch (e) {
      if (__DEV__) console.warn('[location]', accuracy, e);
    }
  }
  return null;
}

/**
 * İzin bir ekranda verilince aynı anda konum bekleyen diğer kullanıcılar (ör. ilk puan ekranındaki izin kartı ve
 * altındaki mekân araması) da konumu alsın. Dinleyiciye izni isteyen örnek verilir, kendisi yeniden yüklemez.
 */
const grantListeners = new Set<(source: object) => void>();

/**
 * Kullanıcının konumu. `enabled` false iken izin istemez.
 * İzin daha önce sorulmadıysa `ask` true ise ilk kullanımda sorar; false ise yalnızca izin verilmişse konumu alır
 * (ör. arama sonuçlarını yakınlığa göre sıralamak için, kullanıcıyı rahatsız etmeden).
 */
export function useUserLocation(enabled: boolean, ask = true) {
  const [status, setStatus] = useState<LocationStatus>('loading');
  const [coords, setCoords] = useState<Coords | null>(null);

  // Android: kullanıcı bu oturumda izin düğmesine bastı mı (bastıysa ve hâlâ ret varsa Ayarlar gerekir)
  const askedByUser = useRef(false);
  // Bu örneğin kimliği (izin duyurusunda kendini ayırt etmek için)
  const [self] = useState(() => ({}));

  const load = useCallback(async (ask: boolean, byUser = false) => {
    try {
      let perm = await Location.getForegroundPermissionsAsync();
      // Android'de pencere kapatılınca/bir kez reddedilince izin "denied" görünür ama sistem yeniden sorabilir;
      // Expo'nun `canAskAgain` tahmini bunu ayırt edemiyor. Kullanıcı düğmeye basınca Android'de her zaman istenir:
      // sistem sorabiliyorsa pencere çıkar, kalıcı retse hemen döner. iOS'ta reddedilen izin sorulamaz (Ayarlar).
      const askable =
        perm.status === 'undetermined' || (Platform.OS === 'android' && byUser && perm.status === 'denied');
      if (askable && ask) {
        perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status === 'granted') for (const listener of grantListeners) listener(self);
      }
      if (byUser) askedByUser.current = true;
      if (perm.status !== 'granted') {
        const blocked =
          perm.status === 'denied' && (Platform.OS === 'android' ? askedByUser.current : true);
        setStatus(blocked ? 'denied' : 'undetermined');
        return;
      }
      setStatus('granted');
      // Önce hızlı olan son bilinen konum, ardından güncel konum
      const last = await Location.getLastKnownPositionAsync();
      if (last) setCoords(last.coords);
      const current = await currentPosition();
      if (current) setCoords(current.coords);
      else if (!last) setStatus('error');
    } catch (e) {
      if (__DEV__) console.warn('[location]', e);
      setStatus('error');
    }
  }, [self]);

  // Başka bir ekran izni aldıysa sormadan konumu al
  useEffect(() => {
    if (!enabled) return;
    const listener = (source: object) => {
      if (source !== self) load(false);
    };
    grantListeners.add(listener);
    return () => {
      grantListeners.delete(listener);
    };
  }, [enabled, load, self]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    // Efekt içinde doğrudan setState yerine asenkron yükleme
    Promise.resolve().then(() => {
      if (active) load(ask);
    });
    return () => {
      active = false;
    };
  }, [enabled, ask, load]);

  return { status, coords, retry: () => load(true, true) };
}
