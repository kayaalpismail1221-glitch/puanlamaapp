import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';

import type { Coords } from '@/lib/geo';

export type LocationStatus = 'loading' | 'granted' | 'denied' | 'undetermined' | 'error';

/**
 * Kullanıcının konumu. `enabled` false iken izin istemez.
 * İzin daha önce sorulmadıysa ilk kullanımda sorar.
 */
export function useUserLocation(enabled: boolean) {
  const [status, setStatus] = useState<LocationStatus>('loading');
  const [coords, setCoords] = useState<Coords | null>(null);

  const load = useCallback(async (ask: boolean) => {
    try {
      let perm = await Location.getForegroundPermissionsAsync();
      if (perm.status === 'undetermined' && ask) perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setStatus(perm.status === 'denied' ? 'denied' : 'undetermined');
        return;
      }
      setStatus('granted');
      // Önce hızlı olan son bilinen konum, ardından güncel konum
      const last = await Location.getLastKnownPositionAsync();
      if (last) setCoords(last.coords);
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords(current.coords);
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    // Efekt içinde doğrudan setState yerine asenkron yükleme
    Promise.resolve().then(() => {
      if (active) load(true);
    });
    return () => {
      active = false;
    };
  }, [enabled, load]);

  return { status, coords, retry: () => load(true) };
}
