import type { Place } from '@/types';

/**
 * Liste düzenleyicisinin saf mantığı: aday mekânlar, filtre seçenekleri ve kaydedilecek sıra.
 * Sunucu listeyi her okumada sahibin puanına göre sıralar; burada gönderilen sıra yalnızca
 * puanı olmayanlar ve eşitlikler için kullanılır.
 */

export const LIST_MAX_PLACES = 50;
export const LIST_TITLE_MAX = 80;
export const LIST_DESCRIPTION_MAX = 300;
export const LIST_NOTE_MAX = 200;

/** Seçilebilir mekân: kullanıcının puanı (puanı silinmiş eski liste mekânında yok) */
export type ListCandidate = { place: Place; score?: number };

export type ListFilter = { cuisine?: string; district?: string };

export const matchesFilter = (c: ListCandidate, f: ListFilter) =>
  (!f.cuisine || c.place.cuisine === f.cuisine) && (!f.district || c.place.district === f.district);

/** Filtre çipleri: en çok mekânı olan önce */
export function facets(candidates: ListCandidate[], key: 'cuisine' | 'district'): [string, number][] {
  const counts = new Map<string, number>();
  for (const { place } of candidates) {
    const value = place[key];
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'tr'));
}

/**
 * Seçilenler, adayların sırasıyla (puanı yüksek önce), notlarıyla. Boş notlar gönderilmez.
 * En fazla LIST_MAX_PLACES mekân.
 */
export function selectedItems(candidates: ListCandidate[], selected: ReadonlyMap<string, string>) {
  return candidates
    .filter((c) => selected.has(c.place.id))
    .slice(0, LIST_MAX_PLACES)
    .map((c) => {
      const note = selected.get(c.place.id)?.trim();
      return { placeId: c.place.id, note: note || undefined };
    });
}

/** "Görünenleri seç": sınırı aşmadan filtredeki mekânları seçime ekler (var olan notlar korunur) */
export function selectAll(candidates: ListCandidate[], selected: ReadonlyMap<string, string>): Map<string, string> {
  const next = new Map(selected);
  for (const c of candidates) {
    if (next.size >= LIST_MAX_PLACES) break;
    if (!next.has(c.place.id)) next.set(c.place.id, '');
  }
  return next;
}
