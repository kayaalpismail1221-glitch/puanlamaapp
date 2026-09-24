import type { Place, Post } from '@/types';

/**
 * Bir kullanıcının gittiği yerler: puanladığı ya da hakkında gönderi paylaştığı mekânlar.
 * Harita açılışta İstanbul'a (orada yer yoksa en çok gidilen şehre) odaklanır.
 */

export type VisitedPlace = {
  place: Place;
  /** Kullanıcının puanı (gönderi paylaşıp puanlamadıysa yok) */
  score?: number;
  /** Bu mekândaki gönderileri, en yeni başta */
  posts: Post[];
};

export type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };

export type VisitedCity = { name: string; count: number; region: Region };

export const HOME_CITY = 'İstanbul';

export const ISTANBUL_REGION: Region = {
  latitude: 41.03,
  longitude: 29.0,
  latitudeDelta: 0.32,
  longitudeDelta: 0.32,
};

/**
 * Puanlanan mekânlarla gönderi paylaşılan mekânları birleştirir.
 * Sıra: puanlılar yüksekten düşüğe, sonra yalnızca gönderisi olanlar (en yeni gönderi önce).
 */
export function mergeVisited(
  ranked: { place: Place; score: number }[],
  posts: Post[],
  placeOf: (id: string) => Place | undefined,
): VisitedPlace[] {
  const postsByPlace = new Map<string, Post[]>();
  for (const post of [...posts].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))) {
    postsByPlace.set(post.placeId, [...(postsByPlace.get(post.placeId) ?? []), post]);
  }
  const result: VisitedPlace[] = [...ranked]
    .sort((a, b) => b.score - a.score)
    .map((r) => ({ ...r, posts: postsByPlace.get(r.place.id) ?? [] }));
  const seen = new Set(result.map((r) => r.place.id));
  for (const [placeId, list] of postsByPlace) {
    const place = placeOf(placeId);
    if (place && !seen.has(placeId)) result.push({ place, posts: list });
  }
  return result;
}

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

/** Şehirler, en çok yer olan önce (eşitlikte İstanbul önde) */
export function visitedCities(items: VisitedPlace[]): VisitedCity[] {
  const byCity = new Map<string, Place[]>();
  for (const { place } of items) byCity.set(place.city, [...(byCity.get(place.city) ?? []), place]);
  return [...byCity.entries()]
    .map(([name, places]) => ({ name, count: places.length, region: regionFor(places)! }))
    .sort((a, b) => b.count - a.count || Number(b.name === HOME_CITY) - Number(a.name === HOME_CITY));
}

/** Açılış bölgesi: İstanbul'da yer varsa İstanbul, yoksa en çok gidilen şehir */
export function initialCity(cities: VisitedCity[]): VisitedCity | undefined {
  return cities.find((c) => c.name === HOME_CITY) ?? cities[0];
}
