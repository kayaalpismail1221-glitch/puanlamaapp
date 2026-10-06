import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { ContactFriends } from '@/components/contact-friends';
import { OnboardingStep } from '@/components/onboarding-step';
import { UserRowsSkeleton } from '@/components/skeleton';
import { Avatar, Button, Divider, ErrorView, PressableScale, Text } from '@/components/ui';
import { FollowButton } from '@/components/user-row';
import { colors, spacing } from '@/constants/theme';
import { useUser } from '@/data/entities';
import { useSuggestedUsers } from '@/hooks/queries';
import { useMyInvites } from '@/hooks/use-contact-friends';
import { haptics } from '@/lib/haptics';
import { deferLaunchPushOffer } from '@/lib/notifications';
import { useAppSelector, useAppStore } from '@/store/app-store';

const TARGET = 5;

/** 6. En az 5 kişiyi takip et ve başla */
export default function FollowStep() {
  const { following, isFollowing, actions } = useAppStore();
  const { t } = useTranslation();
  const suggested = useSuggestedUsers(40);
  const [starting, setStarting] = useState(false);
  const invites = useMyInvites();
  // Davet bağlantısıyla ya da elle kaydedilen davet eden (`lib/invite-code`)
  const linkInviter = useUser(useAppSelector((s) => s.profile?.inviterId)) ?? undefined;
  // Davet edenler en üstte (davet bağlamı), sonra öneriler. Liste bu ekranda sabit kalsın;
  // takip edilen kişi listeden kaybolmasın
  const inviters = [
    ...new Map(
      [...(linkInviter ? [linkInviter] : []), ...(invites.data ?? []).map((i) => i.inviter)].map((u) => [u.id, u]),
    ).values(),
  ];
  const inviterIds = new Set(inviters.map((u) => u.id));
  const suggestions = [...inviters, ...(suggested.data ?? []).filter((u) => !inviterIds.has(u.id))];
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
    // Feed'e düşer düşmez bildirim izni sorulmasın; ilk takipte ya da puanlamada sorulur
    deferLaunchPushOffer();
    if (await actions.completeOnboarding()) haptics.success();
    else setStarting(false);
  };

  return (
    <OnboardingStep
      title={t('onboarding.followTitle', { count: TARGET })}
      subtitle={t('onboarding.followSubtitle')}
      footer={
        <>
          <Button
            title={ready ? t('onboarding.start') : t('onboarding.startProgress', { count, required })}
            onPress={start}
            disabled={!ready}
            loading={starting}
          />
          {!ready && !starting && <Button title={t('onboarding.skip')} variant="ghost" onPress={start} />}
        </>
      }>
      <FlatList
        data={suggestions}
        keyExtractor={(u) => u.id}
        ItemSeparatorComponent={() => <Divider inset={spacing.xl + 48 + spacing.md} />}
        ListHeaderComponent={
          <>
            <View style={styles.contacts}>
              <ContactFriends />
            </View>
            <View style={styles.header}>
              <Text variant="footnote" color={colors.textSecondary} style={styles.bold}>
                {t('onboarding.suggested')}
              </Text>
              {!ready && suggestions.length > 0 && (
                <Animated.View entering={FadeIn}>
                  <PressableScale onPress={followAll} haptic={false}>
                    <Text variant="subhead" color={colors.primary} style={styles.bold}>
                      {t('onboarding.followAll')}
                    </Text>
                  </PressableScale>
                </Animated.View>
              )}
            </View>
          </>
        }
        ListEmptyComponent={
          suggested.isPending ? (
            <UserRowsSkeleton />
          ) : suggested.isError ? (
            <ErrorView onRetry={() => suggested.refetch()} />
          ) : (
            <Text variant="subhead" color={colors.textSecondary} align="center" style={styles.empty}>
              {t('onboarding.noSuggestions')}
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
                {inviterIds.has(item.id)
                  ? t('onboarding.invitedTitle', { name: item.name.split(' ')[0] })
                  : t('friends.reviews', { username: item.username, count: 'postCount' in item ? item.postCount : 0 })}
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
  contacts: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
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
