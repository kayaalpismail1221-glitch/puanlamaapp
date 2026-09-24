import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, StyleSheet } from 'react-native';

import { PlaceRow } from '@/components/place-row';
import { Button, Divider, LoadingView, ScoreBadge, Text } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { getPlace, useEntitiesVersion, usePrefetchPlaces, useUser } from '@/data/entities';
import { useUserRankings } from '@/hooks/queries';
import { isMe } from '@/lib/session';
import { useAppStore } from '@/store/app-store';
import type { Place } from '@/types';

type Row = { place: Place; score: number };

/** Bir kullanıcının gittiği mekânlar, puana göre sıralı */
export default function BeenScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { scored } = useAppStore();
  const mine = isMe(id);
  const others = useUserRankings(mine ? undefined : id);
  const version = useEntitiesVersion();

  const source = useMemo(
    () => (mine ? scored.map((e) => ({ placeId: e.placeId, score: e.score })) : (others.data ?? [])),
    [mine, scored, others.data],
  );
  usePrefetchPlaces(source.map((r) => r.placeId));
  const rows = useMemo<Row[]>(
    () =>
      source.flatMap((r) => {
        const place = getPlace(r.placeId);
        return place ? [{ place, score: r.score }] : [];
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source, version],
  );

  const user = useUser(id);

  return (
    <>
      <Stack.Screen
        options={{
          title: mine ? 'Gittiklerim' : `${user?.name.split(' ')[0] ?? ''} gittikleri`,
        }}
      />
      <FlatList
        style={styles.container}
        data={rows}
        keyExtractor={(r) => r.place.id}
        contentInsetAdjustmentBehavior="automatic"
        ItemSeparatorComponent={() => <Divider inset={spacing.lg + 24 + 52 + spacing.md * 2} />}
        ListEmptyComponent={
          !mine && others.isPending ? (
            <LoadingView />
          ) : (
            <Text variant="subhead" color={colors.textSecondary} align="center" style={styles.empty}>
              Henüz puanlanan bir mekân yok.
            </Text>
          )
        }
        ListFooterComponent={
          mine ? (
            <Button
              title="Mekân puanla"
              icon="plus"
              variant="secondary"
              onPress={() => router.push('/mekan-puanla')}
              style={styles.add}
            />
          ) : null
        }
        renderItem={({ item, index }) => (
          <PlaceRow
            place={item.place}
            rank={index + 1}
            onPress={() =>
              router.push({
                pathname: '/mekan/[id]',
                params: { id: item.place.id },
              })
            }
            trailing={<ScoreBadge score={item.score} size="sm" />}
          />
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  empty: {
    padding: spacing.xxl,
  },
  add: {
    margin: spacing.lg,
  },
});
