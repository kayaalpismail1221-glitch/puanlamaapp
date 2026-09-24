import type { Place } from '@/types';

/**
 * Dijital ayak izi: bir kullanıcının puanladığı mekânların haritadaki dağılımı.
 * Harita açılışta İstanbul'a (orada mekân yoksa en çok gidilen şehre) odaklanır.
 */

export type FootprintItem = { place: Place; score: number };

export type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };

export type FootprintCity = { name: string; count: number; region: Region };

export const HOME_CITY = 'İstanbul';

export const ISTANBUL_REGION: Region = {
  latitude: 41.03,
  longitude: 29.0,
  latitudeDelta: 0.32,
  longitudeDelta: 0.32,
};

/** Noktaların hepsini kenarlarda biraz boşlukla gösteren bölge */
export function regionFor(points: { latitude: number; longitude: number }[], minDelta = 0.03): Region | undefined {
  if (!points.length) return undefined;
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)];
  const [minLng, maxLng] = [Math.min(...lngs), Math.max(...lngs)];
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(minDelta, (maxLat - minLat) * 1.5),
    longitudeDelta: Math.max(minDelta, (maxLng - minLng) * 1.5),
  };
}

/** Şehirler, en çok mekân puanlanan önce (İstanbul eşitlikte önde) */
export function footprintCities(items: FootprintItem[]): FootprintCity[] {
  const byCity = new Map<string, Place[]>();
  for (const { place } of items) byCity.set(place.city, [...(byCity.get(place.city) ?? []), place]);
  return [...byCity.entries()]
    .map(([name, places]) => ({ name, count: places.length, region: regionFor(places)! }))
    .sort((a, b) => b.count - a.count || Number(b.name === HOME_CITY) - Number(a.name === HOME_CITY));
}

/** Açılış bölgesi: İstanbul'da mekân varsa İstanbul, yoksa en çok gidilen şehir */
export function initialCity(cities: FootprintCity[]): FootprintCity | undefined {
  return cities.find((c) => c.name === HOME_CITY) ?? cities[0];
}

export type FootprintStats = { places: number; cities: number; districts: number };

export function footprintStats(items: FootprintItem[]): FootprintStats {
  return {
    places: items.length,
    cities: new Set(items.map((i) => i.place.city)).size,
    districts: new Set(items.map((i) => `${i.place.city}/${i.place.district}`)).size,
  };
}
