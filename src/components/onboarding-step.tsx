import { SymbolView } from 'expo-symbols';
import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  ZoomIn,
  ZoomOut,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { colors, fonts, spacing } from '@/constants/theme';
import { haptics } from '@/lib/haptics';

type Props = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
};

/** Yaylı, hafif gecikmeli giriş: başlık → açıklama → içerik → buton sırayla gelir */
const enter = (order: number) => FadeInDown.delay(80 + order * 70).springify().damping(18).stiffness(160);

/**
 * Onboarding adımları için ortak iskelet: serif başlık, içerik ve
 * klavyeyle kare kare senkron yükselen alt buton.
 */
export function OnboardingStep({ title, subtitle, children, footer }: Props) {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, spacing.lg);
  return (
    <View style={[styles.container, { paddingTop: insets.top + 56 }]}>
      <View style={styles.header}>
        <Animated.Text entering={enter(0)} style={styles.title}>
          {title}
        </Animated.Text>
        {subtitle && (
          <Animated.View entering={enter(1)}>
            <Text variant="callout" color={colors.textSecondary} style={styles.subtitle}>
              {subtitle}
            </Text>
          </Animated.View>
        )}
      </View>

      <Animated.View entering={enter(2)} style={styles.content}>
        {children}
      </Animated.View>

      {footer && (
        // Klavye açılınca buton klavyenin hemen üstüne yumuşakça çıkar
        <KeyboardStickyView offset={{ closed: 0, opened: bottom - spacing.md }}>
          <Animated.View
            entering={FadeInUp.delay(320).springify().damping(18)}
            style={[styles.footer, { paddingBottom: bottom }]}>
            {footer}
          </Animated.View>
        </KeyboardStickyView>
      )}
    </View>
  );
}

type BigInputProps = TextInputProps & {
  /** Alanın solunda sabit içerik, ör. "+90" */
  prefix?: string;
  error?: string;
  hint?: string;
  accessory?: ReactNode;
  /** Değer geçerli olunca sağda onay işareti ve hafif titreşim */
  valid?: boolean;
};

/**
 * Büyük, çerçevesiz giriş alanı.
 * Odaklanınca lacivert çizgi soldan dolar; hata olunca alan titrer; geçerli olunca ✓ belirir.
 */
export const BigInput = forwardRef<TextInput, BigInputProps>(function BigInput(
  { prefix, error, hint, accessory, valid, style, onFocus, onBlur, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const underline = useSharedValue(0);
  const shake = useSharedValue(0);
  const wasValid = useRef(valid);

  // Hata gelince yatayda kısa bir titreme
  useEffect(() => {
    if (!error) return;
    shake.set(
      withSequence(
        withTiming(-10, { duration: 50 }),
        withTiming(10, { duration: 70 }),
        withTiming(-6, { duration: 60 }),
        withTiming(6, { duration: 60 }),
        withTiming(0, { duration: 50 }),
      ),
    );
  }, [error, shake]);

  // Geçersizden geçerliye dönünce tek bir hafif titreşim
  useEffect(() => {
    if (valid && !wasValid.current) haptics.select();
    wasValid.current = valid;
  }, [valid]);

  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.get() }] }));
  const lineStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: underline.get() }] }));

  return (
    <Animated.View style={[styles.inputWrap, shakeStyle]}>
      <View style={styles.inputRow}>
        {prefix && <Text style={[styles.input, styles.prefixText]}>{prefix}</Text>}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textTertiary}
          selectionColor={colors.primary}
          onFocus={(e) => {
            setFocused(true);
            underline.set(withSpring(1, { damping: 20, stiffness: 180 }));
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            underline.set(withTiming(0, { duration: 220 }));
            onBlur?.(e);
          }}
          style={[styles.input, styles.inputFlex, style]}
          {...rest}
        />
        {valid && (
          <Animated.View entering={ZoomIn.springify().damping(12)} exiting={ZoomOut.duration(150)}>
            <SymbolView name="checkmark.circle.fill" tintColor={colors.primary} size={24} />
          </Animated.View>
        )}
        {accessory}
      </View>

      {/* Alt çizgi: gri taban + odakta soldan dolan lacivert (hatada kırmızı) çizgi */}
      <View style={styles.lineBase}>
        <Animated.View
          style={[
            styles.lineFill,
            { backgroundColor: error ? colors.danger : colors.primary },
            error && !focused ? styles.lineFull : lineStyle,
          ]}
        />
      </View>

      {error ? (
        <Animated.View entering={FadeIn.duration(200)}>
          <Text variant="footnote" color={colors.danger}>
            {error}
          </Text>
        </Animated.View>
      ) : hint ? (
        <Text variant="footnote" color={colors.textSecondary}>
          {hint}
        </Text>
      ) : null}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: -0.3,
  },
  subtitle: {
    lineHeight: 22,
  },
  content: {
    flex: 1,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
  inputWrap: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  input: {
    fontSize: 28,
    fontWeight: '600',
    color: colors.text,
    paddingVertical: spacing.xs,
  },
  inputFlex: {
    flex: 1,
  },
  prefixText: {
    color: colors.textSecondary,
    paddingRight: spacing.xs,
  },
  lineBase: {
    height: 2,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  lineFill: {
    height: '100%',
    transformOrigin: 'left',
  },
  lineFull: {
    transform: [{ scaleX: 1 }],
  },
});
