import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { colors, radius, scoreColor, spacing } from '@/constants/theme';
import { formatScore } from '@/lib/format';

/** Puana göre renklenen pin; puansızsa "gitmek istiyorum" pini */
export function MapPin({ score, active }: { score?: number; active?: boolean }) {
  const isWant = score === undefined;
  const color = isWant ? colors.primary : scoreColor(score);
  return (
    <View
      style={[
        styles.pin,
        isWant
          ? { backgroundColor: colors.background, borderColor: color }
          : { backgroundColor: color, borderColor: colors.background },
        active && styles.pinActive,
      ]}>
      {isWant ? (
        <SymbolView name="bookmark.fill" tintColor={color} size={12} />
      ) : (
        <Text variant="caption" color={colors.onPrimary} style={styles.pinText}>
          {formatScore(score)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pin: {
    minWidth: 36,
    height: 28,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  pinActive: {
    transform: [{ scale: 1.2 }],
  },
  pinText: {
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
