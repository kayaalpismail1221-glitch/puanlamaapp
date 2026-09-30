import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fixed, radius } from '@/constants/theme';

/**
 * Android'de cam yerine Material 3'ün yükseltilmiş yüzeyi: opak açık zemin, ince çerçeve ve yumuşak
 * gölge. Android'de gerçek zamanlı bulanıklık pahalı ve harita/fotoğraf üstünde bulanık-gri görünüyor;
 * opak yüzey hem akıcı hem okunaklı. iOS: glass-surface.tsx (Liquid Glass / blur)
 */
export function GlassSurface({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  interactive?: boolean;
}) {
  return <View style={[styles.base, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.card,
    // Yarı saydam zemin Android gölgesini (elevation) içinden gösterir: opak
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: fixed.navy,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
