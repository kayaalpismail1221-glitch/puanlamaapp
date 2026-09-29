import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { radius } from '@/constants/theme';

const liquidGlass = isLiquidGlassAvailable();

/**
 * Cam yüzey: iOS 26+'da sistemin Liquid Glass efekti,
 * daha eski sürümlerde bulanık (blur) arka plan.
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
  if (liquidGlass) {
    return (
      <GlassView glassEffectStyle="regular" isInteractive={interactive} style={[styles.base, style]}>
        {children}
      </GlassView>
    );
  }
  return (
    <BlurView intensity={80} tint="systemChromeMaterial" style={[styles.base, styles.clip, style]}>
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
});
