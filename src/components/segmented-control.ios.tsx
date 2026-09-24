import { Host, Picker, Text as SwiftText } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, spacing } from '@/constants/theme';
import { haptics } from '@/lib/haptics';

type Props<T extends string> = {
  options: readonly { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * iOS'un kendi segmented kontrolü (SwiftUI). iOS 26'da sistem Liquid Glass
 * görünümünü kendiliğinden alır. Diğer platformlar: segmented-control.tsx
 */
export function SegmentedControl<T extends string>({ options, value, onChange, style }: Props<T>) {
  return (
    <View style={[styles.wrap, style]}>
      <Host matchContents={{ vertical: true }} seedColor={colors.primary} style={styles.host}>
        <Picker
          selection={value}
          onSelectionChange={(next: T) => {
            haptics.select();
            onChange(next);
          }}
          modifiers={[pickerStyle('segmented')]}>
          {options.map((o) => (
            <SwiftText key={o.key} modifiers={[tag(o.key)]}>
              {o.label}
            </SwiftText>
          ))}
        </Picker>
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
