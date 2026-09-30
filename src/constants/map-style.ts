import type { MapStyleElement } from 'react-native-maps';

/**
 * Android haritası (Google Maps) için sade stil: işletme/POI etiketleri ve toplu taşıma simgeleri gizli, yollar
 * yumuşak, su marka mavisine yakın. Puan pinleri haritada tek renkli öğe olarak öne çıksın diye.
 * iOS'ta Apple Haritalar kendi görünümünde kalır (`showsPointsOfInterests={false}`), bu stil kullanılmaz.
 */

const common: MapStyleElement[] = [
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
];

export const mapStyleLight: MapStyleElement[] = [
  ...common,
  { elementType: 'geometry', stylers: [{ color: '#F5F6F8' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6B7280' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#D9E1EB' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#0F1E3D' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#EEF0F3' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#E3EFE2' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#6B7280' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#E5E7EB' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#D9E1EB' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#9CA3AF' }] },
  { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#E5E7EB' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#CFDDED' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#7A8CA5' }] },
];

export const mapStyleDark: MapStyleElement[] = [
  ...common,
  { elementType: 'geometry', stylers: [{ color: '#16181C' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8E8E96' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0B0B0D' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#2E2E32' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#E5E7EB' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#1C1E23' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#18241C' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2A2D33' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#34383F' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#1C1E23' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#6D6D74' }] },
  { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#2A2D33' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#18212E' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#46505F' }] },
];
