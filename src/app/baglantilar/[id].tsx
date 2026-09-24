import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet } from 'react-native';

import { SegmentTabs } from '@/components/segment-tabs';
import { Divider, ErrorView, LoadingView, Text } from '@/components/ui';
import { UserRow } from '@/components/user-row';
import { colors, spacing } from '@/constants/theme';
import { useUser } from '@/data/entities';
import { useConnections, useUserProfile } from '@/hooks/queries';
import { isMe } from '@/lib/session';

type Tab = 'takipci' | 'takip';

/** Bir kullanıcının takipçileri ve takip ettikleri */
export default function ConnectionsScreen() {
  const { id, tur } = useLocalSearchParams<{ id: string; tur?: Tab }>();
  const [tab, setTab] = useState<Tab>(tur ?? 'takipci');

  const user = useUser(id);
  const profile = useUserProfile(id);
  const list = useConnections(id, tab === 'takipci' ? 'followers' : 'following');
  const users = list.data ?? [];

  const tabs = [
    {
      key: 'takipci',
      label: `Takipçi ${profile.data?.followerCount ?? ''}`.trim(),
    },
    {
      key: 'takip',
      label: `Takip ${profile.data?.followingCount ?? ''}`.trim(),
    },
  ] as const;

  return (
    <>
      <Stack.Screen
        options={{
          title: user ? (isMe(id) ? 'Bağlantıların' : user.name) : '',
        }}
      />
      <FlatList
        style={styles.container}
        data={users}
        keyExtractor={(u) => u.id}
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={<SegmentTabs tabs={tabs} value={tab} onChange={setTab} />}
        ItemSeparatorComponent={() => <Divider inset={spacing.lg + 44 + spacing.md} />}
        ListEmptyComponent={
          list.isPending ? (
            <LoadingView />
          ) : list.isError ? (
            <ErrorView onRetry={() => list.refetch()} />
          ) : (
            <Text variant="subhead" color={colors.textSecondary} align="center" style={styles.empty}>
              {tab === 'takipci' ? 'Henüz takipçi yok.' : 'Henüz kimseyi takip etmiyor.'}
            </Text>
          )
        }
        renderItem={({ item }) => <UserRow user={item} />}
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
});
