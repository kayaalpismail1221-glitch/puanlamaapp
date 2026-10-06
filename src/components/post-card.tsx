import { router } from 'expo-router';
import { SymbolView } from '@/components/symbol';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';

import { PhotoCarousel } from '@/components/photo-carousel';
import { Avatar, PlaceImage, PressableScale, ScoreBadge, Text } from '@/components/ui';
import { colors, hitSlop, radius, scoreInk, spacing } from '@/constants/theme';
import { showError } from '@/api/errors';
import { getUser, usePlace, usePost, useUser } from '@/data/entities';
import { useDeletePost } from '@/hooks/queries';
import { showAlert } from '@/lib/dialog';
import { formatScore, timeAgo } from '@/lib/format';
import { formatDistance } from '@/lib/geo';
import { haptics } from '@/lib/haptics';
import { openUserProfile } from '@/lib/navigation';
import { confirmBlock, openReportMenu, showMenu } from '@/lib/moderation';
import { placeShortArea, placeSubtitle } from '@/lib/place';
import { sharePost } from '@/lib/share';
import { highlightLabel, mealLabel } from '@/lib/post-meta';
import { queryClient } from '@/lib/query-client';
import { scoreInRankings } from '@/lib/ranking';
import { isMe } from '@/lib/session';
import { useAppActions, useAppSelector } from '@/store/app-store';
import type { Post } from '@/types';

type Props = {
  post: Post;
  /** Gönderi detayında açıklama kısaltılmaz ve yorum bağlantısı gösterilmez */
  expanded?: boolean;
  /** Yakınımda feed'inde mekâna uzaklık */
  distanceKm?: number;
};

/**
 * Feed kartı. Uygulama durumunun tamamını değil yalnızca bu gönderinin beğeni/kaydetme durumunu dinler;
 * başka bir karttaki beğeni bu kartı yeniden çizdirmez (uzun feed'de akıcılık için).
 */
