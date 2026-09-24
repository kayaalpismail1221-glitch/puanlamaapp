import { Image } from 'expo-image';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { colors, radius, scoreColor, spacing, typography, type TypographyVariant } from '@/constants/theme';
import { formatScore, initials } from '@/lib/format';
import { haptics } from '@/lib/haptics';

/* ---------- Metin ---------- */

type AppTextProps = TextProps & {
  variant?: TypographyVariant;
  color?: string;
  align?: TextStyle['textAlign'];
};

export function Text({ variant = 'body', color = colors.text, align, style, ...rest }: AppTextProps) {
  return <RNText {...rest} style={[typography[variant], { color, textAlign: align }, style]} />;
}

/* ---------- Basınca küçülen, haptikli dokunma alanı ---------- */

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PressableScaleProps = Omit<PressableProps, 'style'> & {
  /** Düz ya da animasyonlu (Reanimated) stil */
  style?: ComponentProps<typeof AnimatedPressable>['style'];
  haptic?: boolean;
  scaleTo?: number;
};

/**
 * Stil doğrudan dokunma alanına uygulanır; böylece `flex`, genişlik gibi
 * yerleşim özellikleri satır/sütun içinde doğru çalışır.
 */
export function PressableScale({
  style,
  haptic = true,
  scaleTo = 0.97,
  onPressIn,
  onPressOut,
  onPress,
  children,
  ...rest
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <AnimatedPressable
      {...rest}
      style={[style, animated]}
      onPressIn={(e) => {
        scale.set(withSpring(scaleTo, { duration: 150 }));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(withSpring(1, { duration: 250 }));
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic) haptics.tap();
        onPress?.(e);
      }}>
      {children as ReactNode}
    </AnimatedPressable>
  );
}

/* ---------- Buton ---------- */

type ButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline';
  size?: 'md' | 'sm';
  icon?: SFSymbol;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ title, onPress, variant = 'primary', size = 'md', icon, disabled, loading, style }: ButtonProps) {
  const fg = variant === 'primary' ? colors.onPrimary : colors.primary;
  const inactive = !!disabled && !loading;
  // Aktif/pasif geçişi ani değil, yumuşak
  const fade = useAnimatedStyle(() => ({ opacity: withTiming(inactive ? 0.35 : 1, { duration: 220 }) }));
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      style={[
        styles.button,
        variant === 'primary' && { backgroundColor: colors.primary },
        variant === 'secondary' && { backgroundColor: colors.surface },
        variant === 'outline' && styles.outline,
        size === 'sm' && styles.small,
        style,
        fade,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <SymbolView name={icon} tintColor={fg} size={size === 'sm' ? 15 : 18} weight="semibold" />}
          <Text variant={size === 'sm' ? 'subhead' : 'headline'} color={fg} style={size === 'sm' && styles.smallText}>
            {title}
          </Text>
        </>
      )}
    </PressableScale>
  );
}

/* ---------- Puan rozeti ---------- */

export function ScoreBadge({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'sm' ? 32 : size === 'md' ? 40 : 64;
  const color = scoreColor(score);
  return (
    <View
      style={[
        styles.badge,
        { width: dim, height: dim, borderColor: color },
        size === 'lg' && { borderWidth: 3 },
      ]}>
      <Text
        variant={size === 'lg' ? 'title2' : size === 'md' ? 'subhead' : 'footnote'}
        color={color}
        style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>
        {formatScore(score)}
      </Text>
    </View>
  );
}

/* ---------- Avatar ---------- */

export function Avatar({ uri, name, size = 40 }: { uri?: string; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size, borderRadius: radius.full };
  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={[style, { backgroundColor: colors.surface }]}
        transition={200}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <View style={[style, styles.avatarFallback]}>
      <Text variant="headline" color={colors.textSecondary} style={{ fontSize: size * 0.4, fontWeight: '500' }}>
        {initials(name)}
      </Text>
    </View>
  );
}

/* ---------- Mekân görseli (yüklenemezse sade yer tutucu) ---------- */

export function PlaceImage({
  uri,
  style,
}: {
  uri?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const [failed, setFailed] = useState(false);
  if (!uri || failed) {
    return (
      <View style={[styles.imageFallback, style]}>
        <SymbolView name="fork.knife" tintColor={colors.textTertiary} size={24} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={[{ backgroundColor: colors.surface }, style as object]}
      contentFit="cover"
      transition={250}
      onError={() => setFailed(true)}
    />
  );
}

/* ---------- Arama alanı ---------- */

export function SearchField({
  value,
  onChangeText,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  return (
    <View style={styles.search}>
      <SymbolView name="magnifyingglass" tintColor={colors.textSecondary} size={17} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        autoFocus={autoFocus}
        autoCorrect={false}
        clearButtonMode="while-editing"
        returnKeyType="search"
        style={[typography.body, styles.searchInput]}
      />
    </View>
  );
}

/* ---------- Ayırıcı ---------- */

export const Divider = ({ inset = 0 }: { inset?: number }) => (
  <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: inset }} />
);

const styles = StyleSheet.create({
  button: {
    height: 52,
    borderRadius: radius.button,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  outline: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  small: {
    height: 36,
    paddingHorizontal: spacing.md,
  },
  smallText: {
    fontWeight: '600',
  },
  badge: {
    borderRadius: radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  avatarFallback: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageFallback: {
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.button,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    height: '100%',
  },
});
