/**
 * Damak uyumu ekranının bölümleri (sunucudan gelen ortak mekânlar üzerinden, saf mantık).
 * - Ortak favoriler: ikinizin de en az FAVORITE_MIN verdiği yerler, en düşük puanı yüksek olan önce
 * - Ayrıldığınız yerler: aradaki fark en az APART_MIN olanlar, en büyük fark önce
 */

export const FAVORITE_MIN = 8;
export const APART_MIN = 2;
const SECTION_SIZE = 5;

export type MatchPair<P> = { place: P; myScore: number; theirScore: number };

export function tasteMatchSections<P>(pairs: MatchPair<P>[]) {
  const favorites = pairs
    .filter((p) => p.myScore >= FAVORITE_MIN && p.theirScore >= FAVORITE_MIN)
    .sort((a, b) => Math.min(b.myScore, b.theirScore) - Math.min(a.myScore, a.theirScore))
    .slice(0, SECTION_SIZE);
  const gap = (p: MatchPair<P>) => Math.abs(p.myScore - p.theirScore);
  const apart = pairs
    .filter((p) => gap(p) >= APART_MIN)
    .sort((a, b) => gap(b) - gap(a))
    .slice(0, SECTION_SIZE);
  return { favorites, apart };
}
