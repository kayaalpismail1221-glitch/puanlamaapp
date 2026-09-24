import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { colors, radius, scoreColor, spacing } from '@/constants/theme';
import { formatScore } from '@/lib/format';

/**
 * Puana göre renklenen pin. Puansızsa `unscored` simgesi gösterilir:
 * "want" (gitmek istiyorum, yer imi) ya da "visited" (gidildi ama puanlanmadı, çatal bıçak).
 */
export function MapPin({
  score,
  active,
  unscored = 'want',
}: {
  score?: number;
  active?: boolean;
  unscored?: 'want' | 'visited';
}) {
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
        <SymbolView name={unscored === 'want' ? 'bookmark.fill' : 'fork.knife'} tintColor={color} size={12} />
      ) : (
        <Text variant="caption" color={colors.onPrimary} style={styles.pinText}>
          {formatScore(score)}
        </Text>
      )}
    </View>
  );
}

/** Küçük harita önizlemeleri için yazısız nokta pin (puansızsa lacivert) */
export function MapDot({ score }: { score?: number }) {
  return <View style={[styles.dot, { backgroundColor: score === undefined ? colors.primary : scoreColor(score) }]} />;
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
  dot: {
    width: 12,
    height: 12,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.background,
  },
});
