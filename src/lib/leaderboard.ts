/**
 * Liderlik tablosu: en çok değerlendirme (gönderi) paylaşan üstte, eşitlikte daha çok beğeni alan önde.
 * Sıralama sunucuda hesaplanır (bkz. `leaderboard` veritabanı fonksiyonu).
 */

export type LeaderboardPeriod = 'all' | 'month';

export type LeaderboardScope = 'all' | 'friends' | 'school';

export type LeaderboardEntry = {
  userId: string;
  /** Paylaşılan değerlendirme (gönderi) sayısı */
  reviews: number;
  /** Değerlendirmelerin aldığı toplam beğeni (eşitlikte belirleyici) */
  likes: number;
  /** Yarışma usulü sıra: 1, 2, 2, 4 */
  rank: number;
};
