import { router, Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { PostCard } from '@/components/post-card';
import { Avatar, Button, Divider, PressableScale, Text } from '@/components/ui';
import { colors, hitSlop, radius, spacing } from '@/constants/theme';
import { useAppStore } from '@/store/app-store';
import { ME } from '@/types';

const openComposer = () => router.push('/gonderi-olustur');

/** Takip edilenlerin ve kullanıcının kendi gönderileri, en yeni başta */
export default function FeedScreen() {
  const { following, posts, profile } = useAppStore();

  const items = useMemo(
    () => posts.filter((p) => p.userId === ME || following.includes(p.userId)),
    [posts, following],
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <PressableScale onPress={openComposer} hitSlop={hitSlop} accessibilityLabel="Gönderi paylaş">
              <SymbolView name="plus" tintColor={colors.primary} size={22} weight="semibold" />
            </PressableScale>
          ),
        }}
      />
      <FlatList
        data={items}
        keyExtractor={(p) => p.id}
        contentInsetAdjustmentBehavior="automatic"
        renderItem={({ item }) => <PostCard post={item} />}
        ItemSeparatorComponent={() => <Divider />}
        contentContainerStyle={items.length === 0 && styles.emptyContainer}
        ListHeaderComponent={
          <>
            <PressableScale onPress={openComposer} scaleTo={0.98} style={styles.composer}>
              <Avatar uri={profile?.avatarUri} name={profile?.name ?? '?'} size={36} />
              <Text variant="callout" color={colors.textSecondary} style={{ flex: 1 }}>
                Nerede yedin? Paylaş…
              </Text>
              <SymbolView name="camera" tintColor={colors.primary} size={20} />
            </PressableScale>
            <Divider />
          </>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <SymbolView name="person.2" tintColor={colors.textTertiary} size={44} />
            <Text variant="title3" align="center">
              Feed’in henüz boş
            </Text>
            <Text variant="subhead" color={colors.textSecondary} align="center">
              Arkadaşlarını takip et, gittikleri mekânlardan paylaşımları burada görünsün.
            </Text>
            <Button title="Arkadaş bul" onPress={() => router.push('/arkadas-bul')} style={styles.emptyButton} />
          </View>
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    height: 52,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
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
