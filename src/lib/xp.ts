import type { SFSymbol } from 'expo-symbols';

/**
 * XP kuralları ve seviyeler. Sunucudaki `xp_totals` ile aynı değerler: XP ayrıca saklanmaz, mekân puanları,
 * gönderiler, beğeniler ve davetlerden hesaplanır (gönderi silinince XP'si de düşer).
 */

export const XP = {
  rating: 10,
  post: 20,
  photoBonus: 20,
  like: 2,
  invite: 100,
  welcome: 50,
} as const;

/** Günde bu kadar mekân puanlaması XP getirir (puan makinesine karşı) */
export const DAILY_RATING_CAP = 20;

export type XpRule = { key: 'photoPost' | 'post' | 'rating' | 'like' | 'invite' | 'welcome'; icon: SFSymbol; xp: number };

/** Tanıtımda ve bilgi ekranında gösterilen sıra: en çok kazandıran önce */
export const XP_RULES: XpRule[] = [
  { key: 'invite', icon: 'person.2.fill', xp: XP.invite },
  { key: 'photoPost', icon: 'camera.fill', xp: XP.post + XP.photoBonus },
  { key: 'welcome', icon: 'hand.wave.fill', xp: XP.welcome },
  { key: 'post', icon: 'text.bubble.fill', xp: XP.post },
  { key: 'rating', icon: 'star.fill', xp: XP.rating },
  { key: 'like', icon: 'heart.fill', xp: XP.like },
];

export type Level = { key: 'rookie' | 'curious' | 'foodie' | 'master' | 'legend'; min: number; icon: SFSymbol };

export const LEVELS: Level[] = [
  { key: 'rookie', min: 0, icon: 'leaf.fill' },
  { key: 'curious', min: 100, icon: 'fork.knife' },
  { key: 'foodie', min: 300, icon: 'flame.fill' },
  { key: 'master', min: 800, icon: 'star.circle.fill' },
  { key: 'legend', min: 2000, icon: 'crown.fill' },
];

/** Seviye ve bir sonrakine ilerleme (0–1); en üst seviyede `next` yok */
export function levelOf(xp: number): { level: Level; next?: Level; progress: number } {
  const index = LEVELS.findLastIndex((l) => xp >= l.min);
  const level = LEVELS[Math.max(index, 0)]!;
  const next = LEVELS[index + 1];
  const progress = next ? (xp - level.min) / (next.min - level.min) : 1;
  return { level, next, progress: Math.min(Math.max(progress, 0), 1) };
}
