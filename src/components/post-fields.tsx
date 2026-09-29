import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { PressableScale, Text } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { haptics } from '@/lib/haptics';
import { useTranslation } from 'react-i18next';

import { highlightLabel, highlightsFor } from '@/lib/post-meta';
import type { Segment } from '@/types';

/** Gönderi oluşturma ve düzenleme ekranlarında ortak alanlar: bölüm başlığı ve öne çıkanlar (öğün sorulmaz, açıklamaya yazılır) */

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

/**
 * Öne çıkanlar (en fazla MAX_HIGHLIGHTS), gruplu ve mekânın türüne göre (kahvaltıcıda kahvaltı, kafede laptop…).
 * Değerler veritabanında Türkçe saklanır. Seçili ama bu türün listesinde olmayan (eski) etiket de gösterilir.
 */
export function HighlightPicker({
  value,
  onChange,
  segment,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  segment?: Segment;
}) {
  const { t } = useTranslation();
  const groups = highlightsFor(segment);
  const listed = new Set<string>(groups.flatMap((g) => g.values));
  const extra = value.filter((v) => !listed.has(v));
  const toggle = (h: string) =>
    onChange(value.includes(h) ? value.filter((x) => x !== h) : value.length < MAX_HIGHLIGHTS ? [...value, h] : value);
  return (
    <View style={styles.groups}>
      {groups.map(({ group, values }) => (
        <View key={group} style={styles.group}>
          <Text variant="caption" color={colors.textSecondary} style={styles.groupTitle}>
            {t(`highlightGroups.${group}`)}
          </Text>
          <View style={styles.chips}>
            {values.map((h) => (
              <Chip key={h} label={highlightLabel(h)} active={value.includes(h)} onPress={() => toggle(h)} />
            ))}
          </View>
        </View>
      ))}
      {extra.length > 0 && (
        <View style={styles.chips}>
          {extra.map((h) => (
            <Chip key={h} label={highlightLabel(h)} active onPress={() => toggle(h)} />
          ))}
        </View>
      )}
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
  groups: {
    gap: spacing.lg,
  },
  group: {
    gap: spacing.sm,
  },
  groupTitle: {
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
});
