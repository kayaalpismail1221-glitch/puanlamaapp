import { Platform } from 'react-native';
import type { MapStyleElement } from 'react-native-maps';

/**
 * Harita ayarları. iOS'ta Apple Haritalar, Android'de Google Haritalar (react-native-maps varsayılanları).
 */

/** Android: iOS'taki `showsPointsOfInterests={false}` karşılığı; işletme ve durak simgeleri gizlenir, pinler öne çıkar */
const QUIET_STYLE: MapStyleElement[] = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
];

/** Tüm haritalar: Android'de Google'ın alt araç çubuğu (pine dokununca çıkan "Haritalar'da aç" düğmeleri) kapalı */
export const mapBaseProps = { toolbarEnabled: false } as const;

/** Kendi arayüzü olan tam ekran haritalar: Android'in sağ üstteki "konumum" düğmesi cam panellerle çakışmasın */
export const fullScreenMapProps = { ...mapBaseProps, showsMyLocationButton: false } as const;

/** Mekân simgesi olmayan sade harita (Puanla haritası, karşılama) */
export const quietMapProps = {
  ...fullScreenMapProps,
  showsPointsOfInterests: false,
  ...(Platform.OS === 'android' && { customMapStyle: QUIET_STYLE }),
};
