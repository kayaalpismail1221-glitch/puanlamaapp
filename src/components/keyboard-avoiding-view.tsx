import { KeyboardAvoidingView as NativeKeyboardAvoidingView, Platform } from 'react-native';
import { KeyboardAvoidingView as ControllerKeyboardAvoidingView } from 'react-native-keyboard-controller';

/**
 * Klavye açılınca içeriği yukarı iten kap (`behavior="padding"` ile kullanılır).
 * iOS: React Native'in kendisi (doğrulanmış davranış). Android: uygulama kenardan kenara çizildiği için
 * sistem pencereyi klavyeye göre küçültmüyor; react-native-keyboard-controller'ınki klavyeyi kare kare izler.
 */
export const KeyboardAvoidingView = (
  Platform.OS === 'ios' ? NativeKeyboardAvoidingView : ControllerKeyboardAvoidingView
) as typeof NativeKeyboardAvoidingView;
