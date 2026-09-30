import { router } from 'expo-router';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { Icon } from '@/components/icon';
import { PlaceImage, PressableScale, Text } from '@/components/ui';
import { colors, onScoreColor, radius, scoreColor, spacing } from '@/constants/theme';
import { formatScore } from '@/lib/format';
import type { Post } from '@/types';

const GAP = 2;

/** Instagram tarzı 3 sütunlu gönderi ızgarası (ekran genişliğinde) */
export function PostGrid({ posts, emptyText }: { posts: Post[]; emptyText: string }) {
  const { width } = useWindowDimensions();
  const size = Math.floor((width - GAP * 2) / 3);

  if (posts.length === 0) {
    return (
      <Text variant="subhead" color={colors.textSecondary} align="center" style={styles.empty}>
        {emptyText}
      </Text>
    );
  }
  return (
    <View style={styles.grid}>
      {posts.map((post) => (
        <PressableScale
          key={post.id}
          scaleTo={0.96}
          onPress={() => router.push({ pathname: '/gonderi/[id]', params: { id: post.id } })}
          style={[styles.cell, { width: size, height: size * 1.25 }]}>
          {post.photos[0] ? (
            <PlaceImage uri={post.thumbs[0] ?? post.photos[0]} style={StyleSheet.absoluteFill} />
          ) : (
            // Fotoğrafsız gönderi: yorumdan bir parça
            <View style={styles.textCell}>
              <Text variant="caption" color={colors.text} numberOfLines={5}>
                {post.caption}
              </Text>
            </View>
          )}
          {post.photos.length > 1 && (
            <View style={styles.multi}>
              <Icon name="square.fill.on.square.fill" tintColor={colors.onPrimary} size={14} />
            </View>
          )}
          {post.score !== undefined && (
            <View style={[styles.score, { backgroundColor: scoreColor(post.score) }]}>
              <Text variant="caption" color={onScoreColor(post.score)} style={styles.scoreText}>
                {formatScore(post.score)}
              </Text>
            </View>
          )}
        </PressableScale>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  cell: {
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  textCell: {
    flex: 1,
    padding: spacing.sm,
    justifyContent: 'center',
  },
  multi: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
  },
  score: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  scoreText: {
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  empty: {
    padding: spacing.xxl,
  },
});
