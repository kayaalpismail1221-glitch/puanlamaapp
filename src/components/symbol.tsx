import type { SFSymbol, SymbolViewProps, SymbolWeight } from 'expo-symbols';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ANDROID_SYMBOLS, isFilledSymbol } from '@/constants/android-symbols';
import { SYMBOL_GLYPHS } from '@/constants/symbol-glyphs';
import { colors } from '@/constants/theme';

export type { SFSymbol, SymbolViewProps };

/** Kök düzende yüklenen ikon yazı tipleri (Android'de ayrıca uygulamaya gömülü: app.json → expo-font) */
export const SYMBOL_FONTS = {
  PuanlaSymbols: require('../../assets/fonts/PuanlaSymbols.ttf'),
  PuanlaSymbolsFill: require('../../assets/fonts/PuanlaSymbolsFill.ttf'),
  PuanlaSymbolsBold: require('../../assets/fonts/PuanlaSymbolsBold.ttf'),
  PuanlaSymbolsBoldFill: require('../../assets/fonts/PuanlaSymbolsBoldFill.ttf'),
};

const BOLD: readonly SymbolWeight[] = ['semibold', 'bold', 'heavy', 'black'];

/**
 * SF Symbols'ın karşılığı olan boşluk payı: SF ikonu kutusunu tam doldurur, Material Symbols 24'lük ızgarada
 * 2 birim iç boşlukla çizilir. Aynı `size` iki platformda aynı görsel büyüklükte dursun diye glif büyütülür.
 */
const GLYPH_SCALE = 1.16;

const warned = new Set<string>();

/**
 * Android ve web'de `SymbolView`: SF adı `constants/android-symbols` tablosuyla Material Symbols Rounded'a
 * çevrilir ve gömülü yazı tipinden çizilir (ilk karede hazır, yükleme boşluğu yok). iOS'ta `symbol.ios.tsx`
 * doğrudan SF Symbols kullanır. Aynı props'ları alır; iOS'a özgü olanlar (animasyon, palet) yok sayılır.
 */
export const SymbolView = memo(function SymbolView({
  name,
  size = 24,
  tintColor,
  colors: paletteColors,
  weight,
  style,
  fallback,
  type: _type,
  scale: _scale,
  resizeMode: _resizeMode,
  animationSpec: _animationSpec,
  ...rest
}: SymbolViewProps) {
  const sf = typeof name === 'string' ? name : name.ios;
  const material = typeof name === 'string' ? ANDROID_SYMBOLS[name] : (name.android ?? (sf && ANDROID_SYMBOLS[sf]));
  const glyph = material ? SYMBOL_GLYPHS[material] : undefined;

  if (glyph === undefined) {
    if (__DEV__ && !warned.has(String(sf ?? material))) {
      warned.add(String(sf ?? material));
      console.warn(`[symbol] Android karşılığı yok: ${sf ?? material} → constants/android-symbols.ts`);
    }
    return fallback ? <>{fallback}</> : <View style={[{ width: size, height: size }, style]} {...rest} />;
  }

  const platformWeight = typeof weight === 'object' ? weight.ios : weight;
  const bold = platformWeight !== undefined && BOLD.includes(platformWeight);
  const filled = sf !== undefined && isFilledSymbol(sf);
  const fontFamily = `PuanlaSymbols${bold ? 'Bold' : ''}${filled ? 'Fill' : ''}`;
  const color = tintColor ?? (Array.isArray(paletteColors) ? paletteColors[0] : paletteColors) ?? colors.text;
  const glyphSize = Math.round(size * GLYPH_SCALE);
  const offset = (size - glyphSize) / 2;

  return (
    <View
      style={[{ width: size, height: size }, style]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      {...rest}>
      <Text
        allowFontScaling={false}
        style={[
          styles.glyph,
          { fontFamily, color, fontSize: glyphSize, lineHeight: glyphSize, width: glyphSize, height: glyphSize, left: offset, top: offset },
        ]}>
        {String.fromCodePoint(glyph)}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  glyph: {
    position: 'absolute',
    textAlign: 'center',
    includeFontPadding: false,
    textAlignVertical: 'center',
    fontWeight: 'normal',
    fontStyle: 'normal',
  },
});
