import { project, type Point } from '@/lib/world-projection';
import type { Place, Post } from '@/types';

/**
 * Bir kullanıcının gittiği yerler (lezzet haritası): puanladığı ya da hakkında
 * gönderi paylaştığı mekânlar; şehir noktaları ve mutfak / şehir / ilçe kırılımı.
 */

export type VisitedPlace = {
  place: Place;
  /** Kullanıcının puanı (gönderi paylaşıp puanlamadıysa yok) */
  score?: number;
  /** Bu mekândaki gönderileri, en yeni başta */
  posts: Post[];
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

/* ---------- Harita noktaları ---------- */

export type CityDot = { key: string; count: number; point: Point };

/** Şehir başına bir nokta, şehirdeki mekânların ortalama konumunda */
export function cityDots(items: VisitedPlace[]): CityDot[] {
  const byCity = new Map<string, Place[]>();
  for (const { place } of items) byCity.set(place.city, [...(byCity.get(place.city) ?? []), place]);
  return [...byCity.entries()].map(([city, places]) => ({
    key: city,
    count: places.length,
    point: project(
      places.reduce((s, p) => s + p.latitude, 0) / places.length,
      places.reduce((s, p) => s + p.longitude, 0) / places.length,
    ),
  }));
}

/* ---------- Kırılım: mutfak, şehir, ilçe ---------- */

export type BreakdownKind = 'cuisine' | 'city' | 'district';
export type BreakdownSort = 'count' | 'score';

export type BreakdownRow = {
  key: string;
  label: string;
  /** İlçelerde şehir adı */
  sublabel?: string;
  count: number;
  /** Puanlanan mekânların ortalaması (hiç puan yoksa yok) */
  average?: number;
};

const keyOf = (kind: BreakdownKind, place: Place) =>
  kind === 'cuisine' ? place.cuisine : kind === 'city' ? place.city : `${place.city}/${place.district}`;

export function breakdown(items: VisitedPlace[], kind: BreakdownKind, sort: BreakdownSort): BreakdownRow[] {
  const groups = new Map<string, VisitedPlace[]>();
  for (const item of items) {
    const key = keyOf(kind, item.place);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const rows = [...groups.entries()].map(([key, list]) => {
    const scores = list.flatMap((i) => (i.score === undefined ? [] : [i.score]));
    const [first] = list;
    return {
      key,
      label: kind === 'district' ? first!.place.district : key,
      sublabel: kind === 'district' ? first!.place.city : undefined,
      count: list.length,
      average: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : undefined,
    };
  });
  return rows.sort((a, b) =>
    sort === 'score'
      ? (b.average ?? -1) - (a.average ?? -1) || b.count - a.count
      : b.count - a.count || (b.average ?? -1) - (a.average ?? -1) || a.label.localeCompare(b.label, 'tr'),
  );
}

/** Kırılımdaki bir satırın mekânları */
export function itemsOf(items: VisitedPlace[], kind: BreakdownKind, key: string): VisitedPlace[] {
  return items.filter((i) => keyOf(kind, i.place) === key);
}

export type VisitedSummary = { places: number; cities: number; posts: number };

export function visitedSummary(items: VisitedPlace[]): VisitedSummary {
  return {
    places: items.length,
    cities: new Set(items.map((i) => i.place.city)).size,
    posts: items.reduce((s, i) => s + i.posts.length, 0),
  };
}
