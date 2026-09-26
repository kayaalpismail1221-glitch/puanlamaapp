import { useInfiniteQuery, useMutation, useQuery, type InfiniteData, type QueryKey } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import * as api from '@/api/content';
import { showError } from '@/api/errors';
import * as listsApi from '@/api/lists';
import * as notificationsApi from '@/api/notifications';
import { adjustCommentCount, removePost, upsertPosts } from '@/data/entities';
import { roundCoords, type Coords } from '@/lib/geo';
import { useUserLocation } from '@/lib/location';
import type { LeaderboardPeriod, LeaderboardScope } from '@/lib/leaderboard';
import { keys, queryClient } from '@/lib/query-client';
import i18n from '@/i18n';
import { useAppActions, useAppSelector } from '@/store/app-store';
import type { Comment, FeedArea, PersonSuggestion, Post, UserProfile } from '@/types';

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

/**
 * Aşağı çekip yenileme: yüklenmiş tüm sayfaları tek tek yeniden çekmek yerine yalnızca ilk sayfa
 * (popüler feed'de yeni bir sıralama anıyla) çekilir; liste başa döner. Eski veri, yenisi gelene kadar ekranda kalır.
 */
async function restartFeed(queryKey: QueryKey, refetch: () => Promise<unknown>) {
  queryClient.setQueryData<InfiniteData<unknown, unknown>>(queryKey, (data) =>
    data && { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) },
  );
  await refetch();
}

export function usePopularFeed(area: FeedArea, coords: Coords | null, enabled: boolean) {
  // Konum küçük oynamalarda feed'i baştan yüklemesin (~1 km hassasiyet)
  const rounded = roundCoords(coords);
  const queryKey = keys.feedPopular(area, rounded);
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => api.fetchPopularFeed(area, rounded, pageParam),
    initialPageParam: { offset: 0 } as api.PopularCursor,
    getNextPageParam: (last) => last.next,
    enabled: enabled && (area.type === 'area' || !!rounded),
  });
  return { ...query, restart: () => restartFeed(queryKey, query.refetch) };
}

export function useFollowingFeed(enabled = true) {
  const query = useInfiniteQuery({
    queryKey: keys.feedFollowing(),
    queryFn: ({ pageParam }) => api.fetchFollowingFeed(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.length >= 20 ? last.at(-1)!.createdAt : undefined),
    enabled,
  });
  return { ...query, restart: () => restartFeed(keys.feedFollowing(), query.refetch) };
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
  const userId = useAppSelector((s) => s.userId);
  const actions = useAppActions();
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
  // Her feed kartında çağrılır: yalnızca kimliği dinler, beğeniler kartları yeniden çizdirmesin
  const userId = useAppSelector((s) => s.userId);
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
    mutationFn: ({ text, parentId }: { text: string; parentId?: string }) => api.addComment(postId, text, parentId),
    onSuccess: (comment) => {
      queryClient.setQueryData(keys.comments(postId), (old: Comment[] | undefined) => [...(old ?? []), comment]);
      adjustCommentCount(postId, 1);
      queryClient.invalidateQueries({ queryKey: ['feed', 'popular'] });
    },
  });
}

/** Silinen yorumun yanıtları da (sunucuda cascade) listeden ve sayaçtan düşer */
export function useDeleteComment(postId: string) {
  return useMutation({
    mutationFn: (commentId: string) => api.deleteComment(commentId),
    onSuccess: (_, commentId) => {
      const old = queryClient.getQueryData<Comment[]>(keys.comments(postId)) ?? [];
      const removed = new Set([commentId]);
      for (let grew = true; grew; ) {
        grew = false;
        for (const c of old) {
          if (c.parentId && removed.has(c.parentId) && !removed.has(c.id)) {
            removed.add(c.id);
            grew = true;
          }
        }
      }
      queryClient.setQueryData(
        keys.comments(postId),
        old.filter((c) => !removed.has(c.id)),
      );
      adjustCommentCount(postId, -removed.size);
    },
  });
}

/**
 * Yorum beğenme: kalp ve sayı hemen değişir, sunucuya arkadan yazılır; hata olursa geri alınır.
 * Hızlı çift dokunuşta son istenen durum kazanır (her dokunuş kendi hedefini yazar).
 */
export function useToggleCommentLike(postId: string) {
  const update = (commentId: string, liked: boolean) =>
    queryClient.setQueryData(keys.comments(postId), (old: Comment[] | undefined) =>
      old?.map((c) =>
        c.id === commentId && c.likedByMe !== liked
          ? { ...c, likedByMe: liked, likeCount: Math.max(0, c.likeCount + (liked ? 1 : -1)) }
          : c,
      ),
    );
  return (comment: Comment) => {
    const liked = !comment.likedByMe;
    update(comment.id, liked);
    api.setCommentLiked(comment.id, liked).catch((error) => {
      update(comment.id, !liked);
      showError(error, i18n.t('failures.commentLike'));
    });
  };
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
  const rounded = roundCoords(location.coords);
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
  const rounded = roundCoords(coords);
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

/** Oturumdaki kullanıcıyla damak uyumu (kendi profilinde çalışmaz) */
export function useTasteMatch(userId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: keys.tasteMatch(userId ?? ''),
    queryFn: () => api.fetchTasteMatch(userId!),
    enabled: !!userId && enabled,
  });
}

