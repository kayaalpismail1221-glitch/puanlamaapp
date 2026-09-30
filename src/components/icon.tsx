import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { SymbolWeight } from 'expo-symbols';
import { StyleSheet, View, type ColorValue, type StyleProp, type ViewStyle } from 'react-native';

import { ANDROID_ICONS, type AppSymbol } from '@/constants/icons';

export type { AppSymbol } from '@/constants/icons';

// Font açılışta yüklensin: harita pinleri ilk çizimde bitmap'e çevrildiğinden ikon o ana kadar hazır olmalı
MaterialIcons.loadFont().catch(() => {});

export type IconProps = {
  /** SF Symbol adı; Android'de `constants/icons.ts` eşlemesindeki Material ikonu çizilir */
  name: AppSymbol;
  size?: number;
  tintColor?: ColorValue;
  /** Yalnızca iOS (Material Icons tek ağırlıklı) */
  weight?: SymbolWeight;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/**
 * Android ve web: Material Icons. SF Symbols Android'de çizilemediği için her ikonun karşılığı
 * `ANDROID_ICONS`'ta. Kutu, iOS'taki SymbolView gibi `size × size`; böylece yerleşim iki platformda aynı kalır.
 * iOS: icon.ios.tsx
 */
export function Icon({ name, size = 24, tintColor, style, accessibilityLabel }: IconProps) {
  return (
    <View
      style={[styles.box, { width: size, height: size }, style]}
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}>
      <MaterialIcons name={ANDROID_ICONS[name]} size={size} color={tintColor} style={{ lineHeight: size }} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
