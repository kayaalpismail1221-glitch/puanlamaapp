import { forwardRef, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { colors, fonts, spacing } from '@/constants/theme';

type Props = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
};

/** Onboarding adımları için ortak iskelet: serif başlık, içerik, alt buton */
export function OnboardingStep({ title, subtitle, children, footer }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + 52 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && (
          <Text variant="callout" color={colors.textSecondary}>
            {subtitle}
          </Text>
        )}
      </Animated.View>
      <Animated.View entering={FadeIn.delay(150)} style={styles.content}>
        {children}
      </Animated.View>
      {footer && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>{footer}</View>
      )}
    </KeyboardAvoidingView>
  );
}

type BigInputProps = TextInputProps & {
  /** Alanın solunda sabit metin, ör. "+90" */
  prefix?: string;
  error?: string;
  hint?: string;
  accessory?: ReactNode;
};

/** Büyük, çerçevesiz giriş alanı: odaklanınca alt çizgi lacivert olur */
export const BigInput = forwardRef<TextInput, BigInputProps>(function BigInput(
  { prefix, error, hint, accessory, style, onFocus, onBlur, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.inputWrap}>
      <View
        style={[
          styles.inputRow,
          focused && { borderBottomColor: colors.primary },
          !!error && { borderBottomColor: colors.danger },
        ]}>
        {prefix && <Text style={[styles.input, styles.prefix]}>{prefix}</Text>}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textTertiary}
          selectionColor={colors.primary}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, styles.inputFlex, style]}
          {...rest}
        />
        {accessory}
      </View>
      {error ? (
        <Animated.View entering={FadeIn}>
          <Text variant="footnote" color={colors.danger}>
            {error}
          </Text>
        </Animated.View>
      ) : hint ? (
        <Text variant="footnote" color={colors.textSecondary}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '700',
    color: colors.primary,
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
    borderBottomWidth: 2,
    borderBottomColor: colors.border,
    paddingBottom: spacing.sm,
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
  prefix: {
    color: colors.textSecondary,
  },
});
