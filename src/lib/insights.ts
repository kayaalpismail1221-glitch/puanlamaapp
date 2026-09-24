import type { SFSymbol } from 'expo-symbols';

import type { Cuisine, Place } from '@/types';

export type ScoredPlace = { place: Place; score: number };

/* ---------- Damak zevki ---------- */

export type TasteSlice = { cuisine: Cuisine; count: number; share: number; average: number };

/** En çok gidilen mutfaklar: pay (%) ve ortalama puan */
export function tasteProfile(items: ScoredPlace[], limit = 4): TasteSlice[] {
  if (!items.length) return [];
  const map = new Map<Cuisine, { count: number; total: number }>();
  for (const { place, score } of items) {
    const s = map.get(place.cuisine) ?? { count: 0, total: 0 };
    map.set(place.cuisine, { count: s.count + 1, total: s.total + score });
  }
  return [...map.entries()]
    .map(([cuisine, s]) => ({ cuisine, count: s.count, share: s.count / items.length, average: s.total / s.count }))
    .sort((a, b) => b.count - a.count || b.average - a.average)
    .slice(0, limit);
}

/* ---------- Rozetler ---------- */

/** Başlık ve açıklama i18n'de: `badges.<id>.title` / `badges.<id>.description` */
export type Badge = {
  id: BadgeId;
  icon: SFSymbol;
  progress: number;
  target: number;
  earned: boolean;
};

type BadgeInput = { places: ScoredPlace[]; postCount: number; streakWeeks: number };

const countCuisines = (places: ScoredPlace[], cuisines: Cuisine[]) =>
  places.filter((p) => cuisines.includes(p.place.cuisine)).length;

export type BadgeId = 'ilk' | 'kahvalti' | 'esnaf' | 'sokak' | 'meyhane' | 'balik' | 'kasif' | 'yazar' | 'istikrar';

const DEFINITIONS: {
  id: BadgeId;
  icon: SFSymbol;
  target: number;
  value: (i: BadgeInput) => number;
}[] = [
  { id: 'ilk', icon: 'star.fill', target: 1, value: (i) => i.places.length },
  { id: 'kahvalti', icon: 'sun.horizon.fill', target: 3, value: (i) => countCuisines(i.places, ['Kahvaltıcı']) },
  { id: 'esnaf', icon: 'fork.knife', target: 3, value: (i) => countCuisines(i.places, ['Esnaf lokantası']) },
  { id: 'sokak', icon: 'flame.fill', target: 3, value: (i) => countCuisines(i.places, ['Dürümcü', 'Kokoreççi', 'Ciğerci']) },
  { id: 'meyhane', icon: 'wineglass.fill', target: 3, value: (i) => countCuisines(i.places, ['Meyhane']) },
  { id: 'balik', icon: 'fish.fill', target: 3, value: (i) => countCuisines(i.places, ['Balıkçı']) },
  { id: 'kasif', icon: 'map.fill', target: 5, value: (i) => new Set(i.places.map((p) => `${p.place.city}/${p.place.district}`)).size },
  { id: 'yazar', icon: 'text.bubble.fill', target: 5, value: (i) => i.postCount },
  { id: 'istikrar', icon: 'calendar', target: 4, value: (i) => i.streakWeeks },
];

/** Kazanılanlar önde, sonra hedefe en yakın olanlar */
export function computeBadges(input: BadgeInput): Badge[] {
  return DEFINITIONS.map(({ value, ...d }) => {
    const progress = Math.min(value(input), d.target);
    return { ...d, progress, earned: progress >= d.target };
  }).sort((a, b) => Number(b.earned) - Number(a.earned) || b.progress / b.target - a.progress / a.target);
}
