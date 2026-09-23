import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { PlaceRow } from '@/components/place-row';
import { PostGrid } from '@/components/post-grid';
import { SegmentTabs } from '@/components/segment-tabs';
import { Avatar, Divider, ScoreBadge, Text } from '@/components/ui';
import { FollowButton } from '@/components/user-row';
import { colors, radius, spacing } from '@/constants/theme';
import { placeById } from '@/data/mock';
import { useAppStore } from '@/store/app-store';

type Tab = 'posts' | 'ranked';

const TABS = [
  { key: 'posts', label: 'Gönderiler' },
  { key: 'ranked', label: 'Sıralaması' },
] as const;

/** Başka bir kullanıcının profili: gönderileri ve mekân sıralaması */
export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { posts, getUser } = useAppStore();
  const [tab, setTab] = useState<Tab>('posts');
  const user = getUser(id);

  const userPosts = useMemo(() => posts.filter((p) => p.userId === id), [posts, id]);

  // Sıralama: her mekân için en yeni gönderideki puan, yüksekten düşüğe
  const ranked = useMemo(
    () =>
      userPosts
        .filter((p, i, list) => p.score !== undefined && list.findIndex((q) => q.placeId === p.placeId) === i)
        .sort((a, b) => b.score! - a.score!),
    [userPosts],
  );

  if (!user) {
    return (
      <View style={styles.center}>
        <Text>Kullanıcı bulunamadı.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentInsetAdjustmentBehavior="automatic">
      <View style={styles.identity}>
        <Avatar uri={user.avatarUrl} name={user.name} size={88} />
        <Text variant="title2" color={colors.primary}>
          {user.name}
        </Text>
        <Text variant="subhead" color={colors.textSecondary}>
          @{user.username}
        </Text>
      </View>

      <View style={styles.stats}>
        <Stat value={userPosts.length} label="Gönderi" />
        <Stat value={ranked.length} label="Mekân" />
      </View>

      <View style={styles.follow}>
        <FollowButton userId={user.id} large />
      </View>

      <SegmentTabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === 'posts' ? (
        <View style={{ paddingTop: 2 }}>
          <PostGrid posts={userPosts} emptyText="Henüz gönderi paylaşmadı." />
        </View>
      ) : ranked.length === 0 ? (
        <Text variant="subhead" color={colors.textSecondary} align="center" style={styles.empty}>
          Henüz puanladığı bir mekân yok.
        </Text>
      ) : (
        ranked.map((p, i) => {
          const place = placeById(p.placeId);
          if (!place) return null;
          return (
            <View key={p.id}>
              {i > 0 && <Divider inset={spacing.lg + 52 + spacing.md} />}
              <PlaceRow
                place={place}
                rank={i + 1}
                onPress={() => router.push({ pathname: '/mekan/[id]', params: { id: place.id } })}
                trailing={<ScoreBadge score={p.score!} size="sm" />}
              />
            </View>
          );
        })
      )}
      <View style={{ height: spacing.xxl }} />
    </ScrollView>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
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
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
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
  follow: {
    padding: spacing.lg,
  },
  empty: {
    padding: spacing.xxl,
  },
});
