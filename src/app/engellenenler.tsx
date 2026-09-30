import { useMutation, useQuery } from '@tanstack/react-query';
import { SymbolView } from '@/components/symbol';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';

import { fetchBlockedUsers, unblock, type BlockedUser } from '@/api/content';
import { showError } from '@/api/errors';
import { BottomInsetSpacer } from '@/components/bottom-inset';
import { SkeletonScreen, UserRowsSkeleton } from '@/components/skeleton';
import { Avatar, Button, Divider, ErrorView, Text } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { showAlert } from '@/lib/dialog';
import { haptics } from '@/lib/haptics';
import { queryClient } from '@/lib/query-client';
import { useAppStore } from '@/store/app-store';

const KEY = ['blocked-users'] as const;

/** Engellediğin kişiler ve engel kaldırma */
export default function BlockedUsersScreen() {
  const { t } = useTranslation();
  const { actions } = useAppStore();
  const blocked = useQuery({ queryKey: KEY, queryFn: fetchBlockedUsers });
  const remove = useMutation({
    mutationFn: (user: BlockedUser) => unblock(user.id),
    onSuccess: () => {
      haptics.success();
      // Engel kalkınca feed, profil ve aramalar yeniden görünür hâle gelir
      queryClient.invalidateQueries();
      actions.refresh();
    },
    onError: (error) => showError(error, t('failures.unblock')),
  });

  const confirm = (user: BlockedUser) =>
    showAlert(t('blocked.unblockTitle', { name: user.name }), t('blocked.unblockText'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('blocked.unblock'), onPress: () => remove.mutate(user) },
    ]);

  if (blocked.isPending) {
    return (
      <SkeletonScreen>
        <UserRowsSkeleton count={4} />
      </SkeletonScreen>
    );
  }
  if (blocked.isError) return <ErrorView onRetry={() => blocked.refetch()} style={styles.container} />;

  return (
    <FlatList
      ListFooterComponent={<BottomInsetSpacer />}
      style={styles.container}
      data={blocked.data}
      keyExtractor={(u) => u.id}
      contentInsetAdjustmentBehavior="automatic"
      ItemSeparatorComponent={() => <Divider inset={spacing.lg + 44 + spacing.md} />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <SymbolView name="hand.raised" tintColor={colors.textTertiary} size={40} />
          <Text variant="headline" align="center">
            {t('blocked.empty')}
          </Text>
          <Text variant="subhead" color={colors.textSecondary} align="center">
            {t('blocked.emptyHint')}
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Avatar uri={item.avatarUrl} name={item.name} size={44} />
          <View style={styles.info}>
            <Text variant="headline" numberOfLines={1}>
              {item.name}
            </Text>
            <Text variant="footnote" color={colors.textSecondary} numberOfLines={1}>
              @{item.username}
            </Text>
          </View>
          <Button
            title={t('blocked.unblock')}
            variant="outline"
            size="sm"
            loading={remove.isPending && remove.variables?.id === item.id}
            onPress={() => confirm(item)}
          />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
  empty: {
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xxl,
  },
});
