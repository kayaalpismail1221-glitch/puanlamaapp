import type { Post } from '@/types';

export type LeaderboardPeriod = 'all' | 'month';

export type LeaderboardEntry = {
  userId: string;
  /** Paylaşılan değerlendirme (gönderi) sayısı */
  reviews: number;
  /** Değerlendirmelerin aldığı toplam beğeni (eşitlikte belirleyici) */
  likes: number;
  rank: number;
};

const inCurrentMonth = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
};

/**
 * Liderlik tablosu: en çok değerlendirme paylaşan üstte.
 * Eşitlikte daha çok beğeni alan öne geçer; o da eşitse aynı sırayı paylaşırlar.
 */
export function buildLeaderboard(
  posts: Post[],
  userIds: string[],
  period: LeaderboardPeriod,
  likesOf: (post: Post) => number,
): LeaderboardEntry[] {
  const stats = new Map(userIds.map((id) => [id, { reviews: 0, likes: 0 }]));
  for (const post of posts) {
    const s = stats.get(post.userId);
    if (!s || (period === 'month' && !inCurrentMonth(post.createdAt))) continue;
    s.reviews += 1;
    s.likes += likesOf(post);
  }

  const sorted = [...stats.entries()]
    .map(([userId, s]) => ({ userId, ...s }))
    .sort((a, b) => b.reviews - a.reviews || b.likes - a.likes);

  // Yarışma usulü sıralama: 1, 2, 2, 4
  let rank = 0;
  return sorted.map((e, i) => {
    const prev = sorted[i - 1];
    if (!prev || prev.reviews !== e.reviews || prev.likes !== e.likes) rank = i + 1;
    return { ...e, rank };
  });
}
