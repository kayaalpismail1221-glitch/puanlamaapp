import { router } from 'expo-router';
import { SymbolView } from '@/components/symbol';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { PressableScale, Text } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { useUserProfile, useUserRank } from '@/hooks/queries';
import { isMe } from '@/lib/session';
import { useAppStore } from '@/store/app-store';

/**
 * Profil istatistikleri (Beli tarzı): Takipçi · Takip · Sıralama.
 * Sıralama, paylaşılan değerlendirme sayısına göre genel liderlik tablosundaki yer.
 */
export function ProfileStats({ userId }: { userId: string }) {
  const { following } = useAppStore();
  const { t } = useTranslation();
  const profile = useUserProfile(userId);
  const rank = useUserRank(userId).data;
  // Kendi takip sayın anında güncellensin (sunucu sayacını beklemeden)
  const followingCount = isMe(userId) ? following.length : profile.data?.followingCount;

  const openConnections = (tur: 'takipci' | 'takip') =>
    router.push({ pathname: '/baglantilar/[id]', params: { id: userId, tur } });

  return (
    <View style={styles.row}>
      <Stat label={t('follow.followers')} onPress={() => openConnections('takipci')}>
        <Value>{profile.data?.followerCount ?? '–'}</Value>
      </Stat>
      <Stat label={t('follow.followingCount')} onPress={() => openConnections('takip')}>
        <Value>{followingCount ?? '–'}</Value>
      </Stat>
      <Stat label={t('follow.rank')} onPress={() => router.push({ pathname: '/siralama', params: { vurgula: userId } })}>
        {rank ? (
          <Value>#{rank}</Value>
        ) : (
          // İlk değerlendirme paylaşılana kadar sıralama kilitli
          <SymbolView name="lock.fill" tintColor={colors.textSecondary} size={18} style={styles.lock} />
        )}
      </Stat>
    </View>
  );
}

function Stat({ label, onPress, children }: { label: string; onPress: () => void; children: ReactNode }) {
  return (
    <PressableScale onPress={onPress} scaleTo={0.95} style={styles.stat} accessibilityRole="button" accessibilityLabel={label}>
      {children}
      <Text variant="footnote" color={colors.textSecondary}>
        {label}
      </Text>
    </PressableScale>
  );
}

const Value = ({ children }: { children: ReactNode }) => (
  <Text variant="title3" color={colors.primary} style={styles.value}>
    {children}
  </Text>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.sm,
  },
  value: {
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  lock: {
    width: 18,
    height: 25,
  },
});
