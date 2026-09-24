import { useMemo } from 'react';

import { getPlace, useEntitiesVersion, usePrefetchPlaces } from '@/data/entities';
import { useUserRankings } from '@/hooks/queries';
import type { FootprintItem } from '@/lib/footprint';
import { isMe } from '@/lib/session';
import { useAppStore } from '@/store/app-store';

/**
 * Kullanıcının puanladığı mekânlar ve puanları (ayak izi haritası için), yüksekten düşüğe.
 * Kendi profilinde cihazdaki güncel sıralama, başkasınınkinde sunucudaki sıralaması kullanılır.
 */
export function useFootprint(userId: string) {
  const mine = isMe(userId);
  const { scored } = useAppStore();
  const others = useUserRankings(mine ? undefined : userId);
  const version = useEntitiesVersion();

  const source = useMemo(
    () => (mine ? scored.map((e) => ({ placeId: e.placeId, score: e.score })) : (others.data ?? [])),
    [mine, scored, others.data],
  );
  usePrefetchPlaces(source.map((s) => s.placeId));

  const items = useMemo<FootprintItem[]>(
    () =>
      source
        .flatMap((s) => {
          const place = getPlace(s.placeId);
          return place ? [{ place, score: s.score }] : [];
        })
        .sort((a, b) => b.score - a.score),
    // Önbelleğe yeni mekân gelince yeniden hesapla
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source, version],
  );

  return { items, loading: !mine && others.isPending };
}
