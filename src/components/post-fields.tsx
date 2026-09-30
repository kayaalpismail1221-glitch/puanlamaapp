import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { PressableScale, Text } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { haptics } from '@/lib/haptics';
import { HIGHLIGHTS, highlightLabel, mealLabel, MEALS } from '@/lib/post-meta';
import type { Meal } from '@/types';

/** Gönderi oluşturma ve düzenleme ekranlarında ortak alanlar: bölüm başlığı, öğün ve öne çıkanlar */

export const MAX_HIGHLIGHTS = 3;

export function FormSection({
  title,
  hint,
  onLayout,
  children,
}: {
  title: string;
  hint?: string;
  /** Bölümün kaydırma içindeki dikey konumu (ör. klavye açılınca oraya kaydırmak için) */
  onLayout?: (y: number) => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.section} onLayout={onLayout && ((e) => onLayout(e.nativeEvent.layout.y))}>
      <View style={styles.sectionHeader}>
        <Text variant="headline">{title}</Text>
        {hint && (
          <Text variant="footnote" color={colors.textSecondary}>
            {hint}
          </Text>
        )}
      </View>
      {children}
    </View>
  );
}

export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <PressableScale
      haptic={false}
      onPress={() => {
        haptics.select();
        onPress();
      }}
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && styles.chipActive]}>
      <Text variant="subhead" color={active ? colors.onPrimary : colors.text}>
        {label}
      </Text>
    </PressableScale>
  );
}

/** Öğün seçimi; seçili öğüne tekrar dokununca kaldırılır */
export function MealPicker({ value, onChange }: { value?: Meal; onChange: (meal: Meal | undefined) => void }) {
  return (
    <View style={styles.mealRow}>
      {MEALS.map((m) => {
        const active = value === m.key;
        return (
          <PressableScale
            key={m.key}
            haptic={false}
            onPress={() => {
              haptics.select();
              onChange(active ? undefined : m.key);
            }}
            accessibilityState={{ selected: active }}
            style={[styles.meal, active && styles.chipActive]}>
            <Icon name={m.icon} tintColor={active ? colors.onPrimary : colors.primary} size={20} />
            <Text variant="caption" color={active ? colors.onPrimary : colors.text} style={styles.bold}>
              {mealLabel(m.key)}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

/** Öne çıkanlar (en fazla MAX_HIGHLIGHTS); değerler veritabanında Türkçe saklanır */
export function HighlightPicker({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const toggle = (h: string) =>
    onChange(value.includes(h) ? value.filter((x) => x !== h) : value.length < MAX_HIGHLIGHTS ? [...value, h] : value);
  return (
    <View style={styles.chips}>
      {HIGHLIGHTS.map((h) => (
        <Chip key={h} label={highlightLabel(h)} active={value.includes(h)} onPress={() => toggle(h)} />
      ))}
    </View>
  );
}

export const postFieldStyles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.primary,
  },
});

const styles = StyleSheet.create({
  ...postFieldStyles,
  section: {
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  bold: {
    fontWeight: '600',
  },
  mealRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  meal: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
  },
});
