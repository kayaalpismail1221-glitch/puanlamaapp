import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { OnboardingStep } from '@/components/onboarding-step';
import { Avatar, Button, Divider, ErrorView, LoadingView, PressableScale, Text } from '@/components/ui';
import { FollowButton } from '@/components/user-row';
import { colors, spacing } from '@/constants/theme';
import { useSuggestedUsers } from '@/hooks/queries';
import { haptics } from '@/lib/haptics';
import { useAppStore } from '@/store/app-store';

const TARGET = 5;

/** 6. En az 5 kişiyi takip et ve başla */
export default function FollowStep() {
  const { following, isFollowing, actions } = useAppStore();
  const suggested = useSuggestedUsers(40);
  const [starting, setStarting] = useState(false);
  // Öneriler bu ekranda sabit kalsın; takip edilen kişi listeden kaybolmasın
  const suggestions = suggested.data ?? [];
  // Uygulamanın ilk günlerinde yeterince kullanıcı olmayabilir
  const required = Math.min(TARGET, suggestions.length);
  const count = suggestions.filter((u) => isFollowing(u.id)).length;
  const ready = !suggested.isPending && count >= required;

  const followAll = () => {
    haptics.success();
    for (const u of suggestions) if (!following.includes(u.id)) actions.toggleFollow(u.id);
  };

  // Protected rota, onboarding bitince kullanıcıyı sekmelere taşır
  const start = async () => {
    setStarting(true);
    if (await actions.completeOnboarding()) haptics.success();
    else setStarting(false);
  };

  return (
    <OnboardingStep
      title={`${TARGET} kişiyi takip et`}
      subtitle="Feed’in dolu başlasın. Takip ettiklerinin puanları önerilerini şekillendirir."
      footer={
        <Button
          title={ready ? 'Başla' : `Başla (${count}/${required})`}
          onPress={start}
          disabled={!ready}
          loading={starting}
        />
      }>
      <FlatList
        data={suggestions}
        keyExtractor={(u) => u.id}
        ItemSeparatorComponent={() => <Divider inset={spacing.xl + 48 + spacing.md} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text variant="footnote" color={colors.textSecondary} style={styles.bold}>
              ÖNERİLEN HESAPLAR
            </Text>
            {!ready && suggestions.length > 0 && (
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
        ListEmptyComponent={
          suggested.isPending ? (
            <LoadingView />
          ) : suggested.isError ? (
            <ErrorView onRetry={() => suggested.refetch()} />
          ) : (
            <Text variant="subhead" color={colors.textSecondary} align="center" style={styles.empty}>
              Henüz önerebileceğimiz kimse yok. Arkadaşlarını davet et, sonra buradan bulursun.
            </Text>
          )
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Avatar uri={item.avatarUrl} name={item.name} size={48} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="headline" numberOfLines={1}>
                {item.name}
              </Text>
              <Text variant="footnote" color={colors.textSecondary} numberOfLines={1}>
                @{item.username} · {item.postCount} değerlendirme
              </Text>
            </View>
            <FollowButton userId={item.id} />
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
  empty: {
    padding: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
});
