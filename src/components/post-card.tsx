import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { ActionSheetIOS, Alert, Platform, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';

import { PhotoCarousel } from '@/components/photo-carousel';
import { Avatar, PressableScale, ScoreBadge, Text } from '@/components/ui';
import { colors, hitSlop, spacing } from '@/constants/theme';
import { placeById } from '@/data/mock';
import { timeAgo } from '@/lib/format';
import { formatDistance } from '@/lib/geo';
import { haptics } from '@/lib/haptics';
import { useAppStore } from '@/store/app-store';
import { ME, type Post } from '@/types';

type Props = {
  post: Post;
  /** Gönderi detayında açıklama kısaltılmaz ve yorum bağlantısı gösterilmez */
  expanded?: boolean;
  /** Yakınımda feed'inde mekâna uzaklık */
  distanceKm?: number;
};

export function openUserProfile(userId: string) {
  if (userId === ME) router.navigate('/profilim');
  else router.push({ pathname: '/kullanici/[id]', params: { id: userId } });
}

export function PostCard({ post, expanded, distanceKm }: Props) {
  const { likedPosts, savedPosts, dispatch, getUser, commentsFor } = useAppStore();
  const heart = useSharedValue(1);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heart.get() }] }));

  const user = getUser(post.userId);
  const place = placeById(post.placeId);
  if (!user || !place) return null;

  const liked = likedPosts.includes(post.id);
  const saved = savedPosts.includes(post.id);
  const commentCount = commentsFor(post.id).length;
  const tagged = post.taggedUserIds.map(getUser).filter((u) => !!u);

  const openPlace = () => router.push({ pathname: '/mekan/[id]', params: { id: place.id } });
  const openPost = () => router.push({ pathname: '/gonderi/[id]', params: { id: post.id } });

  const bounceHeart = () => heart.set(withSequence(withSpring(1.3, { duration: 120 }), withSpring(1, { duration: 200 })));

  const toggleLike = () => {
    haptics.tap();
    bounceHeart();
    dispatch({ type: 'toggleLikePost', postId: post.id });
  };

  // Çift dokunuş yalnızca beğenir, beğeniyi geri almaz
  const likeFromPhoto = () => {
    haptics.tap();
    bounceHeart();
    if (!liked) dispatch({ type: 'toggleLikePost', postId: post.id });
  };

  const toggleSave = () => {
    haptics.select();
    dispatch({ type: 'toggleSavePost', postId: post.id });
  };

  const showOwnerMenu = () => {
    const remove = () =>
      Alert.alert('Gönderiyi sil', 'Bu gönderi kalıcı olarak silinecek.', [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: () => {
            dispatch({ type: 'deletePost', postId: post.id });
            if (expanded) router.back();
          },
        },
      ]);
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Gönderiyi sil', 'Vazgeç'], destructiveButtonIndex: 0, cancelButtonIndex: 1 },
        (i) => i === 0 && remove(),
      );
    } else remove();
  };

  return (
    <View style={styles.card}>
      {/* Üst: kim, nerede, puan */}
      <View style={styles.header}>
        <PressableScale onPress={() => openUserProfile(user.id)} haptic={false} accessibilityLabel={`${user.name} profili`}>
          <Avatar uri={user.avatarUrl} name={user.name} size={40} />
        </PressableScale>
        <View style={styles.headerText}>
          <Text variant="subhead" numberOfLines={1}>
            <Text variant="subhead" style={styles.bold} onPress={() => openUserProfile(user.id)}>
              {user.name}
            </Text>
          </Text>
          <Text variant="footnote" color={colors.textSecondary} numberOfLines={1}>
            <Text variant="footnote" color={colors.primary} style={styles.bold} onPress={openPlace}>
              {place.name}
            </Text>
            {` · ${distanceKm !== undefined ? formatDistance(distanceKm) : place.neighborhood} · ${timeAgo(post.createdAt)}`}
          </Text>
        </View>
        {post.score !== undefined && <ScoreBadge score={post.score} />}
        {post.userId === ME && (
          <PressableScale onPress={showOwnerMenu} hitSlop={hitSlop} accessibilityLabel="Seçenekler">
            <SymbolView name="ellipsis" tintColor={colors.textSecondary} size={18} />
          </PressableScale>
        )}
      </View>

      {/* Birlikte gidilen arkadaşlar */}
      {tagged.length > 0 && (
        <View style={styles.tagged}>
          <SymbolView name="person.2.fill" tintColor={colors.textSecondary} size={14} />
          <Text variant="footnote" color={colors.textSecondary} numberOfLines={1} style={{ flex: 1 }}>
            {tagged.map((u, i) => (
              <Text key={u.id} variant="footnote" color={colors.text} style={styles.bold} onPress={() => openUserProfile(u.id)}>
                {u.name.split(' ')[0]}
                {i < tagged.length - 1 ? <Text variant="footnote" color={colors.textSecondary}>, </Text> : null}
              </Text>
            ))}
            {' ile birlikte'}
          </Text>
        </View>
      )}

      {post.photos.length > 0 && (
        <View style={styles.photos}>
          <PhotoCarousel photos={post.photos} onDoubleTap={likeFromPhoto} onPress={expanded ? undefined : openPost} />
        </View>
      )}

      {/* Aksiyonlar */}
      <View style={styles.actions}>
        <PressableScale onPress={toggleLike} haptic={false} hitSlop={hitSlop} style={styles.action} accessibilityLabel="Beğen">
          <Animated.View style={heartStyle}>
            <SymbolView
              name={liked ? 'heart.fill' : 'heart'}
              tintColor={liked ? colors.like : colors.text}
              size={24}
            />
          </Animated.View>
          <Text variant="subhead" style={styles.bold}>
            {post.likeCount + (liked ? 1 : 0)}
          </Text>
        </PressableScale>
        <PressableScale onPress={openPost} hitSlop={hitSlop} style={styles.action} accessibilityLabel="Yorumlar">
          <SymbolView name="bubble.right" tintColor={colors.text} size={23} />
          <Text variant="subhead" style={styles.bold}>
            {commentCount}
          </Text>
        </PressableScale>
        <View style={{ flex: 1 }} />
        <PressableScale onPress={toggleSave} haptic={false} hitSlop={hitSlop} accessibilityLabel={saved ? 'Kaydedilenlerden çıkar' : 'Gönderiyi kaydet'}>
          <SymbolView
            name={saved ? 'bookmark.fill' : 'bookmark'}
            tintColor={saved ? colors.primary : colors.text}
            size={23}
          />
        </PressableScale>
      </View>

      {post.caption && (
        <Text variant="callout" numberOfLines={expanded ? undefined : 3} style={styles.caption} onPress={expanded ? undefined : openPost}>
          <Text variant="callout" style={styles.bold}>
            {user.username || user.name}{' '}
          </Text>
          {post.caption}
        </Text>
      )}

      {!expanded && commentCount > 0 && (
        <Text variant="subhead" color={colors.textSecondary} style={styles.caption} onPress={openPost}>
          {commentCount === 1 ? '1 yorumu gör' : `${commentCount} yorumun tümünü gör`}
        </Text>
      )}
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
  headerText: {
    flex: 1,
    gap: 2,
  },
  bold: {
    fontWeight: '600',
  },
  tagged: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  photos: {
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
    gap: spacing.sm,
  },
  caption: {
    paddingHorizontal: spacing.lg,
  },
});
