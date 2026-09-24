import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import * as api from '@/api/content';
import { adjustCommentCount, removePost, upsertPosts } from '@/data/entities';
import type { Coords } from '@/lib/geo';
import { useUserLocation } from '@/lib/location';
import type { LeaderboardPeriod, LeaderboardScope } from '@/lib/leaderboard';
import { keys, queryClient } from '@/lib/query-client';
import { useAppStore } from '@/store/app-store';
import type { Comment, FeedArea, Post } from '@/types';

/**
 * Sunucu verisi kancaları. Hepsi TanStack Query üzerinden önbelleklenir,
 * uygulama ön plana dönünce ya da ilgili veri değişince yenilenir.
 */

/** Yazarken her tuşta istek atmamak için */
export function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/* ---------- Feed ---------- */

export function usePopularFeed(area: FeedArea, coords: Coords | null, enabled: boolean) {
  // Konum küçük oynamalarda feed'i baştan yüklemesin (~1 km hassasiyet)
  const rounded = coords && { latitude: +coords.latitude.toFixed(2), longitude: +coords.longitude.toFixed(2) };
  return useInfiniteQuery({
    queryKey: keys.feedPopular(area, rounded),
    queryFn: ({ pageParam }) => api.fetchPopularFeed(area, rounded, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset,
    enabled: enabled && (area.type === 'area' || !!rounded),
  });
}

export function useFollowingFeed(enabled = true) {
  return useInfiniteQuery({
    queryKey: keys.feedFollowing(),
    queryFn: ({ pageParam }) => api.fetchFollowingFeed(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.length >= 20 ? last.at(-1)!.createdAt : undefined),
    enabled,
  });
}

/* ---------- Gönderiler ---------- */

export function useUserPosts(userId: string | undefined) {
  return useQuery({
    queryKey: keys.userPosts(userId ?? ''),
    queryFn: () => api.fetchUserPosts(userId!),
    enabled: !!userId,
  });
}

export function usePlacePosts(placeId: string | undefined) {
  return useQuery({
    queryKey: keys.placePosts(placeId ?? ''),
    queryFn: () => api.fetchPlacePosts(placeId!),
    enabled: !!placeId,
  });
}

export function useSavedPosts() {
  return useQuery({ queryKey: keys.savedPosts(), queryFn: () => api.fetchSavedPosts() });
}

export function useComments(postId: string | undefined) {
  return useQuery({
    queryKey: keys.comments(postId ?? ''),
    queryFn: () => api.fetchComments(postId!),
    enabled: !!postId,
  });
}

/** Gönderi değişince ilgili listeler yenilensin */
function invalidatePostLists(post: Pick<Post, 'userId' | 'placeId'>) {
  for (const queryKey of [
    ['feed'],
    keys.userPosts(post.userId),
    keys.placePosts(post.placeId),
    keys.place(post.placeId),
    keys.profile(post.userId),
    keys.userRank(post.userId),
    ['leaderboard'],
  ]) {
    queryClient.invalidateQueries({ queryKey });
  }
}

export function useCreatePost() {
  const { userId, actions } = useAppStore();
  const [progress, setProgress] = useState(0);
  const mutation = useMutation({
    mutationFn: async (input: api.NewPost) => {
      setProgress(0);
      // Gönderinin puanı sunucudaki sıralamadan gelir; az önce puanlandıysa yazılmasını bekle
      await actions.waitForRank(input.placeId);
      return api.createPost(userId!, input, setProgress);
    },
    onSuccess: invalidatePostLists,
  });
  return { ...mutation, progress };
}

export function useDeletePost() {
  const { userId } = useAppStore();
  return useMutation({
    mutationFn: (post: Post) => api.deletePost(userId!, post),
    onSuccess: (_, post) => {
      removePost(post.id);
      invalidatePostLists(post);
      queryClient.invalidateQueries({ queryKey: keys.savedPosts() });
    },
  });
}

/** Gönderinin açıklama, öğün ve öne çıkanlarını düzenler; önbellekteki gönderi anında güncellenir */
export function useUpdatePost() {
  return useMutation({
    mutationFn: ({ post, patch }: { post: Post; patch: api.PostPatch }) => api.updatePost(post, patch),
    onSuccess: (updated) => {
      upsertPosts([updated]);
      invalidatePostLists(updated);
    },
  });
}

export function useAddComment(postId: string) {
  return useMutation({
    mutationFn: (text: string) => api.addComment(postId, text),
    onSuccess: (comment) => {
      queryClient.setQueryData(keys.comments(postId), (old: Comment[] | undefined) => [...(old ?? []), comment]);
      adjustCommentCount(postId, 1);
      queryClient.invalidateQueries({ queryKey: ['feed', 'popular'] });
    },
  });
}

export function useDeleteComment(postId: string) {
  return useMutation({
    mutationFn: (commentId: string) => api.deleteComment(commentId),
    onSuccess: (_, commentId) => {
      queryClient.setQueryData(keys.comments(postId), (old: { id: string }[] | undefined) =>
        old?.filter((c) => c.id !== commentId),
      );
      adjustCommentCount(postId, -1);
    },
  });
}

/* ---------- Mekânlar ---------- */

export function usePlaceDetails(placeId: string | undefined) {
  return useQuery({
    queryKey: keys.place(placeId ?? ''),
    queryFn: () => api.fetchPlaceDetails(placeId!),
    enabled: !!placeId,
  });
}

/** Sana özel öneriler (konum varsa yakındakiler öne çıkar; ~1 km hassasiyet) */
export function useRecommendations(enabled: boolean) {
  const location = useUserLocation(enabled);
  const rounded = location.coords && {
    latitude: +location.coords.latitude.toFixed(2),
    longitude: +location.coords.longitude.toFixed(2),
  };
  // Konum izni bekleniyorsa kısa süre bekle; izin yoksa konumsuz öner
  const settled = !!location.coords || ['denied', 'undetermined', 'error'].includes(location.status);
  return useQuery({
    queryKey: keys.recommendations(rounded),
    queryFn: () => api.fetchRecommendations(rounded),
    enabled: enabled && settled,
  });
}

/** Harita "Puanla" katmanı; küçük kaydırmalarda yeniden istek atmasın diye sınırlar yuvarlanır */
export function useMapPlaces(bounds: api.MapBounds | null) {
  const rounded = bounds && {
    south: Math.floor(bounds.south * 100) / 100,
    west: Math.floor(bounds.west * 100) / 100,
    north: Math.ceil(bounds.north * 100) / 100,
    east: Math.ceil(bounds.east * 100) / 100,
  };
  return useQuery({
    queryKey: keys.mapPlaces(rounded),
    queryFn: () => api.fetchMapPlaces(rounded!),
    enabled: !!rounded,
    placeholderData: (previous) => previous,
  });
}

/** Takip edilenlerin mekânlara verdiği ortalama puan (Listem kartları için) */
export function useFriendScores(placeIds: string[]) {
  const sorted = [...placeIds].sort();
  return useQuery({
    queryKey: keys.friendScores(sorted),
    queryFn: () => api.fetchFriendScores(sorted),
    enabled: sorted.length > 0,
    placeholderData: (previous) => previous,
  });
}

export function useSearchPlaces(query: string, coords: Coords | null) {
  const q = useDebounced(query.trim());
  const rounded = coords && { latitude: +coords.latitude.toFixed(2), longitude: +coords.longitude.toFixed(2) };
  return useQuery({
    queryKey: keys.searchPlaces(q, rounded),
    queryFn: () => api.searchPlaces(q, rounded),
    placeholderData: (previous) => previous,
    staleTime: 60_000,
  });
}

/** Mekân arama; konum izni verilmişse sonuçlar yakınlığa göre de sıralanır (izin istenmez) */
export function useNearbyPlaceSearch(query: string) {
  const { coords } = useUserLocation(true, false);
  return useSearchPlaces(query, coords);
}

export function useAreas() {
  return useQuery({ queryKey: keys.areas(), queryFn: api.fetchAreas, staleTime: 60 * 60_000 });
}

/* ---------- Kişiler ---------- */

export function useUserProfile(userId: string | undefined) {
  return useQuery({
    queryKey: keys.profile(userId ?? ''),
    queryFn: () => api.fetchUserProfile(userId!),
    enabled: !!userId,
  });
}

export function useUserRank(userId: string | undefined) {
  return useQuery({
    queryKey: keys.userRank(userId ?? ''),
    queryFn: () => api.fetchUserRank(userId!),
    enabled: !!userId,
  });
}

export function useUserRankings(userId: string | undefined) {
  return useQuery({
    queryKey: keys.userRankings(userId ?? ''),
    queryFn: () => api.fetchUserRankings(userId!),
    enabled: !!userId,
  });
}

export function useConnections(userId: string, kind: 'followers' | 'following') {
  return useQuery({ queryKey: keys.connections(userId, kind), queryFn: () => api.fetchConnections(userId, kind) });
}

/** Takip önerileri; takip edilen kişi listeden hemen kaybolmasın diye kendiliğinden yenilenmez */
export function useSuggestedUsers(limit = 30) {
  return useQuery({
    queryKey: keys.suggested(),
    queryFn: () => api.fetchSuggestedUsers(limit),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useSearchUsers(query: string) {
  const q = useDebounced(query.trim());
  return useQuery({
    queryKey: keys.searchUsers(q),
    queryFn: () => api.searchUsers(q),
    enabled: q.replace(/^@/, '').length > 0,
    placeholderData: (previous) => previous,
  });
}

export function useLeaderboard(scope: LeaderboardScope, period: LeaderboardPeriod, schoolId?: string) {
  return useQuery({
    queryKey: keys.leaderboard(scope, period, schoolId),
    queryFn: () => api.fetchLeaderboard(scope, period, schoolId),
    enabled: scope !== 'school' || !!schoolId,
  });
}
