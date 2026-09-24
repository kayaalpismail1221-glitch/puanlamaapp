import type { RankedEntry } from '@/types';

/** Haftanın başlangıcı (Pazartesi 00:00) */
function weekStart(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

const WEEK = 7 * 24 * 3600_000;

/**
 * Seri: art arda kaç haftadır en az bir mekân puanlandı ya da gönderi paylaşıldı.
 * Bu hafta henüz etkinlik yoksa seri geçen haftadan devam eder (hafta bitene kadar bozulmaz).
 */
export function weeklyStreak(dates: string[]): number {
  const weeks = new Set(dates.map((iso) => weekStart(new Date(iso))));
  let cursor = weekStart(new Date());
  if (!weeks.has(cursor)) cursor -= WEEK;
  let streak = 0;
  while (weeks.has(cursor)) {
    streak += 1;
    cursor -= WEEK;
  }
  return streak;
}

/** Bu yıl puanlanan mekân sayısı (yıllık hedef için) */
export function placesThisYear(entries: RankedEntry[]): number {
  const year = new Date().getFullYear();
  return entries.filter((e) => new Date(e.ratedAt).getFullYear() === year).length;
}
