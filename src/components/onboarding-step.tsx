import { useNavigation, type NativeStackNavigationProp } from 'expo-router';
import type { ParamListBase } from 'expo-router/react-navigation';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Text } from '@/components/ui';
import { colors, fonts, headerHeight, spacing } from '@/constants/theme';
import { haptics } from '@/lib/haptics';

type Props = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
};

/** Sakin giriş: zıplama yok, içerik tek seferde yumuşakça belirir */
const EASE = Easing.out(Easing.cubic);
const enter = FadeIn.duration(280).easing(EASE);

/**
 * Onboarding adımları için ortak iskelet: serif başlık, içerik ve
 * klavyeyle kare kare senkron yükselen alt buton.
 */
export function OnboardingStep({ title, subtitle, children, footer }: Props) {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, spacing.lg);
  return (
    <View style={[styles.container, { paddingTop: insets.top + headerHeight + spacing.md }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && (
          <Text variant="callout" color={colors.textSecondary} style={styles.subtitle}>
            {subtitle}
          </Text>
        )}
      </View>

      <Animated.View entering={enter} style={styles.content}>
        {children}
      </Animated.View>

      {footer && (
        // Klavye açılınca buton klavyenin hemen üstüne yumuşakça çıkar
        <KeyboardStickyView offset={{ closed: 0, opened: bottom - spacing.md }}>
          <View style={[styles.footer, { paddingBottom: bottom }]}>{footer}</View>
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
 * Odaklanınca lacivert çizgi soldan dolar; hata olunca alan hafifçe titrer; geçerli olunca ✓ belirir.
 * `autoFocus` verilirse klavye, sayfa geçişi bittikten sonra açılır (geçiş sırasında içerik itilmez).
 */
export const BigInput = forwardRef<TextInput, BigInputProps>(function BigInput(
  { prefix, error, hint, accessory, valid, style, onFocus, onBlur, autoFocus, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  useImperativeHandle(ref, () => inputRef.current as TextInput);
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();

  useEffect(() => {
    if (!autoFocus) return;
    const focus = () => inputRef.current?.focus();
    // Geçiş animasyonu bitince odaklan; olay gelmezse kısa bir yedek süre
    const unsubscribe = navigation.addListener('transitionEnd', focus);
    const fallback = setTimeout(focus, 450);
    return () => {
      unsubscribe();
      clearTimeout(fallback);
    };
  }, [autoFocus, navigation]);

  const underline = useSharedValue(0);
  const shake = useSharedValue(0);
  const wasValid = useRef(valid);

  // Hata gelince yatayda küçük, kısa bir uyarı hareketi
  useEffect(() => {
    if (!error) return;
    shake.set(
      withSequence(
        withTiming(-4, { duration: 60 }),
        withTiming(4, { duration: 80 }),
        withTiming(0, { duration: 60 }),
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
          ref={inputRef}
          placeholderTextColor={colors.textTertiary}
          selectionColor={colors.primary}
          onFocus={(e) => {
            setFocused(true);
            underline.set(withTiming(1, { duration: 260, easing: EASE }));
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
          <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
            <Icon name="checkmark.circle.fill" tintColor={colors.primary} size={24} />
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
