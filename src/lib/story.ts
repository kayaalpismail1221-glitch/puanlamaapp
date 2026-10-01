import type { ScoredPlace } from '@/lib/insights';
import type { Cuisine } from '@/types';

/**
 * Instagram hikâyesi kartlarının verisi (bkz. app/hikaye, components/story-cards).
 * Kartlar 9:16 çizilir ve 1080×1920 olarak dışa aktarılır.
 */

/** Kartın çizildiği mantıksal boyut; dışa aktarımda 2 katına (1080×1920) ölçeklenir */
export const STORY_SIZE = { width: 540, height: 960 } as const;
export const STORY_EXPORT = { width: 1080, height: 1920 } as const;

export type StoryKind = 'favorites' | 'top5' | 'map' | 'recap' | 'post' | 'list' | 'goal';

/** Yıllık mekân hedefi: bu yıl puanlanan mekân sayısı (`placesThisYear`) ve yıl sonuna kalan gün */
export type GoalProgress = { year: number; goal: number; done: number; daysLeft: number };

/** Puanlanma tarihiyle birlikte mekân (aylık özet için) */
export type DatedPlace = ScoredPlace & { ratedAt: string };

export type MonthRecap = {
  /** Ayın ilk günü (ISO) */
  month: string;
  places: number;
  posts: number;
  districts: number;
  average: number;
  topCuisine?: { cuisine: Cuisine; count: number };
  /** Ayın en yüksek puanlı mekânı */
  best?: ScoredPlace;
};

const sameMonth = (iso: string, year: number, month: number) => {
  const d = new Date(iso);
  return d.getFullYear() === year && d.getMonth() === month;
};

/**
 * Özetin ayı: bu ay puanlama varsa bu ay, yoksa geçen ay (ay başında kart boş kalmasın).
 * İkisinde de yoksa özet yok.
 */
export function recapMonth(dates: string[], now = new Date()): { year: number; month: number } | null {
  const current = { year: now.getFullYear(), month: now.getMonth() };
  if (dates.some((d) => sameMonth(d, current.year, current.month))) return current;
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previous = { year: prev.getFullYear(), month: prev.getMonth() };
  return dates.some((d) => sameMonth(d, previous.year, previous.month)) ? previous : null;
}

export function monthRecap(
  items: DatedPlace[],
  postDates: string[],
  period: { year: number; month: number },
): MonthRecap {
  const inMonth = items.filter((i) => sameMonth(i.ratedAt, period.year, period.month));
  const cuisines = new Map<Cuisine, number>();
  for (const { place } of inMonth) cuisines.set(place.cuisine, (cuisines.get(place.cuisine) ?? 0) + 1);
  const [topCuisine] = [...cuisines.entries()].sort((a, b) => b[1] - a[1]);
  const best = [...inMonth].sort((a, b) => b.score - a.score)[0];

  return {
    month: new Date(period.year, period.month, 1).toISOString(),
    places: inMonth.length,
    posts: postDates.filter((d) => sameMonth(d, period.year, period.month)).length,
    districts: new Set(inMonth.map((i) => `${i.place.city}/${i.place.district}`)).size,
    average: inMonth.length ? inMonth.reduce((s, i) => s + i.score, 0) / inMonth.length : 0,
    topCuisine: topCuisine && { cuisine: topCuisine[0], count: topCuisine[1] },
    best: best && { place: best.place, score: best.score },
  };
}
