import { router, Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { FeedCard } from '@/components/feed-card';
import { Button, Divider, PressableScale, Text } from '@/components/ui';
import { colors, hitSlop, spacing } from '@/constants/theme';
import { FEED } from '@/data/mock';
import { useAppStore } from '@/store/app-store';

/** Arkadaşların son puanladığı mekânlar */
export default function FeedScreen() {
  const { following } = useAppStore();

  const items = useMemo(
    () =>
      FEED.filter((f) => following.includes(f.userId)).sort(
        (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
      ),
    [following],
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <PressableScale onPress={() => router.push('/ara')} hitSlop={hitSlop} accessibilityLabel="Mekân puanla">
              <SymbolView name="plus" tintColor={colors.primary} size={22} weight="semibold" />
            </PressableScale>
          ),
        }}
      />
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentInsetAdjustmentBehavior="automatic"
        renderItem={({ item }) => <FeedCard item={item} />}
        ItemSeparatorComponent={() => <Divider />}
        contentContainerStyle={items.length === 0 && styles.emptyContainer}
        ListEmptyComponent={
          <View style={styles.empty}>
            <SymbolView name="person.2" tintColor={colors.textTertiary} size={44} />
            <Text variant="title3" align="center">
              Feed’in henüz boş
            </Text>
            <Text variant="subhead" color={colors.textSecondary} align="center">
              Arkadaşlarını takip et, puanladıkları mekânlar burada görünsün.
            </Text>
            <Button title="Arkadaş bul" onPress={() => router.push('/arkadas-bul')} style={styles.emptyButton} />
          </View>
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  emptyContainer: {
    flexGrow: 1,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xxl,
  },
  emptyButton: {
    marginTop: spacing.sm,
    alignSelf: 'stretch',
  },
});
