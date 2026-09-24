import { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing } from '@/constants/theme';

/**
 * Alttan açılan sayfalarda (modal) sabit alt butonu klavyenin hemen üstünde tutar.
 * Sayfanın alt kenarı ekranın altıyla aynı olduğundan klavye yüksekliği kadar dolgu yeterli;
 * KeyboardAvoidingView'ın sabit `keyboardVerticalOffset` değeri modal içinde şaşıp butonu klavyenin altında bırakıyordu.
 */
export function useKeyboardFooterStyle() {
  const insets = useSafeAreaInsets();
  const keyboard = useAnimatedKeyboard();
  const resting = Math.max(insets.bottom, spacing.lg);
  return useAnimatedStyle(() => ({
    paddingBottom: Math.max(keyboard.height.value + spacing.md, resting),
  }));
}
