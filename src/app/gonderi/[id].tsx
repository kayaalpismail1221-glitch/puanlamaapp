import { useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PostCard } from '@/components/post-card';
import { showError } from '@/api/errors';
import { CommentsSkeleton } from '@/components/skeleton';
import { Avatar, Divider, LoadingView, PressableScale, Text } from '@/components/ui';
import { colors, hitSlop, radius, spacing, typography } from '@/constants/theme';
import { getUser, usePost, useUser } from '@/data/entities';
import { useAddComment, useComments, useDeleteComment } from '@/hooks/queries';
import { timeAgo } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { confirmBlock, openReportMenu, showMenu } from '@/lib/moderation';
import { openUserProfile } from '@/lib/navigation';
import { queryClient } from '@/lib/query-client';
import { isMe } from '@/lib/session';
import { useAppStore } from '@/store/app-store';
import type { Comment } from '@/types';

/** Gönderi detayı: tam açıklama ve yorumlar */
export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile, actions } = useAppStore();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const post = usePost(id);
  const comments = useComments(id);
  const addComment = useAddComment(id);
  const deleteComment = useDeleteComment(id);

  if (post === undefined) return <LoadingView style={styles.center} />;
  if (!post) {
    return (
      <View style={styles.center}>
        <Text color={colors.textSecondary}>{t('comments.gone')}</Text>
      </View>
    );
  }

  const send = () => {
    const body = text.trim();
    if (!body || addComment.isPending) return;
    haptics.tap();
    addComment.mutate(body, {
      onSuccess: () => setText(''),
      onError: (error) => showError(error, t('failures.commentSend')),
    });
  };

  const confirmDelete = (comment: Comment) =>
    Alert.alert(t('comments.deleteTitle'), t('comments.deleteText'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () =>
          deleteComment.mutate(comment.id, { onError: (error) => showError(error, t('failures.commentDelete')) }),
      },
    ]);

  /**
   * Yorum menüsü: kendi yorumunu ya da kendi gönderindeki yorumu silebilirsin;
   * başkasının yorumunu şikâyet edebilir, yazarını engelleyebilirsin.
   */
  const commentActions = (comment: Comment) => {
    const author = getUser(comment.userId);
    const options = [];
    if (isMe(comment.userId) || isMe(post.userId)) {
      options.push({ label: t('comments.deleteTitle'), destructive: true, onPress: () => confirmDelete(comment) });
    }
    if (!isMe(comment.userId)) {
      options.push({ label: t('moderation.reportComment'), destructive: true, onPress: () => openReportMenu({ commentId: comment.id }) });
      if (author) {
        options.push({
          label: t('moderation.blockUser', { name: author.name.split(' ')[0] }),
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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top + 44}>
      <FlatList
        data={comments.data ?? []}
        keyExtractor={(c) => c.id}
        keyboardDismissMode="interactive"
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
        renderItem={({ item }) => <CommentRow comment={item} onActions={() => commentActions(item)} />}
      />

      {/* Yorum yazma çubuğu */}
      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
        <Avatar uri={profile?.avatarUri} name={profile?.name ?? '?'} size={32} />
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={t('comments.placeholder')}
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
    </KeyboardAvoidingView>
  );
}

function CommentRow({ comment, onActions }: { comment: Comment; onActions: () => void }) {
  const { t } = useTranslation();
  const author = useUser(comment.userId);
  if (!author) return null;
  return (
    <PressableScale onLongPress={onActions} haptic={false} scaleTo={1} style={styles.comment}>
      <PressableScale onPress={() => openUserProfile(author.id)} haptic={false}>
        <Avatar uri={author.avatarUrl} name={author.name} size={32} />
      </PressableScale>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="subhead">
          <Text variant="subhead" style={styles.bold} onPress={() => openUserProfile(author.id)}>
            {author.username || author.name}
          </Text>{' '}
          {comment.text}
        </Text>
        <Text variant="caption" color={colors.textSecondary}>
          {timeAgo(comment.createdAt)}
        </Text>
      </View>
      {/* Uzun basma yanında görünür bir seçenekler düğmesi: şikâyet/engelle kolay bulunsun */}
      <PressableScale onPress={onActions} hitSlop={hitSlop} accessibilityLabel={t('moderation.options')}>
        <SymbolView name="ellipsis" tintColor={colors.textTertiary} size={16} />
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
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
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
