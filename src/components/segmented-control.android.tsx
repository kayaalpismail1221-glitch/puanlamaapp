import { Host, SegmentedButton, SingleChoiceSegmentedButtonRow, Text as ComposeText } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { spacing } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { haptics } from '@/lib/haptics';

type Props<T extends string> = {
  options: readonly { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * Android'in kendi segment düğmeleri (Material 3 SegmentedButton, Jetpack Compose): hap biçimli çerçeve, seçili
 * bölüm lacivert tonlu zemin ve onay işaretiyle. iOS: segmented-control.ios.tsx (SwiftUI), web: segmented-control.tsx
 */
export function SegmentedControl<T extends string>({ options, value, onChange, style }: Props<T>) {
  const palette = usePalette();
  const colors = {
    activeContainerColor: palette.navIndicator,
    activeContentColor: palette.primary,
    activeBorderColor: palette.border,
    inactiveContainerColor: palette.background,
    inactiveContentColor: palette.textSecondary,
    inactiveBorderColor: palette.border,
  };
  return (
    <View style={[styles.wrap, style]}>
      <Host matchContents={{ vertical: true }} style={styles.host}>
        <SingleChoiceSegmentedButtonRow modifiers={[fillMaxWidth()]}>
          {options.map((o) => (
            <SegmentedButton
              key={o.key}
              selected={o.key === value}
              onClick={() => {
                if (o.key === value) return;
                haptics.select();
                onChange(o.key);
              }}
              colors={colors}>
              <SegmentedButton.Label>
                <ComposeText maxLines={1} style={{ typography: 'labelLarge', fontWeight: o.key === value ? '600' : '500' }}>
                  {o.label}
                </ComposeText>
              </SegmentedButton.Label>
            </SegmentedButton>
          ))}
        </SingleChoiceSegmentedButtonRow>
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
  },
  host: {
    alignSelf: 'stretch',
  },
});
