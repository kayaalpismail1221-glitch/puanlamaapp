import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';

import { Avatar, PlaceImage, PressableScale, ScoreBadge, Text } from '@/components/ui';
import { colors, hitSlop, radius, spacing } from '@/constants/theme';
import { placeById, userById } from '@/data/mock';
import { timeAgo } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { useAppStore } from '@/store/app-store';
import type { FeedItem } from '@/types';

export function FeedCard({ item }: { item: FeedItem }) {
  const { likedFeedItems, wantToGo, dispatch } = useAppStore();
  const user = userById(item.userId);
  const place = placeById(item.placeId);
  const heart = useSharedValue(1);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heart.get() }] }));

  if (!user || !place) return null;

  const liked = likedFeedItems.includes(item.id);
  const saved = wantToGo.includes(place.id);
  const openPlace = () => router.push({ pathname: '/mekan/[id]', params: { id: place.id } });

  const toggleLike = () => {
    haptics.tap();
    heart.set(withSequence(withSpring(1.3, { duration: 120 }), withSpring(1, { duration: 200 })));
    dispatch({ type: 'toggleLike', feedItemId: item.id });
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Avatar uri={user.avatarUrl} name={user.name} size={36} />
        <View style={{ flex: 1 }}>
          <Text variant="subhead" numberOfLines={2}>
            <Text variant="subhead" style={styles.bold}>
              {user.name.split(' ')[0]}
            </Text>
            {' puanladı: '}
            <Text variant="subhead" style={styles.bold} onPress={openPlace}>
              {place.name}
            </Text>
          </Text>
          <Text variant="caption" color={colors.textSecondary}>
            {place.cuisine} · {place.neighborhood} · {timeAgo(item.createdAt)}
          </Text>
        </View>
        <ScoreBadge score={item.score} />
      </View>

      {item.photoUrl && (
        <PressableScale onPress={openPlace} scaleTo={0.98} haptic={false}>
          <PlaceImage uri={item.photoUrl} style={styles.photo} />
        </PressableScale>
      )}

      {item.note && (
        <Text variant="callout" style={styles.note}>
          {item.note}
        </Text>
      )}

      <View style={styles.actions}>
        <PressableScale onPress={toggleLike} haptic={false} hitSlop={hitSlop} style={styles.action}>
          <Animated.View style={heartStyle}>
            <SymbolView
              name={liked ? 'heart.fill' : 'heart'}
              tintColor={liked ? colors.like : colors.textSecondary}
              size={20}
            />
          </Animated.View>
          <Text variant="footnote" color={colors.textSecondary}>
            {item.likeCount + (liked ? 1 : 0)}
          </Text>
        </PressableScale>
        <View style={styles.action}>
          <SymbolView name="bubble.right" tintColor={colors.textSecondary} size={19} />
          <Text variant="footnote" color={colors.textSecondary}>
            {item.commentCount}
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        <PressableScale
          onPress={() => dispatch({ type: 'toggleWantToGo', placeId: place.id })}
          hitSlop={hitSlop}
          accessibilityLabel="Gitmek istiyorum">
          <SymbolView
            name={saved ? 'bookmark.fill' : 'bookmark'}
            tintColor={saved ? colors.primary : colors.textSecondary}
            size={20}
          />
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  bold: {
    fontWeight: '600',
  },
  photo: {
    marginHorizontal: spacing.lg,
    aspectRatio: 4 / 3,
    borderRadius: radius.card,
  },
  note: {
    paddingHorizontal: spacing.lg,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
});
