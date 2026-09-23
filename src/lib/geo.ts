import { PLACES } from '@/data/mock';
import type { Place } from '@/types';

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
  if (km < 1) return `${Math.max(100, Math.round((km * 1000) / 100) * 100)} m`;
  return `${km < 10 ? km.toFixed(1).replace('.', ',') : Math.round(km)} km`;
}

export type District = { name: string; center: Coords; placeCount: number };
export type City = { name: string; center: Coords; districts: District[] };

const centerOf = (places: Place[]): Coords => ({
  latitude: places.reduce((s, p) => s + p.latitude, 0) / places.length,
  longitude: places.reduce((s, p) => s + p.longitude, 0) / places.length,
});

/**
 * Şehir ve ilçe listesi. Şimdilik mekân verisinden türetiliyor;
 * gerçek veritabanına geçince il/ilçe tablosundan gelecek.
 */
export const CITIES: City[] = (() => {
  const byCity = new Map<string, Place[]>();
  for (const p of PLACES) byCity.set(p.city, [...(byCity.get(p.city) ?? []), p]);
  return [...byCity.entries()]
    .map(([name, places]) => {
      const byDistrict = new Map<string, Place[]>();
      for (const p of places) byDistrict.set(p.district, [...(byDistrict.get(p.district) ?? []), p]);
      return {
        name,
        center: centerOf(places),
        districts: [...byDistrict.entries()]
          .map(([d, ps]) => ({ name: d, center: centerOf(ps), placeCount: ps.length }))
          .sort((a, b) => a.name.localeCompare(b.name, 'tr')),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
})();

/** Konuma en yakın şehir */
export function nearestCity(coords: Coords): City | undefined {
  return [...CITIES].sort((a, b) => distanceKm(coords, a.center) - distanceKm(coords, b.center))[0];
}

/**
 * Popülerlik puanı: etkileşim yaşa göre sönümlenir (Hacker News tarzı).
 * Yeni ve çok beğenilen gönderiler öne çıkar; eski gönderiler yavaşça aşağı iner.
 */
export function hotScore({ likes, comments, createdAt }: { likes: number; comments: number; createdAt: string }) {
  const hours = Math.max(0, (Date.now() - new Date(createdAt).getTime()) / 3_600_000);
  return (likes + comments * 2 + 1) / Math.pow(hours + 2, 1.3);
}