export const PostCard = memo(function PostCard({ post: initial, expanded, distanceKm }: Props) {
  const actions = useAppActions();
  const likeOverride = useAppSelector((s) => s.likeOverrides[initial.id]);
  const saveOverride = useAppSelector((s) => s.saveOverrides[initial.id]);
  // Kendi gönderisinde: mekânın puanı hâlâ sıralamada mı (silerken puanı da silme seçeneği için)
  const ranked = useAppSelector(
    (s) => isMe(initial.userId) && Object.values(s.rankings).some((list) => list.some((e) => e.placeId === initial.placeId)),
  );
  // Başkasının gönderisinde: benim bu mekâna verdiğim puan ("Sen 7,9" / "Ben de gittim")
  const myScore = useAppSelector((s) => (isMe(initial.userId) ? undefined : scoreInRankings(s.rankings, initial.placeId)));
  const { t } = useTranslation();
  const deletePost = useDeletePost();
  const heart = useSharedValue(1);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heart.get() }] }));

  // Önbellekteki en güncel hâli (ör. yeni yorum sayısı)
  const post = usePost(initial.id) ?? initial;
  const user = useUser(post.userId);
  const place = usePlace(post.placeId);
  if (!user || !place) return null;

  const liked = likeOverride ?? post.likedByMe;
  const saved = saveOverride ?? post.savedByMe;
  // Sunucudaki sayı kullanıcının kendi beğenisini içermez
  const likeCount = post.likeCount + (liked ? 1 : 0);
  const commentCount = post.commentCount;
  const tagged = post.taggedUserIds.flatMap((id) => getUser(id) ?? []);

  const openPlace = () => router.push({ pathname: '/mekan/[id]', params: { id: place.id } });
  const openPost = () => router.push({ pathname: '/gonderi/[id]', params: { id: post.id } });
  // Yorum simgesi ve "yorumların tümünü gör": gönderi yorumlara kaydırılmış açılır
  const openComments = () => router.push({ pathname: '/gonderi/[id]', params: { id: post.id, yorumlar: '1' } });

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

  // mutate'in kendi onSuccess'i kullanılmaz: silinen gönderi önbellekten çıkınca bu kart kalkar ve TanStack
  // kalkmış gözlemcinin geri çağrılarını çalıştırmaz (ekran kapanmaz, puan silinmezdi). Promise kalkmadan etkilenmez.
  const removePost = async (withScore: boolean) => {
    try {
      await deletePost.mutateAsync(post);
    } catch (error) {
      showError(error, t('failures.postDelete'));
      return;
    }
    haptics.success();
    // Puan gönderiden ayrı durur; istenirse sıralamadan da çıkar
    if (withScore) actions.unrank(post.placeId);
    if (expanded) router.back();
  };

  const confirmDelete = () =>
    showAlert(
      t('post.deleteTitle'),
      ranked ? t('post.deleteTextWithScore', { place: place.name }) : t('post.deleteText'),
      ranked
        ? [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('post.deleteOnlyPost'), style: 'destructive', onPress: () => removePost(false) },
            { text: t('post.deleteWithScore'), style: 'destructive', onPress: () => removePost(true) },
          ]
        : [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('common.delete'), style: 'destructive', onPress: () => removePost(false) },
          ],
    );

  const blockUser = () =>
    confirmBlock(user, () => {
      queryClient.invalidateQueries();
      actions.refresh();
      if (expanded) router.back();
    });

  const showPostMenu = () =>
    showMenu(
      undefined,
      mine
        ? [
            {
              icon: 'photo.on.rectangle', label: t('story.shareToStory'),
              onPress: () => router.push({ pathname: '/hikaye', params: { gonderi: post.id } }),
            },
            { icon: 'square.and.arrow.up', label: t('common.share'), onPress: () => sharePost(post, place, user.name) },
            {
              icon: 'pencil', label: t('editPost.edit'),
              onPress: () => router.push({ pathname: '/gonderi-duzenle', params: { id: post.id } }),
            },
            { icon: 'trash', label: t('post.deleteTitle'), destructive: true, onPress: confirmDelete },
          ]
        : [
            { icon: 'square.and.arrow.up', label: t('common.share'), onPress: () => sharePost(post, place, user.name) },
            { icon: 'exclamationmark.bubble', label: t('moderation.report'), destructive: true, onPress: () => openReportMenu({ postId: post.id }) },
            { icon: 'hand.raised', label: t('moderation.blockUser', { name: user.name.split(' ')[0] }), destructive: true, onPress: blockUser },
          ],
    );

  return (
    <View style={styles.card}>
      {/* Üst: kim, nerede, puan */}
      <View style={styles.header}>
        <PressableScale onPress={() => openUserProfile(user.id)} haptic={false} accessibilityLabel={t('post.profileOf', { name: user.name })}>
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
            {` · ${distanceKm !== undefined ? formatDistance(distanceKm) : placeShortArea(place)} · ${timeAgo(post.createdAt)}`}
          </Text>
        </View>
        {post.score !== undefined && <ScoreBadge score={post.score} />}
        <PressableScale onPress={showPostMenu} hitSlop={hitSlop} accessibilityLabel={t('moderation.options')}>
          <SymbolView name="ellipsis" tintColor={colors.textSecondary} size={18} />
        </PressableScale>
      </View>

      {/* Birlikte gidilen arkadaşlar (açıklamanın üstünde; kullanıcı isteği 2026-10-03) */}
      {tagged.length > 0 && (
        <View style={styles.tagged}>
          <SymbolView name="person.2.fill" tintColor={colors.textSecondary} size={14} />
          <Text variant="footnote" color={colors.textSecondary} numberOfLines={1} style={{ flex: 1 }}>
            {t('post.togetherPrefix')}
            {tagged.map((u, i) => (
              <Text key={u.id} variant="footnote" color={colors.text} style={styles.bold} onPress={() => openUserProfile(u.id)}>
                {u.name.split(' ')[0]}
                {i < tagged.length - 1 ? <Text variant="footnote" color={colors.textSecondary}>, </Text> : null}
              </Text>
            ))}
            {t('post.togetherSuffix')}
          </Text>
        </View>
      )}

      {/* Açıklama X gibi fotoğrafın üstünde (kullanıcı isteği 2026-10-03); ad üstte yazdığı için tekrarlanmaz */}
      {post.caption && (
        <Text variant="callout" numberOfLines={expanded ? undefined : 3} style={styles.caption} onPress={expanded ? undefined : openPost}>
          {post.caption}
        </Text>
      )}

      {post.photos.length > 0 ? (
        <View style={styles.photos}>
          <PhotoCarousel
            key={post.id}
            photos={post.photos}
            thumbs={post.thumbs}
            onDoubleTap={likeFromPhoto}
            onPress={expanded ? undefined : openPost}
          />
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
              {placeSubtitle(place)}
            </Text>
          </View>
          {post.score !== undefined && <ScoreBadge score={post.score} size="lg" />}
        </PressableScale>
      )}

      {/* Aksiyonlar */}
      <View style={styles.actions}>
        <PressableScale onPress={toggleLike} haptic={false} hitSlop={hitSlop} style={styles.action} accessibilityLabel={t('post.like')}>
          <Animated.View style={heartStyle}>
            <SymbolView
              name={liked ? 'heart.fill' : 'heart'}
              tintColor={liked ? colors.like : colors.text}
              size={24}
            />
          </Animated.View>
          <Text variant="subhead" style={styles.bold}>
            {likeCount}
          </Text>
        </PressableScale>
        <PressableScale
          onPress={expanded ? undefined : openComments}
          hitSlop={hitSlop}
          style={styles.action}
          accessibilityLabel={t('post.comments')}>
          <SymbolView name="bubble.right" tintColor={colors.text} size={23} />
          <Text variant="subhead" style={styles.bold}>
            {commentCount}
          </Text>
        </PressableScale>
        <View style={{ flex: 1 }} />
        {!mine && post.score !== undefined && (
          <MyScorePill
            myScore={myScore}
            onRate={() =>
              router.push({
                pathname: '/degerlendir/[id]',
                params: { id: place.id, karsi: user.name.split(' ')[0], karsiPuan: String(post.score) },
              })
            }
            onOpen={openPlace}
            placeName={place.name}
          />
        )}
        <PressableScale onPress={toggleSave} haptic={false} hitSlop={hitSlop} accessibilityLabel={saved ? t('post.unsave') : t('post.save')}>
          <SymbolView
            name={saved ? 'bookmark.fill' : 'bookmark'}
            tintColor={saved ? colors.primary : colors.text}
            size={23}
          />
        </PressableScale>
      </View>

      <PostMeta post={post} />

      {!expanded && commentCount > 0 && (
        <Text variant="subhead" color={colors.textSecondary} style={styles.caption} onPress={openComments}>
          {t('post.viewComments', { count: commentCount })}
        </Text>
      )}
    </View>
  );
});

