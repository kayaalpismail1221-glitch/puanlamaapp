import { ScrollView, StyleSheet } from 'react-native';

import { PostGrid } from '@/components/post-grid';
import { colors } from '@/constants/theme';
import { LoadingView } from '@/components/ui';
import { useSavedPosts } from '@/hooks/queries';
import { useAppStore } from '@/store/app-store';

/** Kaydedilen tüm gönderiler, en son kaydedilen başta */
export default function SavedPostsScreen() {
  const { isPostSaved } = useAppStore();
  const saved = useSavedPosts();
  const posts = (saved.data ?? []).filter(isPostSaved);

  if (saved.isPending) return <LoadingView style={styles.container} />;

  return (
    <ScrollView style={styles.container} contentInsetAdjustmentBehavior="automatic">
      <PostGrid posts={posts} emptyText="Feed’deki gönderilerde yer imine dokunarak kaydedebilirsin." />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
