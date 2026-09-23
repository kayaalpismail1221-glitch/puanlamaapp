import { StyleSheet, View } from 'react-native';

import { PressableScale, Text } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { haptics } from '@/lib/haptics';

type Props<T extends string> = {
  tabs: readonly { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
};

/** Profil tarzı alt çizgili sekmeler */
export function SegmentTabs<T extends string>({ tabs, value, onChange }: Props<T>) {
  return (
    <View style={styles.row}>
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <PressableScale
            key={t.key}
            haptic={false}
            onPress={() => {
              haptics.select();
              onChange(t.key);
            }}
            style={[styles.tab, active && styles.active]}>
            <Text variant="subhead" color={active ? colors.primary : colors.textSecondary} style={styles.label}>
              {t.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  active: {
    borderBottomColor: colors.primary,
  },
  label: {
    fontWeight: '600',
  },
});
