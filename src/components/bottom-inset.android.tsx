import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Kaydırılan içeriğin sonundaki boşluk. Android kenardan kenara çizer ve pencere klavyeyle küçülmez
 * (`KeyboardProvider`): boşluk yoksa son satırlar gezinme çubuğunun (3 tuşlu gezinmede 48 dp) ya da açık klavyenin
 * altında kalır. Yükseklik klavye açıkken klavye kadar, kapalıyken gezinme çubuğu kadar.
 * ScrollView'da son çocuk, FlatList'te `ListFooterComponent`'in sonu olarak kullanılır.
 * `keyboardOnly`: alt çubuklu sekme ekranları (gezinme çubuğunu sekme çubuğu karşılar).
 */
export function BottomInsetSpacer({ keyboardOnly = false }: { keyboardOnly?: boolean }) {
  const { bottom } = useSafeAreaInsets();
  const keyboard = useAnimatedKeyboard();
  const resting = keyboardOnly ? 0 : bottom;
  const style = useAnimatedStyle(() => ({ height: Math.max(keyboard.height.value, resting) }));
  return <Animated.View style={style} />;
}
