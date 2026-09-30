import { SymbolView } from 'expo-symbols';

import type { IconProps } from '@/components/icon';

export type { AppSymbol } from '@/constants/icons';

/** iOS: sistemin SF Symbols ikonu. Diğer platformlar: icon.tsx (Material Icons) */
export function Icon({ name, size, tintColor, weight, style, accessibilityLabel }: IconProps) {
  return (
    <SymbolView
      name={name}
      size={size}
      tintColor={tintColor}
      weight={weight}
      style={style}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
