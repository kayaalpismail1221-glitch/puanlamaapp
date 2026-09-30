import { SymbolView, type SFSymbol } from '@/components/symbol';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { haptics } from '@/lib/haptics';

/**
 * Android ayarlar listesi (Material 3): sayfayla aynı zeminde tam genişlik satırlar, lacivert bölüm başlığı,
 * dokununca dalga (ripple), değer satırın altında açıklama olarak, tek seçimde radyo düğmesi, ok yok.
 * Aynı API: iOS tarzı gruplu liste `settings-list.tsx`.
 */
export function SettingsGroup({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      {title && (
        <Text variant="subhead" color={colors.primary} style={styles.groupTitle}>
          {title}
        </Text>
      )}
      <View>{children}</View>
      {footer && (
        <Text variant="footnote" color={colors.textSecondary} style={styles.footer}>
          {footer}
        </Text>
      )}
    </View>
  );
}

export function SettingsRow({
  icon,
  label,
  value,
  accessory,
  onPress,
  checked,
  destructive,
}: {
  icon?: SFSymbol;
  label: string;
  value?: string;
  accessory?: ReactNode;
  onPress?: () => void;
  /** Seçim listelerinde (ör. Dil) başta radyo düğmesi */
  checked?: boolean;
  destructive?: boolean;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={
        onPress &&
        (() => {
          haptics.tap();
          onPress();
        })
      }
      disabled={!onPress}
      android_ripple={{ color: colors.border }}
      style={styles.row}
      accessibilityRole={checked !== undefined ? 'radio' : 'button'}
      accessibilityState={checked !== undefined ? { checked } : undefined}>
      {checked !== undefined && <Radio checked={checked} />}
      {icon && (
        <View style={styles.rowIcon}>
          <SymbolView name={icon} tintColor={destructive ? colors.danger : colors.primary} size={22} />
        </View>
      )}
      <View style={styles.rowBody}>
        <Text variant="callout" color={destructive ? colors.danger : colors.text} numberOfLines={1}>
          {label}
        </Text>
        {value && (
          <Text variant="subhead" color={colors.textSecondary} numberOfLines={1}>
            {value}
          </Text>
        )}
      </View>
      {accessory}
    </Pressable>
  );
}

function Radio({ checked }: { checked: boolean }) {
  return (
    <View style={[styles.radio, checked && styles.radioChecked]}>{checked && <View style={styles.radioDot} />}</View>
  );
}

export const settingsStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingTop: spacing.sm,
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
});

const styles = StyleSheet.create({
  group: {
    gap: spacing.xs,
  },
  groupTitle: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowIcon: {
    width: 24,
    alignItems: 'center',
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioChecked: {
    borderColor: colors.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
});
