import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, shadows } from '@/constants/theme';

const liquidGlass = isLiquidGlassAvailable();

/**
 * Cam yüzey: iOS 26+'da sistemin Liquid Glass efekti, daha eski iOS'ta bulanık (blur) arka plan.
 * Android'de cam dili yok (ve bulanıklık harita üstünde pahalı): Material'deki gibi gölgeli, opak yüzey.
 */
export function GlassSurface({
  children,
  style,
  interactive,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  interactive?: boolean;
}) {
  if (Platform.OS === 'android') {
    return <View style={[styles.base, styles.raised, style]}>{children}</View>;
  }
  if (liquidGlass) {
    return (
      <GlassView glassEffectStyle="regular" isInteractive={interactive} style={[styles.base, style]}>
        {children}
      </GlassView>
    );
  }
  return (
    <BlurView intensity={80} tint="systemChromeMaterialLight" style={[styles.base, styles.clip, style]}>
      {children}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.card,
  },
  clip: {
    overflow: 'hidden',
  },
  raised: {
    backgroundColor: colors.raisedSurface,
    boxShadow: shadows.raised,
  },
});
