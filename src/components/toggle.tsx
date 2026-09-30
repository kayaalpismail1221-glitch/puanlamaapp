import { Switch } from 'react-native';

import { usePalette } from '@/hooks/use-palette';

type Props = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
};

/** Açma/kapama anahtarı; iOS'ta SwiftUI (toggle.ios.tsx) */
export function Toggle({ value, onValueChange, disabled }: Props) {
  const palette = usePalette();
  return <Switch value={value} onValueChange={onValueChange} disabled={disabled} trackColor={{ true: palette.toggle }} />;
}
