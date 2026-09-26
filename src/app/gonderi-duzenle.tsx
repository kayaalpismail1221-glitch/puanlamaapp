import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { showError } from '@/api/errors';
import { FormSection, HighlightPicker, MAX_HIGHLIGHTS, MealPicker } from '@/components/post-fields';
import { Button, LoadingView, PlaceImage, Text } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { usePlace, usePost } from '@/data/entities';
import { useUpdatePost } from '@/hooks/queries';
import { useKeyboardFooterStyle } from '@/hooks/use-keyboard-footer';
import { haptics } from '@/lib/haptics';
import { placeSubtitle } from '@/lib/place';
import type { Meal } from '@/types';

/**
 * Kendi gönderini düzenle: açıklama, öğün ve öne çıkanlar.
 * Fotoğraflar ve puan değişmez (puan mekânı yeniden puanlayarak değişir).
 */
export default function EditPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const post = usePost(id);
  const place = usePlace(post?.placeId);
  const update = useUpdatePost();
  const footerStyle = useKeyboardFooterStyle();
  const scrollRef = useRef<ScrollView>(null);
  const captionY = useRef(0);

  const [caption, setCaption] = useState(post?.caption ?? '');
  const [meal, setMeal] = useState<Meal | undefined>(post?.meal);
  const [highlights, setHighlights] = useState<string[]>(post?.highlights ?? []);

  if (!post || !place) return <LoadingView style={styles.container} />;

  const changed =
    caption.trim() !== (post.caption ?? '') ||
    meal !== post.meal ||
    highlights.join('|') !== (post.highlights ?? []).join('|');

  const save = () =>
    update.mutate(
      { post, patch: { caption: caption.trim() || undefined, meal, highlights } },
      {
        onSuccess: () => {
          haptics.success();
          router.back();
        },
        onError: (error) => showError(error, t('failures.postSave')),
      },
    );

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t('editPost.title') }} />
      <ScrollView ref={scrollRef} contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <View style={styles.placeCard}>
          <PlaceImage uri={post.thumbs[0] ?? place.photoUrl} style={styles.placeImage} />
          <View style={styles.flex}>
            <Text variant="headline" numberOfLines={1}>
              {place.name}
            </Text>
            <Text variant="footnote" color={colors.textSecondary}>
              {placeSubtitle(place)}
            </Text>
          </View>
        </View>

        <FormSection
          title={t('compose.caption')}
          hint={t('common.optional')}
          onLayout={(y) => {
            captionY.current = y;
          }}>
          <TextInput
            value={caption}
            onChangeText={setCaption}
            onFocus={() => setTimeout(() => scrollRef.current?.scrollTo({ y: captionY.current - spacing.lg, animated: true }), 250)}
            placeholder={t('compose.captionPlaceholder')}
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={500}
            style={[typography.body, styles.caption]}
          />
        </FormSection>

        <FormSection title={t('compose.meal')}>
          <MealPicker value={meal} onChange={setMeal} />
        </FormSection>

        <FormSection title={t('compose.highlights')} hint={t('compose.highlightsHint', { max: MAX_HIGHLIGHTS })}>
          <HighlightPicker value={highlights} onChange={setHighlights} />
        </FormSection>

        <Text variant="footnote" color={colors.textSecondary}>
          {t('editPost.photosNote')}
        </Text>
      </ScrollView>

      <Animated.View style={[styles.footer, footerStyle]}>
        <Button title={t('common.save')} onPress={save} disabled={!changed} loading={update.isPending} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  form: {
    padding: spacing.lg,
    gap: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  flex: {
    flex: 1,
    gap: 2,
  },
  placeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  placeImage: {
    width: 48,
    height: 48,
    borderRadius: radius.button,
  },
  caption: {
    minHeight: 100,
    padding: spacing.md,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    color: colors.text,
    textAlignVertical: 'top',
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
});
