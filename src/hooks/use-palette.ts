import { Platform, useColorScheme } from 'react-native';

import { palettes, type Palette, type Scheme } from '@/constants/theme';

/** `colors` yalnızca iOS'ta görünüme uyar (DynamicColorIOS); Android ve web açık görünümde */
const followsScheme = Platform.OS === 'ios';

/** O anki görünüm (sistem ya da Ayarlar → Görünüm); bilinmiyorsa açık */
export function useScheme(): Scheme {
  const scheme = useColorScheme();
  return followsScheme && scheme === 'dark' ? 'dark' : 'light';
}

/**
 * O anki paletin düz renk değerleri. Yalnızca `colors`'ın dinamik değerlerini kabul etmeyen yerler için
 * (SVG, gezinme teması, degrade); gerisi `colors` ile kendiliğinden uyum sağlar.
 */
export function usePalette(): Palette {
  return palettes[useScheme()];
}
