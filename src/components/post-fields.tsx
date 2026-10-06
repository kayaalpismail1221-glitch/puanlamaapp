import { useState, type ReactNode } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, LinearTransition, ZoomIn, ZoomOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SymbolView, type SFSymbol } from '@/components/symbol';
import { Button, PressableScale, Text } from '@/components/ui';
import { colors, hitSlop, radius, spacing } from '@/constants/theme';
import { haptics } from '@/lib/haptics';
import { useTranslation } from 'react-i18next';

import { highlightLabel, highlightsFor, type HighlightGroup } from '@/lib/post-meta';
import type { Segment } from '@/types';

/** Gönderi oluşturma ve düzenleme ekranlarında ortak alanlar: bölüm başlığı ve öne çıkanlar (öğün sorulmaz, açıklamaya yazılır) */

export const MAX_HIGHLIGHTS = 3;

const GROUP_ICONS: Record<HighlightGroup, SFSymbol> = {
  food: 'fork.knife',
  service: 'hand.wave.fill',
  vibe: 'sparkles',
  occasion: 'person.2.fill',
  know: 'info.circle',
};

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

export function Chip({
  label,
  active,
  onPress,
  dimmed,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  /** Seçim sınırı dolu: seçilmemiş seçenek soluk */
  dimmed?: boolean;
}) {
  return (
    <PressableScale
      haptic={false}
      onPress={() => {
        haptics.select();
        onPress();
      }}
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && styles.chipActive, dimmed && styles.dimmed]}>
      {active && <SymbolView name="checkmark" tintColor={colors.onPrimary} size={13} weight="bold" />}
      <Text variant="subhead" color={active ? colors.onPrimary : colors.text}>
        {label}
      </Text>
    </PressableScale>
  );
}

