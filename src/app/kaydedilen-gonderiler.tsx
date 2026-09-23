import { ScrollView, StyleSheet } from 'react-native';

import { PostGrid } from '@/components/post-grid';
import { colors } from '@/constants/theme';
import { useAppStore } from '@/store/app-store';

/** Kaydedilen tüm gönderiler, en son kaydedilen başta */
export default function SavedPostsScreen() {
  const { savedPosts, postById } = useAppStore();
  const posts = savedPosts.flatMap((id) => postById(id) ?? []).reverse();

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
