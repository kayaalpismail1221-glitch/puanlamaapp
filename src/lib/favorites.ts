import type { ScoredPlace } from '@/lib/insights';
import type { Place } from '@/types';

/**
 * Favori 4 (Letterboxd'daki "Favorite Films" gibi): kişinin kendini en iyi anlatan dört mekânı.
 * Puanladıkları arasından seçilir, seçilen sırayla gösterilir (bkz. migration 20261012100000_favorite_places).
 */

export const FAVORITES_MAX = 4;

/**
 * Kimlikleri kişinin puanlarıyla eşleştirir. Puanı silinmiş ya da önbellekte olmayan mekân atlanır;
 * böylece silinen bir favori boş yuva olarak görünür.
 */
export function resolveFavorites(
  ids: readonly string[],
  scores: readonly { placeId: string; score: number }[],
  getPlace: (id: string) => Place | undefined,
): ScoredPlace[] {
  const byId = new Map(scores.map((s) => [s.placeId, s.score]));
  return ids.flatMap((id) => {
    const score = byId.get(id);
    const place = score === undefined ? undefined : getPlace(id);
    return place && score !== undefined ? [{ place, score }] : [];
  });
}

/** Seçimi aç/kapa: seçiliyse çıkar, değilse sona ekle; dolu listeye eklenmez (`null`) */
export function toggleFavorite(ids: readonly string[], placeId: string): string[] | null {
  if (ids.includes(placeId)) return ids.filter((id) => id !== placeId);
  if (ids.length >= FAVORITES_MAX) return null;
  return [...ids, placeId];
}
