import { router, useLocalSearchParams } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';

import { PlaceRow } from '@/components/place-row';
import { Avatar, Divider, ScoreBadge, Text } from '@/components/ui';
import { FollowButton } from '@/components/user-row';
import { colors, spacing } from '@/constants/theme';
import { FEED, placeById, userById } from '@/data/mock';

/** Başka bir kullanıcının profili: puanladığı mekânlar puana göre sıralı */
export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = userById(id);

  if (!user) {
    return (
      <View style={styles.center}>
        <Text>Kullanıcı bulunamadı.</Text>
      </View>
    );
  }

  const ratings = FEED.filter((f) => f.userId === user.id).sort((a, b) => b.score - a.score);

  return (
    <FlatList
      style={styles.container}
      data={ratings}
      keyExtractor={(f) => f.id}
      contentInsetAdjustmentBehavior="automatic"
      ItemSeparatorComponent={() => <Divider inset={spacing.lg + 52 + spacing.md} />}
      ListHeaderComponent={
        <View>
          <View style={styles.identity}>
            <Avatar uri={user.avatarUrl} name={user.name} size={88} />
            <Text variant="title2" color={colors.primary}>
              {user.name}
            </Text>
            <Text variant="subhead" color={colors.textSecondary}>
              @{user.username} · {ratings.length} mekân
            </Text>
            <View style={styles.follow}>
              <FollowButton userId={user.id} large />
            </View>
          </View>
          <Text variant="title3" color={colors.primary} style={styles.sectionTitle}>
            Sıralaması
          </Text>
        </View>
      }
      ListEmptyComponent={
        <Text variant="subhead" color={colors.textSecondary} align="center" style={styles.empty}>
          Henüz puanladığı bir mekân yok.
        </Text>
      }
      renderItem={({ item, index }) => {
        const place = placeById(item.placeId);
        if (!place) return null;
        return (
          <PlaceRow
            place={place}
            rank={index + 1}
            onPress={() => router.push({ pathname: '/mekan/[id]', params: { id: place.id } })}
            trailing={<ScoreBadge score={item.score} size="sm" />}
          />
        );
      }}
    />
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
    paddingHorizontal: spacing.xl,
  },
  follow: {
    alignSelf: 'stretch',
    marginTop: spacing.md,
  },
  sectionTitle: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  empty: {
    padding: spacing.xxl,
  },
});
