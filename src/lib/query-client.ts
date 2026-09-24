import { focusManager, QueryClient } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';

import { isNetworkError } from '@/api/errors';

/**
 * Sunucu verisi önbelleği (feed, profil, mekân sayfası…).
 * Uygulama ön plana dönünce eskimiş sorgular yenilenir.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      // Yalnızca ağ hatalarında tekrar dene; yetki ya da veri hatası tekrar etmekle düzelmez
      retry: (count, error) => count < 2 && isNetworkError(error),
    },
    mutations: { retry: false },
  },
});

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'));
}

/** Sorgu anahtarları tek yerde; geçersiz kılma (invalidate) için tutarlı olsun */
export const keys = {
  feedPopular: (area: unknown, coords: unknown) => ['feed', 'popular', area, coords] as const,
  feedFollowing: () => ['feed', 'following'] as const,
  post: (id: string) => ['post', id] as const,
  comments: (postId: string) => ['comments', postId] as const,
  userPosts: (userId: string) => ['posts', 'user', userId] as const,
  placePosts: (placeId: string) => ['posts', 'place', placeId] as const,
  savedPosts: () => ['posts', 'saved'] as const,
  place: (id: string) => ['place', id] as const,
  friendScores: (ids: string[]) => ['friend-scores', ...ids] as const,
  searchPlaces: (query: string, coords: unknown) => ['search', 'places', query, coords] as const,
  searchUsers: (query: string) => ['search', 'users', query] as const,
  areas: () => ['areas'] as const,
  profile: (userId: string) => ['profile', userId] as const,
  userRank: (userId: string) => ['user-rank', userId] as const,
  userRankings: (userId: string) => ['rankings', userId] as const,
  connections: (userId: string, kind: string) => ['connections', userId, kind] as const,
  suggested: () => ['suggested'] as const,
  leaderboard: (scope: string, period: string, schoolId?: string) => ['leaderboard', scope, period, schoolId] as const,
};
