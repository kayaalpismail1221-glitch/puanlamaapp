import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet } from 'react-native';

import { SegmentTabs } from '@/components/segment-tabs';
import { Divider, Text } from '@/components/ui';
import { UserRow } from '@/components/user-row';
import { colors, spacing } from '@/constants/theme';
import { useAppStore } from '@/store/app-store';
import { ME } from '@/types';

type Tab = 'takipci' | 'takip';

/** Bir kullanıcının takipçileri ve takip ettikleri */
export default function ConnectionsScreen() {
  const { id, tur } = useLocalSearchParams<{ id: string; tur?: Tab }>();
  const { followersOf, followingOf, getUser } = useAppStore();
  const [tab, setTab] = useState<Tab>(tur ?? 'takipci');

  const user = getUser(id);
  const followers = followersOf(id);
  const following = followingOf(id);
  const ids = tab === 'takipci' ? followers : following;
  const users = ids.flatMap((uid) => getUser(uid) ?? []);

  const tabs = [
    { key: 'takipci', label: `Takipçi ${followers.length}` },
    { key: 'takip', label: `Takip ${following.length}` },
  ] as const;

  return (
    <>
      <Stack.Screen options={{ title: user ? (id === ME ? 'Bağlantıların' : user.name) : '' }} />
      <FlatList
        style={styles.container}
        data={users}
        keyExtractor={(u) => u.id}
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={<SegmentTabs tabs={tabs} value={tab} onChange={setTab} />}
        ItemSeparatorComponent={() => <Divider inset={spacing.lg + 44 + spacing.md} />}
        ListEmptyComponent={
          <Text variant="subhead" color={colors.textSecondary} align="center" style={styles.empty}>
            {tab === 'takipci' ? 'Henüz takipçi yok.' : 'Henüz kimseyi takip etmiyor.'}
          </Text>
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
