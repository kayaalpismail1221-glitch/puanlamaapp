import { useMemo } from 'react';

import { USERS } from '@/data/mock';
import { buildLeaderboard, type LeaderboardPeriod } from '@/lib/leaderboard';
import { useAppStore } from '@/store/app-store';
import { ME } from '@/types';

export type LeaderboardScope = 'all' | 'friends' | 'school';

/**
 * Liderlik tablosu: genel, arkadaşlar arası ya da bir okula özel.
 * `schoolId` yalnızca 'school' kapsamında kullanılır.
 */
export function useLeaderboard(scope: LeaderboardScope, period: LeaderboardPeriod, schoolId?: string) {
  const { posts, likedPosts, following, profile } = useAppStore();

  return useMemo(() => {
    const everyone = [...USERS.map((u) => ({ id: u.id, schoolId: u.schoolId })), { id: ME, schoolId: profile?.schoolId }];
    const userIds =
      scope === 'all'
        ? everyone.map((u) => u.id)
        : scope === 'friends'
          ? [ME, ...following]
          : everyone.filter((u) => schoolId && u.schoolId === schoolId).map((u) => u.id);
    return buildLeaderboard(posts, userIds, period, (p) => p.likeCount + (likedPosts.includes(p.id) ? 1 : 0));
  }, [posts, likedPosts, following, profile?.schoolId, scope, period, schoolId]);
}
