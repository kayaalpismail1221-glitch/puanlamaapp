/**
 * Liderlik tablosu: XP'ye göre (puanlama, gönderi, fotoğraf, beğeni, davet; bkz. `lib/xp.ts`).
 * Sıralama sunucuda hesaplanır (bkz. `leaderboard` veritabanı fonksiyonu).
 */

export type LeaderboardPeriod = 'all' | 'month';

export type LeaderboardScope = 'all' | 'friends' | 'school';

/** XP'nin nereden geldiği (sayılar; XP karşılıkları `lib/xp.ts`) */
export type XpBreakdown = {
  ratings: number;
  posts: number;
  photoPosts: number;
  likes: number;
  invites: number;
  welcome: number;
};

export type LeaderboardEntry = {
  userId: string;
  xp: number;
  /** Yarışma usulü sıra: 1, 2, 2, 4 */
  rank: number;
  breakdown: XpBreakdown;
};
