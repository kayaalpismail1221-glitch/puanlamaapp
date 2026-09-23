import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';

const TOTAL_STEPS = 4;

type Props = {
  step: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
};

/** Onboarding adımları için ortak iskelet: ilerleme çubuğu, başlık, içerik, alt buton */
export function OnboardingStep({ step, title, subtitle, children, footer }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + 52 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.progress}>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <View
            key={i}
            style={[styles.segment, i < step && { backgroundColor: colors.primary }]}
          />
        ))}
      </View>
      <View style={styles.header}>
        <Text variant="title" color={colors.primary}>
          {title}
        </Text>
        {subtitle && (
          <Text variant="callout" color={colors.textSecondary}>
            {subtitle}
          </Text>
        )}
      </View>
      <View style={styles.content}>{children}</View>
      {footer && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          {footer}
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  progress: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.xl,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.border,
  },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  content: {
    flex: 1,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
});
