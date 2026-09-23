import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { Divider, SearchField, Text } from '@/components/ui';
import { UserRow } from '@/components/user-row';
import { colors, spacing } from '@/constants/theme';
import { searchUsers } from '@/data/mock';

/** Kullanıcı adıyla arkadaş arama ve takip etme listesi (onboarding ve uygulama içinde ortak) */
export function FriendFinder({ header }: { header?: React.ReactElement }) {
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
      renderItem={({ item }) => <UserRow user={item} />}
    />
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  empty: {
    padding: spacing.xl,
  },
});
