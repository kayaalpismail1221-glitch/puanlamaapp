import { currentLanguage } from '@/i18n';

export type Coords = { latitude: number; longitude: number };

/** İki nokta arası kuş uçuşu mesafe (km) */
export function distanceKm(a: Coords, b: Coords): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(km: number): string {
  const decimal = currentLanguage() === 'tr' ? ',' : '.';
  if (km < 1) return `${Math.max(100, Math.round((km * 1000) / 100) * 100)} m`;
  return `${km < 10 ? km.toFixed(1).replace('.', decimal) : Math.round(km)} km`;
}

/** Varsayılan harita merkezi: Beşiktaş–Bebek hattı */
export const DEFAULT_REGION = {
  latitude: 41.03,
  longitude: 29.02,
  latitudeDelta: 0.14,
  longitudeDelta: 0.14,
};
