import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Hafif haptik geri bildirim yardımcıları. Web'de ve ayarlardan kapatılınca sessizdir.
 * Android'de titreşim motoru yerine sistemin dokunma geri bildirimi (performHapticFeedback) kullanılır:
 * iOS'taki gibi kısa ve yumuşak, cihazın "dokunma titreşimi" ayarına uyar. Bazı türler Android 11+/12+ ister;
 * eski sürümde titreşimli karşılığına düşülür.
 */

const supported = Platform.OS === 'ios' || Platform.OS === 'android';
let enabled = true;

/** Ayarlar ekranındaki "Titreşim" tercihi */
export const setHapticsEnabled = (value: boolean) => {
  enabled = value;
};

const run = (ios: () => Promise<void>, android: Haptics.AndroidHaptics) => {
  if (!supported || !enabled) return;
  const effect = Platform.OS === 'android' ? Haptics.performAndroidHapticsAsync(android).catch(ios) : ios();
  effect.catch(() => {});
};

export const haptics = {
  tap: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), Haptics.AndroidHaptics.Virtual_Key),
  select: () => run(() => Haptics.selectionAsync(), Haptics.AndroidHaptics.Segment_Tick),
  success: () =>
    run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), Haptics.AndroidHaptics.Confirm),
  warning: () =>
    run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning), Haptics.AndroidHaptics.Reject),
};
