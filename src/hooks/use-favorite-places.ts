import { useMemo } from 'react';

import { getPlace, useEntitiesVersion } from '@/data/entities';
import { useUserFavorites, useUserRankings } from '@/hooks/queries';
import { resolveFavorites } from '@/lib/favorites';
import type { ScoredPlace } from '@/lib/insights';
import { isMe } from '@/lib/session';
import { useAppSelector, useScored } from '@/store/app-store';

const NONE: string[] = [];

/**
 * Kişinin Favori 4'ü, puanlarıyla. Kendi profilinde uygulama deposundan (anında güncellenir),
 * başkasında profilindeki seçimden ve sıralamasından okunur.
 */
export function useFavoritePlaces(userId: string): { items: ScoredPlace[]; loading: boolean } {
  const mine = isMe(userId);
  const myIds = useAppSelector((s) => s.profile?.favoritePlaces ?? NONE);
  const myScores = useScored();
  const theirIds = useUserFavorites(mine ? undefined : userId);
  const theirScores = useUserRankings(mine ? undefined : userId);
  const version = useEntitiesVersion();

  const ids = mine ? myIds : (theirIds.data ?? NONE);
  const scores = mine ? myScores : theirScores.data;
  const items = useMemo(
    () => (scores ? resolveFavorites(ids, scores, getPlace) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ids, scores, version],
  );
  return { items, loading: !mine && (theirIds.isPending || theirScores.isPending) };
}
