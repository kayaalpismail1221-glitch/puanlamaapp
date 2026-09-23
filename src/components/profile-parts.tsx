import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';

import { Avatar, PressableScale, Text } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { monthYear } from '@/lib/format';
import { haptics } from '@/lib/haptics';

/* ---------- Kimlik: avatar, kullanıcı adı, üyelik ---------- */

export function ProfileIdentity({
  name,
  username,
  avatarUri,
  joinedAt,
  onAvatarPress,
}: {
  name: string;
  username: string;
  avatarUri?: string;
  joinedAt?: string;
  onAvatarPress?: () => void;
}) {
  return (
    <View style={styles.identity}>
      <PressableScale onPress={onAvatarPress} disabled={!onAvatarPress} haptic={false}>
        <Avatar uri={avatarUri} name={name} size={96} />
      </PressableScale>
      <Text variant="headline" style={styles.username}>
        @{username}
      </Text>
      {joinedAt && (
        <Text variant="footnote" color={colors.textSecondary}>
          Üyelik: {monthYear(joinedAt)}
        </Text>
      )}
    </View>
  );
}

/* ---------- Beli tarzı liste satırı ---------- */

export function MenuRow({
  icon,
  title,
  subtitle,
  count,
  locked,
  onPress,
}: {
  icon: SFSymbol;
  title: string;
  subtitle?: string;
  count?: number;
  locked?: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={onPress} scaleTo={0.99} style={styles.menuRow} accessibilityRole="button">
      <SymbolView name={icon} tintColor={colors.text} size={22} style={styles.menuIcon} />
      <View style={{ flex: 1 }}>
        <Text variant="headline">{title}</Text>
        {subtitle && (
          <Text variant="footnote" color={colors.textSecondary}>
            {subtitle}
          </Text>
        )}
      </View>
      {locked ? (
        <SymbolView name="lock.fill" tintColor={colors.textTertiary} size={16} />
      ) : (
        <>
          {count !== undefined && (
            <Text variant="headline" style={styles.menuCount}>
              {count}
            </Text>
          )}
          <SymbolView name="chevron.right" tintColor={colors.textTertiary} size={14} weight="semibold" />
        </>
      )}
    </PressableScale>
  );
}

/* ---------- Bilgi kartı (Sıralama, Seri) ---------- */

export function StatCard({
  icon,
  title,
  value,
  locked,
  onPress,
}: {
  icon: SFSymbol;
  title: string;
  value?: string;
  locked?: boolean;
  onPress?: () => void;
}) {
  return (
    <PressableScale onPress={onPress} disabled={!onPress} scaleTo={0.97} style={styles.statCard}>
      <SymbolView name={icon} tintColor={colors.primary} size={24} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="footnote" color={colors.textSecondary}>
          {title}
        </Text>
        {locked ? (
          <SymbolView name="lock.fill" tintColor={colors.textSecondary} size={15} style={styles.cardLock} />
        ) : (
          <Text variant="headline" color={colors.primary} numberOfLines={1}>
            {value}
          </Text>
        )}
      </View>
    </PressableScale>
  );
}

/* ---------- Yıllık hedef ---------- */

const GOAL_PRESETS = [20, 50, 100];

export function GoalCard({
  goal,
  done,
  onChange,
}: {
  goal?: number;
  done: number;
  onChange: (goal: number | undefined) => void;
}) {
  const year = new Date().getFullYear();
  const progress = goal ? Math.min(done / goal, 1) : 0;

  const custom = () => {
    const apply = (text?: string) => {
      const n = Number.parseInt(text ?? '', 10);
      if (n > 0 && n <= 1000) {
        haptics.success();
        onChange(n);
      }
    };
    if (Platform.OS === 'ios') {
      Alert.prompt(`${year} hedefin`, 'Bu yıl kaç yeni mekân denemek istiyorsun?', apply, 'plain-text', '', 'number-pad');
    } else apply('30');
  };

  if (!goal) {
    return (
      <View style={styles.goalCard}>
        <View style={styles.goalHeader}>
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text variant="headline">{year} hedefini belirle</Text>
            <Text variant="subhead" color={colors.textSecondary}>
              Bu yıl kaç yeni mekân denemek istiyorsun?
            </Text>
          </View>
          <SymbolView name="trophy.fill" tintColor={colors.primary} size={36} />
        </View>
        <View style={styles.goalChips}>
          {GOAL_PRESETS.map((n) => (
            <PressableScale
              key={n}
              onPress={() => {
                haptics.success();
                onChange(n);
              }}
              haptic={false}
              style={styles.goalChip}>
              <Text variant="subhead" style={styles.bold}>
                {n}
              </Text>
            </PressableScale>
          ))}
          <PressableScale onPress={custom} style={styles.goalChip}>
            <Text variant="subhead" style={styles.bold}>
              Özel
            </Text>
          </PressableScale>
        </View>
      </View>
    );
  }

  return (
    <PressableScale
      scaleTo={0.99}
      onPress={() =>
        Alert.alert(`${year} hedefin`, `${goal} mekân`, [
          { text: 'Hedefi değiştir', onPress: custom },
          { text: 'Hedefi kaldır', style: 'destructive', onPress: () => onChange(undefined) },
          { text: 'Vazgeç', style: 'cancel' },
        ])
      }
      style={styles.goalCard}>
      <View style={styles.goalHeader}>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text variant="headline">{year} hedefin</Text>
          <Text variant="subhead" color={colors.textSecondary}>
            {done >= goal ? 'Hedefine ulaştın! 🎉' : `${goal - done} mekân kaldı`}
          </Text>
        </View>
        <Text variant="title2" color={colors.primary} style={styles.goalValue}>
          {done}/{goal}
        </Text>
      </View>
      <View style={styles.track}>
        <Animated.View layout={LinearTransition.springify()} style={[styles.fill, { width: `${progress * 100}%` }]} />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  identity: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.sm,
  },
  username: {
    marginTop: spacing.sm,
  },
  bold: {
    fontWeight: '600',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    backgroundColor: colors.background,
  },
  menuIcon: {
    width: 26,
    height: 26,
  },
  menuCount: {
    fontVariant: ['tabular-nums'],
  },
  statCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  cardLock: {
    width: 15,
    height: 22,
  },
  goalCard: {
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  goalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  goalChips: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  goalChip: {
    flex: 1,
    height: 36,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalValue: {
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
});
