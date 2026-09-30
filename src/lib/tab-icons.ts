import { renderToImageAsync } from 'expo-font';
import { useEffect, useState } from 'react';
import { Platform, type ImageSourcePropType } from 'react-native';

import { ANDROID_SYMBOLS } from '@/constants/android-symbols';
import { SYMBOL_GLYPHS } from '@/constants/symbol-glyphs';

type Icon = Promise<ImageSourcePropType | null>;

const cache = new Map<string, Icon>();

/** Gömülü ikon yazı tipinden (components/symbol) sekme ikonu görseli; renk sistemden (şablon) */
function render(sf: string, filled: boolean): Icon {
  const key = `${sf}:${filled}`;
  let icon = cache.get(key);
  if (!icon) {
    const glyph = SYMBOL_GLYPHS[ANDROID_SYMBOLS[sf] ?? ''];
    icon =
      glyph === undefined
        ? Promise.resolve(null)
        : renderToImageAsync(String.fromCodePoint(glyph), {
            fontFamily: filled ? 'PuanlaSymbolsFill' : 'PuanlaSymbols',
            size: 24,
            lineHeight: 24,
            color: 'white',
          }).catch(() => null);
    cache.set(key, icon);
  }
  return icon;
}

/**
 * Android alt çubuğu ikonu (Material 3 alışkanlığı): seçili sekme dolu, diğerleri çizgi ikon; uygulamanın
 * geri kalanıyla aynı yuvarlak Material Symbols. Aynı sonuç her çizimde aynı Promise (sekme ikonu yeniden yüklenmez).
 */
export const androidTabIcon = (sf: string) => ({
  default: render(sf, false),
  selected: SELECTED_OVERRIDES[sf] ?? render(sf, true),
});

/**
 * Material'ın dolu hâli iOS'takinden farklı olan simgeler için çizilmiş görsel. Harita: Material'da orta panel boş;
 * iOS'taki `map.fill` gibi üç panel dolu, yalnızca kıvrımlar açık (`assets/images/tabs`, şablon: renk sistemden).
 */
const SELECTED_OVERRIDES: Record<string, Icon> = {
  map: Promise.resolve(require('../../assets/images/tabs/map-fill.png')),
};

/** Alt çubuktaki sekmelerin SF adları (`app/(tabs)/_layout`) */
export const TAB_SYMBOLS = ['house', 'magnifyingglass', 'map', 'bookmark', 'person'] as const;

/**
 * Android: sekme ikonları çizilene kadar açılış ekranı kalsın (yoksa alt çubuk ilk saniyede ikonsuz görünür).
 * Diğer platformlarda hemen hazır.
 */
export function useTabIconsReady() {
  const [ready, setReady] = useState(Platform.OS !== 'android');
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let active = true;
    Promise.all(TAB_SYMBOLS.flatMap((sf) => Object.values(androidTabIcon(sf)))).finally(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);
  return ready;
}
