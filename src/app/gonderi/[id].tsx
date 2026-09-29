import { useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PostCard } from '@/components/post-card';
import { showError } from '@/api/errors';
import { CommentsSkeleton } from '@/components/skeleton';
import { Avatar, Divider, LoadingView, PressableScale, Text } from '@/components/ui';
import { colors, hitSlop, radius, spacing, typography } from '@/constants/theme';
import { getUser, usePost, useUser } from '@/data/entities';
import { useAddComment, useComments, useDeleteComment, useToggleCommentLike } from '@/hooks/queries';
import { showAlert } from '@/lib/dialog';
import { timeAgo } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import type { MenuOption } from '@/lib/dialog';
import { confirmBlock, openReportMenu, showMenu } from '@/lib/moderation';
import { openUserProfile } from '@/lib/navigation';
import { queryClient } from '@/lib/query-client';
import { isMe } from '@/lib/session';
import { useAppStore } from '@/store/app-store';
import type { Comment } from '@/types';

/** Bir dizide bu kadar yanıttan fazlası "N yanıt daha gör" ile açılır */
const VISIBLE_REPLIES = 2;

type Row =
  | { type: 'comment'; comment: Comment; reply: boolean; replyingTo?: string }
  | { type: 'more'; rootId: string; hidden: number };

/**
 * Yorumları dizilere çevirir: her ilk yorumun altında, yanıt zincirindeki tüm yanıtlar (yanıtın yanıtı dahil)
 * tarih sırasıyla. İlk yoruma değil bir yanıta verilen yanıtta kime verildiği (`replyingTo`) gösterilir.
 */
function threadRows(comments: Comment[], expanded: Set<string>): Row[] {
  const byId = new Map(comments.map((c) => [c.id, c]));
  const rootOf = (c: Comment): Comment => {
    let current = c;
    while (current.parentId && byId.has(current.parentId)) current = byId.get(current.parentId)!;
    return current;
  };
  const replies = new Map<string, Comment[]>();
  const roots: Comment[] = [];
  for (const c of comments) {
    const root = rootOf(c);
    if (root === c) roots.push(c);
    else replies.set(root.id, [...(replies.get(root.id) ?? []), c]);
  }
  return roots.flatMap((root) => {
    const thread = replies.get(root.id) ?? [];
    const open = expanded.has(root.id) || thread.length <= VISIBLE_REPLIES + 1;
    const shown = open ? thread : thread.slice(0, VISIBLE_REPLIES);
    const rows: Row[] = [{ type: 'comment', comment: root, reply: false }];
    for (const c of shown) {
      const parent = c.parentId ? byId.get(c.parentId) : undefined;
      const replyingTo = parent && parent.id !== root.id ? getUser(parent.userId)?.username : undefined;
      rows.push({ type: 'comment', comment: c, reply: true, replyingTo });
    }
    if (!open) rows.push({ type: 'more', rootId: root.id, hidden: thread.length - shown.length });
    return rows;
  });
}

