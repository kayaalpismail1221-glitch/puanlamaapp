import { useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PostCard } from '@/components/post-card';
import { Avatar, Divider, PressableScale, Text } from '@/components/ui';
import { colors, hitSlop, radius, spacing, typography } from '@/constants/theme';
import { timeAgo } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { openUserProfile } from '@/lib/navigation';
import { useAppStore } from '@/store/app-store';
import { ME } from '@/types';

/** Gönderi detayı: tam açıklama ve yorumlar */
export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { postById, commentsFor, getUser, profile, dispatch } = useAppStore();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');

  const post = postById(id);
  if (!post) {
    return (
      <View style={styles.center}>
        <Text color={colors.textSecondary}>Bu gönderi artık yok.</Text>
      </View>
    );
  }

  const comments = commentsFor(post.id);

  const send = () => {
    const body = text.trim();
    if (!body) return;
    haptics.tap();
    dispatch({
      type: 'addComment',
      comment: {
        id: `c-${Date.now()}`,
        postId: post.id,
        userId: ME,
        text: body,
        createdAt: new Date().toISOString(),
      },
    });
    setText('');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top + 44}>
      <FlatList
        data={comments}
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
          <Text variant="subhead" color={colors.textSecondary} style={styles.empty}>
            İlk yorumu sen yaz.
          </Text>
        }
        renderItem={({ item }) => {
          const author = getUser(item.userId);
          if (!author) return null;
          return (
            <View style={styles.comment}>
              <PressableScale onPress={() => openUserProfile(author.id)} haptic={false}>
                <Avatar uri={author.avatarUrl} name={author.name} size={32} />
              </PressableScale>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="subhead">
                  <Text variant="subhead" style={styles.bold} onPress={() => openUserProfile(author.id)}>
                    {author.username || author.name}
                  </Text>{' '}
                  {item.text}
                </Text>
                <Text variant="caption" color={colors.textSecondary}>
                  {timeAgo(item.createdAt)}
                </Text>
              </View>
            </View>
          );
        }}
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
        <PressableScale onPress={send} disabled={!text.trim()} hitSlop={hitSlop} accessibilityLabel="Gönder">
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
