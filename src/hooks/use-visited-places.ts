import { useMemo } from 'react';

import { getPlace, useEntitiesVersion, usePrefetchPlaces } from '@/data/entities';
import { useUserPosts, useUserRankings } from '@/hooks/queries';
import { isMe } from '@/lib/session';
import { mergeVisited, type VisitedPlace } from '@/lib/visited';
import { useAppStore } from '@/store/app-store';

/**
 * Kullanıcının gittiği yerler (puanladığı + gönderi paylaştığı mekânlar) ve oradaki gönderileri.
 * Kendi profilinde cihazdaki güncel sıralama, başkasınınkinde sunucudaki sıralaması kullanılır.
 */
export function useVisitedPlaces(userId: string) {
  const mine = isMe(userId);
  const { scored } = useAppStore();
  const others = useUserRankings(mine ? undefined : userId);
  const posts = useUserPosts(userId);
  const version = useEntitiesVersion();

  const ranked = useMemo(
    () => (mine ? scored.map((e) => ({ placeId: e.placeId, score: e.score })) : (others.data ?? [])),
    [mine, scored, others.data],
  );
  usePrefetchPlaces(ranked.map((r) => r.placeId));

  const items = useMemo<VisitedPlace[]>(
    () =>
      mergeVisited(
        ranked.flatMap((r) => {
          const place = getPlace(r.placeId);
          return place ? [{ place, score: r.score }] : [];
        }),
        posts.data ?? [],
        getPlace,
      ),
    // Önbelleğe yeni mekân gelince yeniden hesapla
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ranked, posts.data, version],
  );

  return { items, loading: (!mine && others.isPending) || posts.isPending };
}
