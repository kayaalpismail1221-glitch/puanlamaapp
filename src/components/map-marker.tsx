import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Marker, type MapMarkerProps } from 'react-native-maps';

const android = Platform.OS === 'android';
const UNSET = Symbol('unset');
/** Görünüm yerleşip ikon fontu yüklenene kadar çizim açık kalır */
const SETTLE_MS = 700;

/**
 * Özel görünümlü (React bileşeni) pin. Android'de Google Haritalar her pini sürekli yeniden
 * bitmap'e çevirir (`tracksViewChanges`); onlarca pinde harita takılır. Burada pin çizilince dondurulur,
 * `redrawKey` değişince (ör. seçili pin büyüyünce) kısa süre yeniden çizilir. iOS'ta davranış değişmez.
 */
export function ViewMarker({ redrawKey, children, ...props }: MapMarkerProps & { redrawKey?: string | number | boolean }) {
  const [settledKey, setSettledKey] = useState<unknown>(UNSET);
  useEffect(() => {
    if (!android) return;
    const timer = setTimeout(() => setSettledKey(redrawKey), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [redrawKey]);
  return (
    <Marker {...props} tracksViewChanges={android ? settledKey !== redrawKey : props.tracksViewChanges}>
      {children}
    </Marker>
  );
}
