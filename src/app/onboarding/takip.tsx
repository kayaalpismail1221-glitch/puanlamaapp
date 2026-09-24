import { useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { OnboardingStep } from '@/components/onboarding-step';
import { Avatar, Button, Divider, PressableScale, Text } from '@/components/ui';
import { FollowButton } from '@/components/user-row';
import { colors, spacing } from '@/constants/theme';
import { USERS } from '@/data/mock';
import { haptics } from '@/lib/haptics';
import { useAppStore } from '@/store/app-store';

const REQUIRED = 5;

/** 6. En az 5 kişiyi takip et ve başla */
export default function FollowStep() {
  const { following, posts, dispatch } = useAppStore();
  const count = USERS.filter((u) => following.includes(u.id)).length;
  const ready = count >= REQUIRED;

  // Öneriler: en çok değerlendirme paylaşan hesaplar önde
  const suggestions = useMemo(() => {
    const reviews = (id: string) => posts.filter((p) => p.userId === id).length;
    return [...USERS].sort((a, b) => reviews(b.id) - reviews(a.id)).map((u) => ({ user: u, reviews: reviews(u.id) }));
  }, [posts]);

  const followAll = () => {
    haptics.success();
    for (const u of USERS) if (!following.includes(u.id)) dispatch({ type: 'toggleFollow', userId: u.id });
  };

  // Protected rota, onboarded=true olunca kullanıcıyı sekmelere taşır
  const start = () => {
    haptics.success();
    dispatch({ type: 'completeOnboarding' });
  };

  return (
    <OnboardingStep
      step={6}
      title={`${REQUIRED} kişiyi takip et`}
      subtitle="Feed’in dolu başlasın. Takip ettiklerinin puanları önerilerini şekillendirir."
      footer={<Button title={ready ? 'Başla' : `Başla (${count}/${REQUIRED})`} onPress={start} disabled={!ready} />}>
      <FlatList
        data={suggestions}
        keyExtractor={(s) => s.user.id}
        ItemSeparatorComponent={() => <Divider inset={spacing.xl + 48 + spacing.md} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text variant="footnote" color={colors.textSecondary} style={styles.bold}>
              ÖNERİLEN HESAPLAR
            </Text>
            {!ready && (
              <Animated.View entering={FadeIn}>
                <PressableScale onPress={followAll} haptic={false}>
                  <Text variant="subhead" color={colors.primary} style={styles.bold}>
                    Hepsini takip et
                  </Text>
                </PressableScale>
              </Animated.View>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Avatar uri={item.user.avatarUrl} name={item.user.name} size={48} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="headline" numberOfLines={1}>
                {item.user.name}
              </Text>
              <Text variant="footnote" color={colors.textSecondary} numberOfLines={1}>
                @{item.user.username} · {item.reviews} değerlendirme
              </Text>
            </View>
            <FollowButton userId={item.user.id} />
          </View>
        )}
      />
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
  },
  bold: {
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
});