/* ---------- Listeler ---------- */

export function useUserLists(userId: string | undefined) {
  return useQuery({
    queryKey: keys.userLists(userId ?? ''),
    queryFn: () => listsApi.fetchUserLists(userId!),
    enabled: !!userId,
  });
}

export function useSavedLists() {
  return useQuery({ queryKey: keys.savedLists(), queryFn: listsApi.fetchSavedLists });
}

export function useListDetails(listId: string | undefined) {
  return useQuery({
    queryKey: keys.list(listId ?? ''),
    queryFn: () => listsApi.fetchListDetails(listId!),
    enabled: !!listId,
  });
}

export function useSaveList() {
  return useMutation({
    mutationFn: listsApi.saveList,
    onSuccess: (id) => queryClient.invalidateQueries({ queryKey: ['lists'] }).then(() => id),
  });
}

export function useDeleteList() {
  return useMutation({
    mutationFn: listsApi.deleteList,
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: keys.list(id) });
      queryClient.invalidateQueries({ queryKey: ['lists'] });
    },
  });
}

/** Listeyi kaydet / kayıttan çıkar: sayaç ve düğme hemen değişir, hata olursa geri alınır */
export function useToggleListSaved() {
  return useMutation({
    mutationFn: ({ listId, saved }: { listId: string; saved: boolean }) => listsApi.setListSaved(listId, saved),
    onMutate: ({ listId, saved }) => {
      const key = keys.list(listId);
      const previous = queryClient.getQueryData<listsApi.ListDetails | null>(key);
      if (previous) {
        const delta = saved === previous.list.savedByMe ? 0 : saved ? 1 : -1;
        queryClient.setQueryData<listsApi.ListDetails>(key, {
          ...previous,
          list: { ...previous.list, savedByMe: saved, saveCount: Math.max(0, previous.list.saveCount + delta) },
        });
      }
      return { previous };
    },
    onError: (error, { listId }, context) => {
      if (context?.previous) queryClient.setQueryData(keys.list(listId), context.previous);
      showError(error, i18n.t(context?.previous?.list.savedByMe ? 'failures.listUnsave' : 'failures.listSave'));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.savedLists() }),
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

/**
 * Tanıyor olabileceğin kişiler (bildirim merkezi). Takip edilen kişi listede "Takip ediliyor" olarak
 * kalsın diye kendiliğinden yenilenmez; aşağı çekince yenilenir.
 */
export function usePeopleYouMayKnow(limit = 10) {
  return useQuery({
    queryKey: keys.peopleYouMayKnow(),
    queryFn: () => api.fetchPeopleYouMayKnow(limit),
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });
}

/** ✕: öneri tüm listelerden hemen kalkar, sunucuya arkadan yazılır */
export function useDismissSuggestion() {
  return (userId: string) => {
    const pymk = queryClient.getQueryData<PersonSuggestion[]>(keys.peopleYouMayKnow());
    const suggested = queryClient.getQueryData<UserProfile[]>(keys.suggested());
    queryClient.setQueryData(keys.peopleYouMayKnow(), pymk?.filter((s) => s.user.id !== userId));
    queryClient.setQueryData(keys.suggested(), suggested?.filter((u) => u.id !== userId));
    api.dismissSuggestion(userId).catch((error) => {
      queryClient.setQueryData(keys.peopleYouMayKnow(), pymk);
      queryClient.setQueryData(keys.suggested(), suggested);
      showError(error);
    });
  };
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

/* ---------- Bildirimler ---------- */

export function useNotifications() {
  return useInfiniteQuery({
    queryKey: keys.notifications(),
    queryFn: ({ pageParam }) => notificationsApi.fetchNotifications(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.length >= notificationsApi.NOTIFICATION_PAGE ? last.at(-1)!.createdAt : undefined,
  });
}

/** Okunmamış sayısı; uygulama ön plana dönünce ve push gelince yenilenir */
export function useUnreadNotifications(enabled = true) {
  return useQuery({
    queryKey: keys.unreadNotifications(),
    queryFn: notificationsApi.fetchUnreadCount,
    enabled,
  });
}

export function useMutedNotifications() {
  const userId = useAppSelector((s) => s.userId);
  return useQuery({
    queryKey: keys.mutedNotifications(),
    queryFn: () => notificationsApi.fetchMutedKinds(userId!),
    enabled: !!userId,
  });
}
