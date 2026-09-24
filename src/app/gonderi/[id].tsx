import { useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PostCard } from '@/components/post-card';
import { showError } from '@/api/errors';
import { Avatar, Divider, LoadingView, PressableScale, Text } from '@/components/ui';
import { colors, hitSlop, radius, spacing, typography } from '@/constants/theme';
import { usePost, useUser } from '@/data/entities';
import { useAddComment, useComments, useDeleteComment } from '@/hooks/queries';
import { timeAgo } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { openUserProfile } from '@/lib/navigation';
import { isMe } from '@/lib/session';
import { useAppStore } from '@/store/app-store';
import type { Comment } from '@/types';

/** Gönderi detayı: tam açıklama ve yorumlar */
export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAppStore();
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
        <Text color={colors.textSecondary}>Bu gönderi artık yok.</Text>
      </View>
    );
  }

  const send = () => {
    const body = text.trim();
    if (!body || addComment.isPending) return;
    haptics.tap();
    addComment.mutate(body, {
      onSuccess: () => setText(''),
      onError: (error) => showError(error, 'Yorum gönderilemedi'),
    });
  };

  // Kendi yorumunu ya da kendi gönderisindeki yorumları uzun basarak sil
  const confirmDelete = (comment: Comment) => {
    if (!isMe(comment.userId) && !isMe(post.userId)) return;
    Alert.alert('Yorumu sil', 'Bu yorum kalıcı olarak silinecek.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => deleteComment.mutate(comment.id, { onError: (error) => showError(error, 'Yorum silinemedi') }),
      },
    ]);
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
              Yorumlar
            </Text>
          </>
        }
        ListEmptyComponent={
          comments.isPending ? (
            <LoadingView />
          ) : (
            <Text variant="subhead" color={colors.textSecondary} style={styles.empty}>
              İlk yorumu sen yaz.
            </Text>
          )
        }
        renderItem={({ item }) => <CommentRow comment={item} onLongPress={() => confirmDelete(item)} />}
      />

      {/* Yorum yazma çubuğu */}
      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
        <Avatar uri={profile?.avatarUri} name={profile?.name ?? '?'} size={32} />
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Yorum ekle…"
          placeholderTextColor={colors.textTertiary}
          multiline
          maxLength={300}
          style={[typography.callout, styles.input]}
        />
        <PressableScale
          onPress={send}
          disabled={!text.trim() || addComment.isPending}
          hitSlop={hitSlop}
          accessibilityLabel="Gönder">
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

function CommentRow({ comment, onLongPress }: { comment: Comment; onLongPress: () => void }) {
  const author = useUser(comment.userId);
  if (!author) return null;
  return (
    <PressableScale onLongPress={onLongPress} haptic={false} scaleTo={1} style={styles.comment}>
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
