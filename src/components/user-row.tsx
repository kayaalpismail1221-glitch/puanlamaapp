import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Avatar, PressableScale, Text } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { openUserProfile } from '@/lib/navigation';
import { isMe } from '@/lib/session';
import { useAppStore } from '@/store/app-store';
import type { User } from '@/types';

/** Kişi satırı: dokununca profili açılır, sağda takip butonu */
export function UserRow({ user, subtitle }: { user: User; subtitle?: string }) {
  return (
    <PressableScale
      scaleTo={0.98}
      onPress={() => openUserProfile(user.id)}
      style={styles.row}>
      <Avatar uri={user.avatarUrl} name={user.name} size={44} />
      <View style={styles.info}>
        <Text variant="headline" numberOfLines={1}>
          {user.name}
        </Text>
        <Text variant="footnote" color={colors.textSecondary} numberOfLines={1}>
          {subtitle ?? `@${user.username}`}
        </Text>
      </View>
      {!isMe(user.id) && <FollowButton userId={user.id} />}
    </PressableScale>
  );
}

export function FollowButton({ userId, large }: { userId: string; large?: boolean }) {
  const { isFollowing: follows, actions } = useAppStore();
  const { t } = useTranslation();
  const isFollowing = follows(userId);
  return (
    <PressableScale
      onPress={() => actions.toggleFollow(userId)}
      style={[styles.follow, large && styles.followLarge, isFollowing && styles.following]}
      accessibilityRole="button">
      <Text
        variant={large ? 'headline' : 'subhead'}
        color={isFollowing ? colors.primary : colors.onPrimary}
        style={styles.followText}>
        {isFollowing ? t('follow.following') : t('follow.follow')}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  follow: {
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    paddingHorizontal: spacing.lg,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followLarge: {
    height: 44,
    alignSelf: 'stretch',
  },
  following: {
    backgroundColor: colors.surface,
  },
  followText: {
    fontWeight: '600',
  },
});
