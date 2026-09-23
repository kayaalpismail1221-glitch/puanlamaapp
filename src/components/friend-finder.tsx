import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { Avatar, Divider, PressableScale, SearchField, Text } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { searchUsers } from '@/data/mock';
import { useAppStore } from '@/store/app-store';

/** Kullanıcı adıyla arkadaş arama ve takip etme listesi (onboarding ve uygulama içinde ortak) */
export function FriendFinder({ header }: { header?: React.ReactElement }) {
  const { following, dispatch } = useAppStore();
  const [query, setQuery] = useState('');
  const users = searchUsers(query);

  return (
    <FlatList
      data={users}
      keyExtractor={(u) => u.id}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentInsetAdjustmentBehavior="automatic"
      ListHeaderComponent={
        <View style={styles.header}>
          {header}
          <SearchField value={query} onChangeText={setQuery} placeholder="Ad veya kullanıcı adı ara" />
        </View>
      }
      ItemSeparatorComponent={() => <Divider inset={spacing.lg + 44 + spacing.md} />}
      ListEmptyComponent={
        <Text variant="subhead" color={colors.textSecondary} align="center" style={styles.empty}>
          “{query}” ile eşleşen kimse yok.
        </Text>
      }
      renderItem={({ item }) => {
        const isFollowing = following.includes(item.id);
        return (
          <View style={styles.row}>
            <Avatar uri={item.avatarUrl} name={item.name} size={44} />
            <View style={styles.info}>
              <Text variant="headline">{item.name}</Text>
              <Text variant="footnote" color={colors.textSecondary}>
                @{item.username}
              </Text>
            </View>
            <PressableScale
              onPress={() => dispatch({ type: 'toggleFollow', userId: item.id })}
              style={[styles.follow, isFollowing && styles.following]}
              accessibilityRole="button">
              <Text variant="subhead" color={isFollowing ? colors.primary : colors.onPrimary} style={styles.followText}>
                {isFollowing ? 'Takiptesin' : 'Takip et'}
              </Text>
            </PressableScale>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  follow: {
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    paddingHorizontal: spacing.lg,
    height: 36,
    justifyContent: 'center',
  },
  following: {
    backgroundColor: colors.surface,
  },
  followText: {
    fontWeight: '600',
  },
  empty: {
    padding: spacing.xl,
  },
});
