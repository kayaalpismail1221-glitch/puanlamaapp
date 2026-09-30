import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, type AppSymbol } from '@/components/icon';
import { PressableScale, Text } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { currentLocale } from '@/i18n';

/** iOS ayarlar tarzı gruplu liste: başlık + köşeleri yuvarlatılmış satır grubu + isteğe bağlı dipnot */
export function SettingsGroup({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      {title && (
        <Text variant="footnote" color={colors.textSecondary} style={styles.groupTitle}>
          {title.toLocaleUpperCase(currentLocale())}
        </Text>
      )}
      <View style={styles.groupBody}>{children}</View>
      {footer && (
        <Text variant="footnote" color={colors.textSecondary} style={styles.groupTitle}>
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
  last,
}: {
  icon?: AppSymbol;
  label: string;
  value?: string;
  accessory?: ReactNode;
  onPress?: () => void;
  /** Seçim listelerinde (ör. Dil) sağda onay işareti */
  checked?: boolean;
  destructive?: boolean;
  last?: boolean;
}) {
  const showChevron = onPress && !accessory && checked === undefined;
  return (
    <PressableScale
      onPress={onPress}
      disabled={!onPress}
      scaleTo={0.99}
      haptic={!!onPress}
      style={[styles.row, !icon && styles.rowNoIcon]}
      accessibilityRole="button"
      accessibilityState={checked !== undefined ? { selected: checked } : undefined}>
      {icon && (
        <View style={styles.rowIcon}>
          <Icon name={icon} tintColor={colors.onPrimary} size={15} />
        </View>
      )}
      <View style={[styles.rowBody, !last && styles.rowDivider]}>
        <Text variant="body" color={destructive ? colors.danger : colors.text} style={{ flex: 1 }} numberOfLines={1}>
          {label}
        </Text>
        {value && (
          <Text variant="body" color={colors.textSecondary} numberOfLines={1} style={styles.value}>
            {value}
          </Text>
        )}
        {accessory}
        {checked && <Icon name="checkmark" tintColor={colors.primary} size={16} weight="semibold" />}
        {showChevron && <Icon name="chevron.right" tintColor={colors.textTertiary} size={13} weight="semibold" />}
      </View>
    </PressableScale>
  );
}

export const settingsStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.xl,
    paddingBottom: spacing.xxl,
  },
});

const styles = StyleSheet.create({
  group: {
    gap: spacing.sm,
  },
  groupTitle: {
    paddingHorizontal: spacing.lg,
  },
  groupBody: {
    borderRadius: radius.card,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingLeft: spacing.lg,
    backgroundColor: colors.background,
  },
  rowNoIcon: {
    gap: 0,
  },
  rowIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.button - 4,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingRight: spacing.lg,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  value: {
    maxWidth: 170,
  },
});
