import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, StyleSheet } from 'react-native';

import { PlaceRow } from '@/components/place-row';
import { Button, Divider, ScoreBadge, Text } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { placeById } from '@/data/mock';
import { rankedFromPosts } from '@/lib/stats';
import { useAppStore } from '@/store/app-store';
import { ME, type Place } from '@/types';

type Row = { place: Place; score: number };

/** Bir kullanıcının gittiği mekânlar, puana göre sıralı */
export default function BeenScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { scored, posts, getUser } = useAppStore();
  const isMe = id === ME;

  const rows = useMemo<Row[]>(() => {
    const source = isMe
      ? scored.map((e) => ({ placeId: e.placeId, score: e.score }))
      : rankedFromPosts(posts, id).map((p) => ({ placeId: p.placeId, score: p.score! }));
    return source.flatMap((r) => {
      const place = placeById(r.placeId);
      return place ? [{ place, score: r.score }] : [];
    });
  }, [isMe, scored, posts, id]);

  const user = getUser(id);

  return (
    <>
      <Stack.Screen options={{ title: isMe ? 'Gittiklerim' : `${user?.name.split(' ')[0] ?? ''} gittikleri` }} />
      <FlatList
        style={styles.container}
        data={rows}
        keyExtractor={(r) => r.place.id}
        contentInsetAdjustmentBehavior="automatic"
        ItemSeparatorComponent={() => <Divider inset={spacing.lg + 24 + 52 + spacing.md * 2} />}
        ListEmptyComponent={
          <Text variant="subhead" color={colors.textSecondary} align="center" style={styles.empty}>
            Henüz puanlanan bir mekân yok.
          </Text>
        }
        ListFooterComponent={
          isMe ? (
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
            onPress={() => router.push({ pathname: '/mekan/[id]', params: { id: item.place.id } })}
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
