import { Host, Toggle as SwiftToggle } from '@expo/ui/swift-ui';
import { disabled as disabledModifier, labelsHidden, tint } from '@expo/ui/swift-ui/modifiers';

import { usePalette } from '@/hooks/use-palette';

type Props = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
};

/**
 * iOS'un kendi anahtarı (SwiftUI Toggle). iOS 26'nın yeni anahtar boyutunu kendisi ölçer; RN `Switch`'i
 * satırda yukarı kayıyordu. Diğer platformlar: toggle.tsx
 */
export function Toggle({ value, onValueChange, disabled }: Props) {
  const palette = usePalette();
  return (
    <Host matchContents>
      <SwiftToggle
        isOn={value}
        onIsOnChange={onValueChange}
        modifiers={[labelsHidden(), tint(palette.toggle), disabledModifier(!!disabled)]}
      />
    </Host>
  );
}
