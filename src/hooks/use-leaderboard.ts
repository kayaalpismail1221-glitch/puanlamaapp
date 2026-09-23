import { useMemo } from 'react';

import { USERS } from '@/data/mock';
import { buildLeaderboard, type LeaderboardPeriod } from '@/lib/leaderboard';
import { useAppStore } from '@/store/app-store';
import { ME } from '@/types';

export type LeaderboardScope = 'all' | 'friends';

/** Genel ya da arkadaşlar arası liderlik tablosu */
export function useLeaderboard(scope: LeaderboardScope, period: LeaderboardPeriod) {
  const { posts, likedPosts, following } = useAppStore();

  return useMemo(() => {
    const userIds = scope === 'all' ? [...USERS.map((u) => u.id), ME] : [ME, ...following];
    return buildLeaderboard(posts, userIds, period, (p) => p.likeCount + (likedPosts.includes(p.id) ? 1 : 0));
  }, [posts, likedPosts, following, scope, period]);
}
