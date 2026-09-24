import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { ActionSheetIOS, Alert, Platform, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';

import { PhotoCarousel } from '@/components/photo-carousel';
import { Avatar, PlaceImage, PressableScale, ScoreBadge, Text } from '@/components/ui';
import { colors, hitSlop, radius, spacing } from '@/constants/theme';
import { block, report, type ReportReason } from '@/api/content';
import { showError } from '@/api/errors';
import { getUser, usePlace, usePost, useUser } from '@/data/entities';
import { useDeletePost } from '@/hooks/queries';
import { timeAgo } from '@/lib/format';
import { formatDistance } from '@/lib/geo';
import { haptics } from '@/lib/haptics';
import { openUserProfile } from '@/lib/navigation';
import { mealLabel, priceBucketLabel } from '@/lib/post-meta';
import { queryClient } from '@/lib/query-client';
import { isMe } from '@/lib/session';
import { useAppStore } from '@/store/app-store';
import type { Post } from '@/types';

const REPORT_REASONS: { key: ReportReason; label: string }[] = [
  { key: 'spam', label: 'Spam ya da reklam' },
  { key: 'offensive', label: 'Rahatsız edici içerik' },
  { key: 'fake', label: 'Sahte ya da yanıltıcı' },
  { key: 'other', label: 'Başka bir sebep' },
];

/** iOS'ta sistem menüsü, diğerlerinde uyarı penceresi */
function showMenu(title: string | undefined, options: { label: string; destructive?: boolean; onPress: () => void }[]) {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: [...options.map((o) => o.label), 'Vazgeç'],
        destructiveButtonIndex: options.flatMap((o, i) => (o.destructive ? [i] : [])),
        cancelButtonIndex: options.length,
        tintColor: colors.primary,
      },
      (i) => options[i]?.onPress(),
    );
  } else {
    Alert.alert(title ?? '', undefined, [
      ...options.map((o) => ({ text: o.label, onPress: o.onPress, style: o.destructive ? ('destructive' as const) : undefined })),
      { text: 'Vazgeç', style: 'cancel' as const },
    ]);
  }
}

type Props = {
  post: Post;
  /** Gönderi detayında açıklama kısaltılmaz ve yorum bağlantısı gösterilmez */
  expanded?: boolean;
  /** Yakınımda feed'inde mekâna uzaklık */
  distanceKm?: number;
};

