import { Image } from '@/components/image';
import { SymbolView, type SFSymbol } from '@/components/symbol';
import { useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ColorValue,
  type ViewStyle,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { colors, hitSlop, radius, scoreColor, scoreInk, spacing, typography, type TypographyVariant } from '@/constants/theme';
import { formatScore, initials } from '@/lib/format';
import { haptics } from '@/lib/haptics';

const android = Platform.OS === 'android';

/* ---------- Metin ---------- */

type AppTextProps = TextProps & {
  variant?: TypographyVariant;
  color?: ColorValue;
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
  /** Yalnızca ikon içeren butonlarda ekran okuyucu için zorunlu tutun */
  accessibilityLabel?: string;
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  disabled,
  loading,
  style,
  accessibilityLabel,
}: ButtonProps) {
  const fg = variant === 'primary' ? colors.onPrimary : colors.primary;
  const inactive = !!disabled && !loading;
  // Aktif/pasif geçişi ani değil, yumuşak
  const fade = useAnimatedStyle(() => ({ opacity: withTiming(inactive ? 0.35 : 1, { duration: 220 }) }));
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (title || undefined)}
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
  useTranslation(); // dil değişince ondalık ayracı güncellensin
  const dim = size === 'sm' ? 32 : size === 'md' ? 40 : 64;
  const color = scoreColor(score);
  const text = formatScore(score);
  // "10,0" dört karakter: dairenin içine sığsın diye biraz küçülür
  const fontSize = (size === 'sm' ? 13 : size === 'md' ? 15 : 22) * (text.length > 3 ? 0.82 : 1);
  return (
    <View
      style={[
        styles.badge,
        { width: dim, height: dim, borderColor: color },
        size === 'lg' && { borderWidth: 3 },
      ]}>
      <Text
        variant={size === 'lg' ? 'title2' : size === 'md' ? 'subhead' : 'footnote'}
        color={scoreInk(score)}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={{ fontSize, fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: -0.3, maxWidth: dim - 6 }}>
        {text}
      </Text>
    </View>
  );
}

/* ---------- Avatar ---------- */

export function Avatar({ uri, name, size = 40 }: { uri?: string; name: string; size?: number }) {
  const [failedUri, setFailedUri] = useState<string>();
  const style = { width: size, height: size, borderRadius: radius.full };
  if (uri && failedUri !== uri) {
    return (
      <Image
        source={{ uri }}
        recyclingKey={uri}
        style={[style, { backgroundColor: colors.surface }]}
        transition={200}
        onError={() => setFailedUri(uri)}
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
  placeholder,
  style,
}: {
  uri?: string;
  /** Tam boy yüklenene kadar gösterilecek küçük kopya */
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
}) {
  // Hangi adresin yüklenemediği tutulur: liste hücresi başka görselle yeniden kullanılınca sıfırlanır
  const [failedUri, setFailedUri] = useState<string>();
  if (!uri || failedUri === uri) {
    return (
      <View style={[styles.imageFallback, style]}>
        <SymbolView name="fork.knife" tintColor={colors.textTertiary} size={24} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      placeholder={placeholder ? { uri: placeholder } : undefined}
      placeholderContentFit="cover"
      recyclingKey={uri}
      style={[{ backgroundColor: colors.surface }, style as object]}
      contentFit="cover"
      transition={placeholder ? 150 : 250}
      onError={() => setFailedUri(uri)}
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
  const { t } = useTranslation();
  return (
    <View style={styles.search}>
      <SymbolView name="magnifyingglass" tintColor={colors.textSecondary} size={android ? 20 : 17} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        autoFocus={autoFocus}
        autoCorrect={false}
        clearButtonMode="while-editing"
        returnKeyType="search"
        cursorColor={colors.primary}
        selectionColor={colors.primary}
        style={[typography.body, styles.searchInput]}
      />
      {/* Android'de sistem temizleme düğmesi (clearButtonMode) yok */}
      {android && value.length > 0 && (
        <Pressable
          onPress={() => onChangeText('')}
          hitSlop={hitSlop}
          accessibilityRole="button"
          accessibilityLabel={t('common.clear')}
          android_ripple={{ color: colors.border, borderless: true, radius: 18 }}>
          <SymbolView name="xmark" tintColor={colors.textSecondary} size={20} />
        </Pressable>
      )}
    </View>
  );
}

/* ---------- Ayırıcı ---------- */

export const Divider = ({ inset = 0 }: { inset?: number }) => (
  <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: inset }} />
);

/* ---------- Yükleniyor / hata durumları ---------- */

/** Veri yüklenirken ortalanmış gösterge */
export function LoadingView({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.state, style]}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

/** Yükleme hatası: kısa açıklama ve "Tekrar dene" */
export function ErrorView({
  message,
  onRetry,
  style,
}: {
  message?: string;
  onRetry?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation();
  return (
    <View style={[styles.state, style]}>
      <SymbolView name="wifi.exclamationmark" tintColor={colors.textTertiary} size={36} />
      <Text variant="subhead" color={colors.textSecondary} align="center">
        {message ?? t('common.loadFailed')}
      </Text>
      {onRetry && <Button title={t('common.retry')} variant="secondary" size="sm" onPress={onRetry} />}
    </View>
  );
}

const styles = StyleSheet.create({
  state: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xxl,
  },
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
  // iOS: sistem arama alanı ölçüsü; Android: Material 3 arama çubuğu (hap, 48)
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: android ? spacing.md : spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: android ? radius.full : radius.button,
    paddingHorizontal: android ? spacing.lg : spacing.md,
    height: android ? 48 : 44,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    height: '100%',
    paddingVertical: 0,
  },
});
