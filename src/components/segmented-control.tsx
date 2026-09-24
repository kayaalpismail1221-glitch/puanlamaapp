import type { StyleProp, ViewStyle } from 'react-native';

import { SegmentTabs } from '@/components/segment-tabs';

type Props<T extends string> = {
  options: readonly { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * iOS dışındaki platformlarda alt çizgili sekmeler.
 * iOS'ta SwiftUI segmented kontrolü kullanılır (segmented-control.ios.tsx); SwiftUI modülü
 * diğer platformlarda yüklenemediği için dosya ayrı.
 */
export function SegmentedControl<T extends string>({ options, value, onChange }: Props<T>) {
  return <SegmentTabs tabs={options} value={value} onChange={onChange} />;
}