/**
 * Başkasının gönderisinde kendi puanın: puanladıysan "Sen 7,9" (dokununca mekân),
 * puanlamadıysan "Ben de gittim" (dokununca puanlama; paylaşanın puanı karşılaştırma için taşınır).
 */
function MyScorePill({
  myScore,
  onRate,
  onOpen,
  placeName,
}: {
  myScore?: number;
  onRate: () => void;
  onOpen: () => void;
  placeName: string;
}) {
  const { t } = useTranslation();
  if (myScore === undefined) {
    return (
      <PressableScale
        onPress={onRate}
        style={styles.pill}
        accessibilityRole="button"
        accessibilityLabel={t('post.rateTooLabel', { place: placeName })}>
        <SymbolView name="plus" tintColor={colors.primary} size={11} weight="bold" />
        <Text variant="footnote" color={colors.primary} style={styles.bold}>
          {t('post.rateToo')}
        </Text>
      </PressableScale>
    );
  }
  return (
    <PressableScale
      onPress={onOpen}
      haptic={false}
      style={styles.pill}
      accessibilityLabel={t('post.yourScoreLabel', { score: formatScore(myScore) })}>
      <Text variant="footnote" color={colors.textSecondary}>
        {t('post.you')}
      </Text>
      <Text variant="footnote" color={scoreInk(myScore)} style={styles.pillScore}>
        {formatScore(myScore)}
      </Text>
    </PressableScale>
  );
}

/** Öğün ve öne çıkanlar */
function PostMeta({ post }: { post: Post }) {
  useTranslation(); // dil değişince etiketler güncellensin
  const chips = [mealLabel(post.meal), ...(post.highlights ?? []).map(highlightLabel)].filter(
    (c): c is string => !!c,
  );
  if (!chips.length) return null;
  return (
    <View style={styles.meta}>
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
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 28,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
  pillScore: {
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