export function PostCard({ post: initial, expanded, distanceKm }: Props) {
  const { isLiked, isPostSaved, likeCountOf, actions } = useAppStore();
  const deletePost = useDeletePost();
  const heart = useSharedValue(1);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heart.get() }] }));

  // Önbellekteki en güncel hâli (ör. yeni yorum sayısı)
  const post = usePost(initial.id) ?? initial;
  const user = useUser(post.userId);
  const place = usePlace(post.placeId);
  if (!user || !place) return null;

  const liked = isLiked(post);
  const saved = isPostSaved(post);
  const commentCount = post.commentCount;
  const tagged = post.taggedUserIds.flatMap((id) => getUser(id) ?? []);

  const openPlace = () => router.push({ pathname: '/mekan/[id]', params: { id: place.id } });
  const openPost = () => router.push({ pathname: '/gonderi/[id]', params: { id: post.id } });

  const bounceHeart = () => heart.set(withSequence(withSpring(1.3, { duration: 120 }), withSpring(1, { duration: 200 })));

  const toggleLike = () => {
    haptics.tap();
    bounceHeart();
    actions.toggleLike(post);
  };

  // Çift dokunuş yalnızca beğenir, beğeniyi geri almaz
  const likeFromPhoto = () => {
    haptics.tap();
    bounceHeart();
    actions.like(post);
  };

  const toggleSave = () => {
    haptics.select();
    actions.togglePostSaved(post);
  };

  const mine = isMe(post.userId);

  const confirmDelete = () =>
    Alert.alert('Gönderiyi sil', 'Bu gönderi ve fotoğrafları kalıcı olarak silinecek.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () =>
          deletePost.mutate(post, {
            onSuccess: () => {
              haptics.success();
              if (expanded) router.back();
            },
            onError: (error) => showError(error, 'Gönderi silinemedi'),
          }),
      },
    ]);

  const reportPost = () =>
    showMenu(
      'Neden şikâyet ediyorsun?',
      REPORT_REASONS.map((r) => ({
        label: r.label,
        onPress: () =>
          report({ postId: post.id }, r.key).then(
            () => Alert.alert('Teşekkürler', 'Şikâyetini aldık; en kısa sürede inceleyeceğiz.'),
            (error) => showError(error, 'Şikâyet gönderilemedi'),
          ),
      })),
    );

  const blockUser = () =>
    Alert.alert(`${user.name} engellensin mi?`, 'Birbirinizin gönderilerini ve profilini göremezsiniz; takip de kalkar.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Engelle',
        style: 'destructive',
        onPress: () =>
          block(user.id).then(
            () => {
              haptics.success();
              queryClient.invalidateQueries();
              actions.refresh();
              if (expanded) router.back();
            },
            (error) => showError(error, 'Engellenemedi'),
          ),
      },
    ]);

  const showPostMenu = () =>
    showMenu(
      undefined,
      mine
        ? [{ label: 'Gönderiyi sil', destructive: true, onPress: confirmDelete }]
        : [
            { label: 'Şikâyet et', destructive: true, onPress: reportPost },
            { label: `${user.name.split(' ')[0]} kişisini engelle`, destructive: true, onPress: blockUser },
          ],
    );

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
        <PressableScale onPress={showPostMenu} hitSlop={hitSlop} accessibilityLabel="Seçenekler">
          <SymbolView name="ellipsis" tintColor={colors.textSecondary} size={18} />
        </PressableScale>
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

      {post.photos.length > 0 ? (
        <View style={styles.photos}>
          <PhotoCarousel photos={post.photos} onDoubleTap={likeFromPhoto} onPress={expanded ? undefined : openPost} />
        </View>
      ) : (
        // Fotoğrafsız gönderi: mekân görseli ve büyük puanla sade bir kart
        <PressableScale onPress={openPlace} scaleTo={0.98} haptic={false} style={styles.tile}>
          <PlaceImage uri={place.thumbUrl ?? place.photoUrl} style={styles.tileImage} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="headline" numberOfLines={1}>
              {place.name}
            </Text>
            <Text variant="footnote" color={colors.textSecondary} numberOfLines={1}>
              {place.cuisine} · {place.neighborhood}
            </Text>
          </View>
          {post.score !== undefined && <ScoreBadge score={post.score} size="lg" />}
        </PressableScale>
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
            {likeCountOf(post)}
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

      <PostMeta post={post} />

      {!expanded && commentCount > 0 && (
        <Text variant="subhead" color={colors.textSecondary} style={styles.caption} onPress={openPost}>
          {commentCount === 1 ? '1 yorumu gör' : `${commentCount} yorumun tümünü gör`}
        </Text>
      )}
    </View>
  );
}

/** Kişi başı, öğün, yenilenler ve öne çıkanlar */
function PostMeta({ post }: { post: Post }) {
  const chips = [
    priceBucketLabel(post.pricePerPerson) && `${priceBucketLabel(post.pricePerPerson)} / kişi`,
    mealLabel(post.meal),
    ...(post.highlights ?? []),
  ].filter((c): c is string => !!c);
  if (!chips.length && !post.dishes?.length) return null;
  return (
    <View style={styles.meta}>
      {!!post.dishes?.length && (
        <View style={styles.dishes}>
          <SymbolView name="fork.knife" tintColor={colors.textSecondary} size={13} />
          <Text variant="subhead" style={{ flex: 1 }} numberOfLines={2}>
            {post.dishes.join(', ')}
          </Text>
        </View>
      )}
      {chips.length > 0 && (
        <View style={styles.metaChips}>
          {chips.map((c) => (
            <View key={c} style={styles.metaChip}>
              <Text variant="caption" color={colors.primary}>
                {c}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  tileImage: {
    width: 64,
    height: 64,
    borderRadius: radius.button,
  },
  meta: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  dishes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  metaChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  metaChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
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