/** Gönderi detayı: tam açıklama, yorumlar ve yanıtları; yorum beğenme */
export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile, actions } = useAppStore();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const post = usePost(id);
  const comments = useComments(id);
  const addComment = useAddComment(id);
  const deleteComment = useDeleteComment(id);
  const toggleLike = useToggleCommentLike(id);

  const rows = useMemo(() => threadRows(comments.data ?? [], expanded), [comments.data, expanded]);
  const replyAuthor = useUser(replyTo?.userId);

  if (post === undefined) return <LoadingView style={styles.center} />;
  if (!post) {
    return (
      <View style={styles.center}>
        <Text color={colors.textSecondary}>{t('comments.gone')}</Text>
      </View>
    );
  }

  const expand = (rootId: string) => setExpanded((prev) => new Set(prev).add(rootId));

  const startReply = (comment: Comment) => {
    haptics.select();
    setReplyTo(comment);
    inputRef.current?.focus();
  };

  const send = () => {
    const body = text.trim();
    if (!body || addComment.isPending) return;
    haptics.tap();
    const parentId = replyTo?.id;
    addComment.mutate(
      { text: body, parentId },
      {
        onSuccess: (created) => {
          setText('');
          setReplyTo(null);
          // Yeni yanıt kapalı bir dizinin içinde kaybolmasın
          if (created.parentId) {
            const byId = new Map((comments.data ?? []).map((c) => [c.id, c]));
            let root = byId.get(created.parentId);
            while (root?.parentId && byId.has(root.parentId)) root = byId.get(root.parentId);
            if (root) expand(root.id);
          }
        },
        onError: (error) => showError(error, t('failures.commentSend')),
      },
    );
  };

  const like = (comment: Comment) => {
    haptics.select();
    toggleLike(comment);
  };

  const confirmDelete = (comment: Comment) =>
    showAlert(t('comments.deleteTitle'), t('comments.deleteText'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          if (replyTo && replyTo.id === comment.id) setReplyTo(null);
          deleteComment.mutate(comment.id, { onError: (error) => showError(error, t('failures.commentDelete')) });
        },
      },
    ]);

  /**
   * Yorum menüsü: kendi yorumunu ya da kendi gönderindeki yorumu silebilirsin;
   * başkasının yorumunu şikâyet edebilir, yazarını engelleyebilirsin.
   */
  const commentActions = (comment: Comment) => {
    const author = getUser(comment.userId);
    const options: MenuOption[] = [];
    if (isMe(comment.userId) || isMe(post.userId)) {
      options.push({ icon: 'trash', label: t('comments.deleteTitle'), destructive: true, onPress: () => confirmDelete(comment) });
    }
    if (!isMe(comment.userId)) {
      options.push({ icon: 'exclamationmark.bubble', label: t('moderation.reportComment'), destructive: true, onPress: () => openReportMenu({ commentId: comment.id }) });
      if (author) {
        options.push({
          icon: 'hand.raised', label: t('moderation.blockUser', { name: author.name.split(' ')[0] }),
          destructive: true,
          onPress: () =>
            confirmBlock(author, () => {
              queryClient.invalidateQueries();
              actions.refresh();
            }),
        });
      }
    }
    if (options.length) showMenu(undefined, options);
  };

  const replyName = replyAuthor?.username || replyAuthor?.name || '';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top + 44}>
      <FlatList
        data={rows}
        keyExtractor={(row) => (row.type === 'comment' ? row.comment.id : `more-${row.rootId}`)}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={
          <>
            <PostCard post={post} expanded />
            <Divider />
            <Text variant="headline" style={styles.commentsTitle}>
              {t('comments.title')}
            </Text>
          </>
        }
        ListEmptyComponent={
          comments.isPending ? (
            <CommentsSkeleton />
          ) : (
            <Text variant="subhead" color={colors.textSecondary} style={styles.empty}>
              {t('comments.empty')}
            </Text>
          )
        }
        renderItem={({ item }) =>
          item.type === 'more' ? (
            <PressableScale onPress={() => expand(item.rootId)} haptic={false} style={styles.more}>
              <View style={styles.moreLine} />
              <Text variant="footnote" color={colors.textSecondary} style={styles.bold}>
                {t('comments.moreReplies', { count: item.hidden })}
              </Text>
            </PressableScale>
          ) : (
            <CommentRow
              comment={item.comment}
              reply={item.reply}
              replyingTo={item.replyingTo}
              onReply={() => startReply(item.comment)}
              onLike={() => like(item.comment)}
              onActions={() => commentActions(item.comment)}
            />
          )
        }
      />

      {/* Yorum yazma çubuğu; yanıt verirken kime yanıt verildiği üstte */}
      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
        {replyTo && (
          <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(120)} style={styles.replyBar}>
            <Text variant="footnote" color={colors.textSecondary} style={{ flex: 1 }} numberOfLines={1}>
              {t('comments.replyingTo', { name: replyName })}
            </Text>
            <PressableScale onPress={() => setReplyTo(null)} hitSlop={hitSlop} accessibilityLabel={t('comments.cancelReply')}>
              <SymbolView name="xmark.circle.fill" tintColor={colors.textTertiary} size={18} />
            </PressableScale>
          </Animated.View>
        )}
        <View style={styles.inputRow}>
          <Avatar uri={profile?.avatarUri} name={profile?.name ?? '?'} size={32} />
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            placeholder={replyTo ? t('comments.replyPlaceholder', { name: replyName }) : t('comments.placeholder')}
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={300}
            style={[typography.callout, styles.input]}
          />
          <PressableScale
            onPress={send}
            disabled={!text.trim() || addComment.isPending}
            hitSlop={hitSlop}
            accessibilityLabel={t('comments.send')}>
            <SymbolView
              name="arrow.up.circle.fill"
              tintColor={text.trim() ? colors.primary : colors.textTertiary}
              size={30}
            />
          </PressableScale>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function CommentRow({
  comment,
  reply,
  replyingTo,
  onReply,
  onLike,
  onActions,
}: {
  comment: Comment;
  reply: boolean;
  /** Yanıtın yanıtıysa kime verildiği (kullanıcı adı) */
  replyingTo?: string;
  onReply: () => void;
  onLike: () => void;
  onActions: () => void;
}) {
  const { t } = useTranslation();
  const author = useUser(comment.userId);
  if (!author) return null;
  const avatar = reply ? 24 : 32;
  return (
    <PressableScale onLongPress={onActions} haptic={false} scaleTo={1} style={[styles.comment, reply && styles.reply]}>
      <PressableScale onPress={() => openUserProfile(author.id)} haptic={false}>
        <Avatar uri={author.avatarUrl} name={author.name} size={avatar} />
      </PressableScale>
      <View style={styles.commentBody}>
        <Text variant="subhead">
          <Text variant="subhead" style={styles.bold} onPress={() => openUserProfile(author.id)}>
            {author.username || author.name}
          </Text>{' '}
          {replyingTo && <Text variant="subhead" color={colors.primary}>{`@${replyingTo} `}</Text>}
          {comment.text}
        </Text>
        <View style={styles.meta}>
          <Text variant="caption" color={colors.textSecondary}>
            {timeAgo(comment.createdAt)}
          </Text>
          {comment.likeCount > 0 && (
            <Text variant="caption" color={colors.textSecondary} style={styles.bold}>
              {t('comments.likes', { count: comment.likeCount })}
            </Text>
          )}
          <PressableScale onPress={onReply} hitSlop={hitSlop} haptic={false}>
            <Text variant="caption" color={colors.textSecondary} style={styles.bold}>
              {t('comments.reply')}
            </Text>
          </PressableScale>
          {/* Uzun basmanın yanında görünür seçenekler: şikâyet/engelle kolay bulunsun */}
          <PressableScale onPress={onActions} hitSlop={hitSlop} accessibilityLabel={t('moderation.options')}>
            <SymbolView name="ellipsis" tintColor={colors.textTertiary} size={14} />
          </PressableScale>
        </View>
      </View>
      <PressableScale
        onPress={onLike}
        hitSlop={hitSlop}
        haptic={false}
        scaleTo={0.8}
        style={styles.like}
        accessibilityRole="button"
        accessibilityState={{ selected: comment.likedByMe }}
        accessibilityLabel={comment.likedByMe ? t('comments.unlike') : t('comments.like')}>
        <SymbolView
          name={comment.likedByMe ? 'heart.fill' : 'heart'}
          tintColor={comment.likedByMe ? colors.like : colors.textTertiary}
          size={14}
        />
      </PressableScale>
    </PressableScale>
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
  commentsTitle: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  empty: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  bold: {
    fontWeight: '600',
  },
  comment: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  // Yanıtlar ilk yorumun metniyle hizalı başlar (32 px avatar + boşluk)
  reply: {
    paddingLeft: spacing.lg + 32 + spacing.md,
    gap: spacing.sm,
  },
  commentBody: {
    flex: 1,
    gap: 4,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  like: {
    paddingTop: 4,
    width: 20,
    alignItems: 'center',
  },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.lg + 32 + spacing.md,
    paddingVertical: spacing.xs,
  },
  moreLine: {
    width: 24,
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: colors.textTertiary,
  },
  composer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  input: {
    flex: 1,
    maxHeight: 100,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    color: colors.text,
  },
});