/**
 * Öne çıkanlar (en fazla MAX_HIGHLIGHTS). Formda yalnızca seçilenler ve "Ekle" durur (form kısa kalsın); dokununca
 * alttan gruplu liste açılır, mekânın türüne göre (kahvaltıcıda kahvaltı, kafede laptop…). Seçim anında forma
 * yansır, "Bitti" ya da aşağı kaydırma kapatır. Değerler veritabanında Türkçe saklanır; listede olmayan (eski)
 * etiket formda seçili görünür ve kaldırılabilir.
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
  const [open, setOpen] = useState(false);
  const remove = (h: string) => {
    haptics.select();
    onChange(value.filter((x) => x !== h));
  };

  return (
    <>
      {value.length === 0 ? (
        <PressableScale onPress={() => setOpen(true)} scaleTo={0.98} accessibilityRole="button" style={styles.addCard}>
          <View style={styles.addIcon}>
            <SymbolView name="plus" tintColor={colors.onPrimary} size={16} weight="bold" />
          </View>
          <View style={styles.flex}>
            <Text variant="headline">{t('highlightPicker.add')}</Text>
            <Text variant="footnote" color={colors.textSecondary} numberOfLines={1}>
              {t('highlightPicker.addHint')}
            </Text>
          </View>
          <SymbolView name="chevron.right" tintColor={colors.textTertiary} size={14} weight="semibold" />
        </PressableScale>
      ) : (
        <Animated.View layout={LinearTransition} style={styles.chips}>
          {value.map((h) => (
            <Animated.View key={h} entering={ZoomIn.springify()} exiting={ZoomOut.duration(150)} layout={LinearTransition}>
              <PressableScale
                haptic={false}
                onPress={() => remove(h)}
                hitSlop={hitSlop}
                accessibilityLabel={t('highlightPicker.remove', { label: highlightLabel(h) })}
                style={[styles.chip, styles.chipActive]}>
                <Text variant="subhead" color={colors.onPrimary}>
                  {highlightLabel(h)}
                </Text>
                <SymbolView name="xmark" tintColor={colors.onPrimary} size={11} weight="bold" />
              </PressableScale>
            </Animated.View>
          ))}
          <Animated.View layout={LinearTransition}>
            <PressableScale onPress={() => setOpen(true)} accessibilityRole="button" style={[styles.chip, styles.addChip]}>
              <SymbolView
                name={value.length < MAX_HIGHLIGHTS ? 'plus' : 'pencil'}
                tintColor={colors.primary}
                size={13}
                weight="bold"
              />
              <Text variant="subhead" color={colors.primary} style={styles.bold}>
                {value.length < MAX_HIGHLIGHTS ? t('highlightPicker.addMore') : t('highlightPicker.edit')}
              </Text>
            </PressableScale>
          </Animated.View>
        </Animated.View>
      )}
      <HighlightSheet visible={open} onClose={() => setOpen(false)} value={value} onChange={onChange} segment={segment} />
    </>
  );
}

/** Alttan açılan seçim sayfası (iOS'ta sistem sayfası, aşağı kaydırınca kapanır; Android'de tam ekran) */
function HighlightSheet({
  visible,
  onClose,
  value,
  onChange,
  segment,
}: {
  visible: boolean;
  onClose: () => void;
  value: string[];
  onChange: (next: string[]) => void;
  segment?: Segment;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const groups = highlightsFor(segment);
  const full = value.length >= MAX_HIGHLIGHTS;

  const toggle = (h: string) => {
    if (value.includes(h)) return onChange(value.filter((x) => x !== h));
    if (full) return haptics.warning();
    onChange([...value, h]);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View
        style={[
          styles.sheet,
          // iOS'ta sayfa (pageSheet) durum çubuğunun altında açılır; Android'de tam ekran, üst boşluk bizden
          { paddingTop: Platform.OS === 'android' ? insets.top : 0 },
        ]}>
        <View style={styles.sheetHeader}>
          <View style={styles.flex}>
            <Text variant="title2">{t('highlightPicker.title')}</Text>
            <Text variant="subhead" color={colors.textSecondary}>
              {t('highlightPicker.subtitle', { max: MAX_HIGHLIGHTS })}
            </Text>
          </View>
          <PressableScale onPress={onClose} hitSlop={hitSlop} style={styles.close} accessibilityLabel={t('common.close')}>
            <SymbolView name="xmark" tintColor={colors.textSecondary} size={13} weight="bold" />
          </PressableScale>
        </View>

        {/* Kaç tane seçildiği: üç nokta dolar */}
        <View style={styles.counter}>
          {Array.from({ length: MAX_HIGHLIGHTS }, (_, i) => (
            <View key={i} style={[styles.dot, i < value.length && styles.dotOn]} />
          ))}
          <Text variant="footnote" color={full ? colors.text : colors.textSecondary} style={styles.bold}>
            {full ? t('highlightPicker.full', { max: MAX_HIGHLIGHTS }) : t('highlightPicker.selected', { count: value.length, max: MAX_HIGHLIGHTS })}
          </Text>
        </View>

        <ScrollView contentContainerStyle={styles.sheetList} showsVerticalScrollIndicator={false}>
          {groups.map(({ group, values }, i) => (
            <Animated.View key={group} entering={visible ? FadeIn.delay(40 * i) : undefined} style={styles.group}>
              <View style={styles.groupHeader}>
                <View style={styles.groupIcon}>
                  <SymbolView name={GROUP_ICONS[group]} tintColor={colors.primary} size={14} />
                </View>
                <Text variant="footnote" color={colors.textSecondary} style={styles.groupTitle}>
                  {t(`highlightGroups.${group}`)}
                </Text>
              </View>
              <View style={styles.chips}>
                {values.map((h) => {
                  const active = value.includes(h);
                  return (
                    <Chip
                      key={h}
                      label={highlightLabel(h)}
                      active={active}
                      dimmed={full && !active}
                      onPress={() => toggle(h)}
                    />
                  );
                })}
              </View>
            </Animated.View>
          ))}
        </ScrollView>

        <View style={[styles.sheetFooter, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <Button title={t('highlightPicker.done')} onPress={onClose} />
        </View>
      </View>
    </Modal>
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
  flex: {
    flex: 1,
    gap: 2,
  },
  bold: {
    fontWeight: '600',
  },
  dimmed: {
    opacity: 0.4,
  },
  section: {
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  addCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  addIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addChip: {
    gap: spacing.xs,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  sheet: {
    flex: 1,
    backgroundColor: colors.background,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  close: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.border,
  },
  dotOn: {
    backgroundColor: colors.primary,
  },
  sheetList: {
    padding: spacing.lg,
    gap: spacing.xl,
  },
  group: {
    gap: spacing.md,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  groupIcon: {
    width: 26,
    height: 26,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupTitle: {
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  sheetFooter: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
