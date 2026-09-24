import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { Divider, ErrorView, LoadingView, SearchField, Text } from '@/components/ui';
import { UserRow } from '@/components/user-row';
import { colors, spacing } from '@/constants/theme';
import { useSearchUsers, useSuggestedUsers } from '@/hooks/queries';

/**
 * Kullanıcı adıyla arkadaş arama ve takip etme listesi (onboarding ve uygulama içinde ortak).
 * Arama boşken takip önerileri gösterilir.
 */
export function FriendFinder({ header }: { header?: React.ReactElement }) {
  const [query, setQuery] = useState('');
  const searching = query.trim().replace(/^@/, '').length > 0;
  const suggested = useSuggestedUsers();
  const results = useSearchUsers(query);
  const active = searching ? results : suggested;

  return (
    <FlatList
      data={active.data ?? []}
      keyExtractor={(u) => u.id}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentInsetAdjustmentBehavior="automatic"
      ListHeaderComponent={
        <View style={styles.header}>
          {header}
          <SearchField value={query} onChangeText={setQuery} placeholder="Ad veya kullanıcı adı ara" />
          {!searching && !!suggested.data?.length && (
            <Text variant="footnote" color={colors.textSecondary} style={styles.bold}>
              TANIYOR OLABİLECEKLERİN
            </Text>
          )}
        </View>
      }
      ItemSeparatorComponent={() => <Divider inset={spacing.lg + 44 + spacing.md} />}
      ListEmptyComponent={
        active.isPending ? (
          <LoadingView />
        ) : active.isError ? (
          <ErrorView onRetry={() => active.refetch()} />
        ) : (
          <Text variant="subhead" color={colors.textSecondary} align="center" style={styles.empty}>
            {searching ? `“${query.trim()}” ile eşleşen kimse yok.` : 'Şimdilik önerecek kimse yok.'}
          </Text>
        )
      }
      renderItem={({ item }) => (
        <UserRow user={item} subtitle={`@${item.username} · ${item.postCount} değerlendirme`} />
      )}
    />
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  bold: {
    fontWeight: '600',
  },
  empty: {
    padding: spacing.xl,
  },
});
