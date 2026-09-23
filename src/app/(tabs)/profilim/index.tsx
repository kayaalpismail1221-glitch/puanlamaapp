import { router, Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';

import { PlaceRow } from '@/components/place-row';
import { Avatar, Button, Divider, PressableScale, ScoreBadge, Text } from '@/components/ui';
import { colors, hitSlop, radius, spacing } from '@/constants/theme';
import { placeById } from '@/data/mock';
import { haptics } from '@/lib/haptics';
import { useAppStore } from '@/store/app-store';
import type { Place } from '@/types';

type Tab = 'ranked' | 'want';

type Row = { place: Place; score?: number; rank?: number };

export default function ProfileScreen() {
  const { profile, scored, wantToGo, following, dispatch } = useAppStore();
  const [tab, setTab] = useState<Tab>('ranked');

  const ranked = useMemo<Row[]>(
    () =>
      scored.flatMap((e) => {
        const place = placeById(e.placeId);
        return place ? [{ place, score: e.score, rank: e.rank }] : [];
      }),
    [scored],
  );

  const want = useMemo<Row[]>(
    () => wantToGo.flatMap((id) => (placeById(id) ? [{ place: placeById(id)! }] : [])),
    [wantToGo],
  );

  // En sevilen mutfak: puanı 6.7 ve üstü mekânlarda en sık görülen mutfak
  const favoriteCuisine = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of ranked) {
      if ((row.score ?? 0) < 6.7) continue;
      counts.set(row.place.cuisine, (counts.get(row.place.cuisine) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  }, [ranked]);

  const confirmReset = () =>
    Alert.alert('Çıkış yap', 'Tüm yerel veriler silinir ve karşılama ekranına dönersin.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Çıkış yap', style: 'destructive', onPress: () => dispatch({ type: 'reset' }) },
    ]);

  const data = tab === 'ranked' ? ranked : want;

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
      <FlatList
        data={data}
        keyExtractor={(r) => r.place.id}
        contentInsetAdjustmentBehavior="automatic"
        ItemSeparatorComponent={() => <Divider inset={spacing.lg + 52 + spacing.md} />}
        ListHeaderComponent={
          <View>
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
              <Stat value={String(ranked.length)} label="Gidilen" />
              <Stat value={String(want.length)} label="Gitmek istiyorum" />
              <Stat value={String(following.length)} label="Takip" />
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
              {(
                [
                  ['ranked', 'Sıralamam'],
                  ['want', 'Gitmek istiyorum'],
                ] as const
              ).map(([key, label]) => {
                const active = tab === key;
                return (
                  <PressableScale
                    key={key}
                    haptic={false}
                    onPress={() => {
                      haptics.select();
                      setTab(key);
                    }}
                    style={[styles.tab, active && styles.tabActive]}>
                    <Text variant="subhead" color={active ? colors.primary : colors.textSecondary} style={styles.bold}>
                      {label}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text variant="subhead" color={colors.textSecondary} align="center">
              {tab === 'ranked'
                ? 'Henüz puanladığın bir mekân yok.'
                : 'Beğendiğin mekânları kaydet, sonra gitmek için burada bulursun.'}
            </Text>
          </View>
        }
        ListFooterComponent={
          tab === 'ranked' ? (
            <Button
              title="Mekân puanla"
              icon="plus"
              variant="secondary"
              onPress={() => router.push('/ara')}
              style={styles.addButton}
            />
          ) : null
        }
        renderItem={({ item }) => (
          <PlaceRow
            place={item.place}
            rank={item.rank}
            onPress={() => router.push({ pathname: '/mekan/[id]', params: { id: item.place.id } })}
            trailing={
              item.score !== undefined ? (
                <ScoreBadge score={item.score} size="sm" />
              ) : (
                <SymbolView name="chevron.right" tintColor={colors.textTertiary} size={14} />
              )
            }
          />
        )}
      />
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
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
    flexDirection: 'row',
    marginTop: spacing.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.primary,
  },
  empty: {
    padding: spacing.xxl,
  },
  addButton: {
    margin: spacing.lg,
  },
});
