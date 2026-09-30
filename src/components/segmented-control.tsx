import { View, type StyleProp, type ViewStyle } from 'react-native';

import { SegmentTabs } from '@/components/segment-tabs';

type Props<T extends string> = {
  options: readonly { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * Web'de alt çizgili sekmeler. iOS'ta SwiftUI segmented kontrolü (segmented-control.ios.tsx), Android'de
 * Material 3 segment düğmeleri (segmented-control.android.tsx); yerel modüller web'de yüklenemediği için dosyalar ayrı.
 */
export function SegmentedControl<T extends string>({ options, value, onChange, style }: Props<T>) {
  return (
    <View style={style}>
      <SegmentTabs tabs={options} value={value} onChange={onChange} />
    </View>
  );
}
