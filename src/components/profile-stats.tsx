import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { PressableScale, Text } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { useLeaderboard } from '@/hooks/use-leaderboard';
import { useAppStore } from '@/store/app-store';

/**
 * Profil istatistikleri (Beli tarzı): Takipçi · Takip · Sıralama.
 * Sıralama, paylaşılan değerlendirme sayısına göre genel liderlik tablosundaki yer.
 */
export function ProfileStats({ userId }: { userId: string }) {
  const { followersOf, followingOf } = useAppStore();
  const leaderboard = useLeaderboard('all', 'all');
  const me = leaderboard.find((e) => e.userId === userId);
  const ranked = !!me && me.reviews > 0;

  const openConnections = (tur: 'takipci' | 'takip') =>
    router.push({ pathname: '/baglantilar/[id]', params: { id: userId, tur } });

  return (
    <View style={styles.row}>
      <Stat label="Takipçi" onPress={() => openConnections('takipci')}>
        <Value>{followersOf(userId).length}</Value>
      </Stat>
      <Stat label="Takip" onPress={() => openConnections('takip')}>
        <Value>{followingOf(userId).length}</Value>
      </Stat>
      <Stat label="Sıralama" onPress={() => router.push({ pathname: '/siralama', params: { vurgula: userId } })}>
        {ranked ? (
          <Value>#{me.rank}</Value>
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
