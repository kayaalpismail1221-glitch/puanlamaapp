import { router, Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { PlaceRow } from '@/components/place-row';
import { PostGrid } from '@/components/post-grid';
import { SegmentTabs } from '@/components/segment-tabs';
import { Avatar, Button, Divider, PressableScale, ScoreBadge, Text } from '@/components/ui';
import { colors, hitSlop, radius, spacing } from '@/constants/theme';
import { placeById } from '@/data/mock';
import { useAppStore } from '@/store/app-store';
import { ME, type Place } from '@/types';

type Tab = 'ranked' | 'posts';

const TABS = [
  { key: 'ranked', label: 'Sıralamam' },
  { key: 'posts', label: 'Gönderilerim' },
] as const;

type Row = { place: Place; score: number; rank: number };

export default function ProfileScreen() {
  const { profile, scored, posts, following, dispatch } = useAppStore();
  const [tab, setTab] = useState<Tab>('ranked');

  const ranked = useMemo<Row[]>(
    () =>
      scored.flatMap((e) => {
        const place = placeById(e.placeId);
        return place ? [{ place, score: e.score, rank: e.rank }] : [];
      }),
    [scored],
  );

  const myPosts = useMemo(() => posts.filter((p) => p.userId === ME), [posts]);

  // En sevilen mutfak: puanı 6.7 ve üstü mekânlarda en sık görülen mutfak
  const favoriteCuisine = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of ranked) {
      if (row.score < 6.7) continue;
      counts.set(row.place.cuisine, (counts.get(row.place.cuisine) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  }, [ranked]);

  const confirmReset = () =>
    Alert.alert('Çıkış yap', 'Tüm yerel veriler silinir ve karşılama ekranına dönersin.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Çıkış yap', style: 'destructive', onPress: () => dispatch({ type: 'reset' }) },
    ]);

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <PressableScale onPress={confirmReset} hitSlop={hitSlop} accessibilityLabel="Ayarlar">
              <SymbolView name="gearshape" tintColor={colors.primary} size={22} />
            </PressableScale>
          ),
        }}
      />
      <ScrollView style={styles.container} contentInsetAdjustmentBehavior="automatic">
        <View style={styles.identity}>
          <Avatar uri={profile?.avatarUri} name={profile?.name ?? '?'} size={88} />
          <Text variant="title2" color={colors.primary}>
            {profile?.name}
          </Text>
          <Text variant="subhead" color={colors.textSecondary}>
            @{profile?.username}
          </Text>
        </View>

        <View style={styles.stats}>
          <Stat value={ranked.length} label="Gidilen" />
          <Stat value={myPosts.length} label="Gönderi" />
          <Stat value={following.length} label="Takip" />
        </View>

        {favoriteCuisine && (
          <View style={styles.favorite}>
            <SymbolView name="fork.knife" tintColor={colors.primary} size={16} />
            <Text variant="subhead">
              En sevdiğin mutfak: <Text variant="subhead" style={styles.bold}>{favoriteCuisine}</Text>
            </Text>
          </View>
        )}

        <View style={styles.tabs}>
          <SegmentTabs tabs={TABS} value={tab} onChange={setTab} />
        </View>

        {tab === 'ranked' ? (
          <>
            {ranked.length === 0 ? (
              <Text variant="subhead" color={colors.textSecondary} align="center" style={styles.empty}>
                Henüz puanladığın bir mekân yok.
              </Text>
            ) : (
              ranked.map((item, i) => (
                <View key={item.place.id}>
                  {i > 0 && <Divider inset={spacing.lg + 52 + spacing.md} />}
                  <PlaceRow
                    place={item.place}
                    rank={item.rank}
                    onPress={() => router.push({ pathname: '/mekan/[id]', params: { id: item.place.id } })}
                    trailing={<ScoreBadge score={item.score} size="sm" />}
                  />
                </View>
              ))
            )}
            <Button
              title="Mekân puanla"
              icon="plus"
              variant="secondary"
              onPress={() => router.push('/mekan-puanla')}
              style={styles.addButton}
            />
          </>
        ) : (
          <>
            <View style={{ paddingTop: 2 }}>
              <PostGrid posts={myPosts} emptyText="Henüz gönderi paylaşmadın." />
            </View>
            <Button
              title="Gönderi paylaş"
              icon="camera"
              variant="secondary"
              onPress={() => router.push('/gonderi-olustur')}
              style={styles.addButton}
            />
          </>
        )}
      </ScrollView>
    </>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text variant="title3" color={colors.primary} style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
      <Text variant="caption" color={colors.textSecondary}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  identity: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.lg,
  },
  stats: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  favorite: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  bold: {
    fontWeight: '600',
  },
  tabs: {
    marginTop: spacing.xl,
  },
  empty: {
    padding: spacing.xxl,
  },
  addButton: {
    margin: spacing.lg,
  },
});
