import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';

import { PostGrid } from '@/components/post-grid';
import { colors } from '@/constants/theme';
import { PostGridSkeleton, SkeletonScreen } from '@/components/skeleton';
import { useSavedPosts } from '@/hooks/queries';
import { useAppStore } from '@/store/app-store';

/** Kaydedilen tüm gönderiler, en son kaydedilen başta */
export default function SavedPostsScreen() {
  const { isPostSaved } = useAppStore();
  const { t } = useTranslation();
  const saved = useSavedPosts();
  const posts = (saved.data ?? []).filter(isPostSaved);

  if (saved.isPending) {
    return (
      <SkeletonScreen>
        <PostGridSkeleton count={12} />
      </SkeletonScreen>
    );
  }

  return (
    <ScrollView style={styles.container} contentInsetAdjustmentBehavior="automatic">
      <PostGrid posts={posts} emptyText={t('savedPosts.empty')} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
