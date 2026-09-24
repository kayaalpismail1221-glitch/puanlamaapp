import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';

import { UserRowsSkeleton } from '@/components/skeleton';
import { Divider, ErrorView, SearchField, Text } from '@/components/ui';
import { UserRow } from '@/components/user-row';
import { colors, spacing } from '@/constants/theme';
import { useSearchUsers, useSuggestedUsers } from '@/hooks/queries';

/**
 * Kullanıcı adıyla arkadaş arama ve takip etme listesi (onboarding ve uygulama içinde ortak).
 * Arama boşken takip önerileri gösterilir.
 */
export function FriendFinder({ header }: { header?: React.ReactElement }) {
  const { t } = useTranslation();
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
          <SearchField value={query} onChangeText={setQuery} placeholder={t('friends.searchPlaceholder')} />
          {!searching && !!suggested.data?.length && (
            <Text variant="footnote" color={colors.textSecondary} style={styles.bold}>
              {t('friends.mayKnow')}
            </Text>
          )}
        </View>
      }
      ItemSeparatorComponent={() => <Divider inset={spacing.lg + 44 + spacing.md} />}
      ListEmptyComponent={
        active.isPending ? (
          <UserRowsSkeleton />
        ) : active.isError ? (
          <ErrorView onRetry={() => active.refetch()} />
        ) : (
          <Text variant="subhead" color={colors.textSecondary} align="center" style={styles.empty}>
            {searching ? t('friends.noMatch', { query: query.trim() }) : t('friends.noSuggestions')}
          </Text>
        )
      }
      renderItem={({ item }) => (
        <UserRow user={item} subtitle={t('friends.reviews', { username: item.username, count: item.postCount })} />
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
