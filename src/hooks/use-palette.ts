import { useColorScheme } from 'react-native';

import { darkModeSupported, palettes, type Palette, type Scheme } from '@/constants/theme';

/** iOS ve Android kendi derlememizde görünüme uyar; web (ve Android'de Expo Go) açık görünümde */
const followsScheme = darkModeSupported;

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
