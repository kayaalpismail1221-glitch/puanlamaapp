import type { Ref } from 'react';
import MapView, { Marker, type MapMarkerProps, type MapViewProps } from 'react-native-maps';

/**
 * Uygulamadaki tüm haritalar. iOS'ta Apple Haritalar (react-native-maps) olduğu gibi; Android'de MapLibre +
 * OpenFreeMap (`app-map.android.tsx`, aynı arayüz). Ekranlar haritayı yalnızca bu dosyanın dışa aktardıklarıyla çizer.
 */
export function AppMapView({
  ref,
  decorative: _decorative,
  ...props
}: MapViewProps & {
  ref?: Ref<MapView>;
  /** Süs amaçlı harita (karşılama): Android'de atıf düğmesi gizlenir */
  decorative?: boolean;
}) {
  return <MapView ref={ref} {...props} />;
}

/**
 * Özel görünümlü pin (görünüm `children`). `redraw`: görünüm değişince değişen değer (seçili pin büyür, puan
 * değişir); Android'de pin bit eşlem olarak çizildiği için yeniden çizimi tetikler. iOS'ta gerekmez.
 */
export function PinMarker({ redraw: _redraw, ...props }: MapMarkerProps & { redraw?: string | number | boolean }) {
  return <Marker {...props} />;
}
