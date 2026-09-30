import { Host, Switch } from '@expo/ui/jetpack-compose';

import { fixed } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { haptics } from '@/lib/haptics';

type Props = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
};

/**
 * Android'in kendi anahtarı (Material 3 Switch, Jetpack Compose): açıkken marka laciverti, kapalıyken
 * ince çerçeveli açık zemin. iOS: toggle.ios.tsx (SwiftUI), web: toggle.tsx
 */
export function Toggle({ value, onValueChange, disabled }: Props) {
  const palette = usePalette();
  return (
    <Host matchContents>
      <Switch
        value={value}
        enabled={!disabled}
        onCheckedChange={(next) => {
          haptics.select();
          onValueChange(next);
        }}
        colors={{
          checkedTrackColor: palette.toggle,
          checkedThumbColor: fixed.white,
          checkedBorderColor: palette.toggle,
          uncheckedTrackColor: palette.fill,
          uncheckedThumbColor: palette.textTertiary,
          uncheckedBorderColor: palette.border,
        }}
      />
    </Host>
  );
}
