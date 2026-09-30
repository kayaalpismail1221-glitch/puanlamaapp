import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Hafif haptik geri bildirim yardımcıları. Web'de ve ayarlardan kapatılınca sessizdir.
 * Android'de titreşim motoru yerine sistemin dokunma geri bildirimi (`performHapticFeedback`): izin istemez,
 * cihazın kendi "tık" hissini kullanır ve kullanıcının sistem titreşim ayarına uyar. iOS'ta Taptic Engine.
 */

const supported = Platform.OS === 'ios' || Platform.OS === 'android';
const android = Platform.OS === 'android';
let enabled = true;

/** Ayarlar ekranındaki "Titreşim" tercihi */
export const setHapticsEnabled = (value: boolean) => {
  enabled = value;
};

const run = (fn: () => Promise<void>) => {
  if (supported && enabled) fn().catch(() => {});
};

const androidHaptic = (type: Haptics.AndroidHaptics) => () => Haptics.performAndroidHapticsAsync(type);

export const haptics = {
  tap: () =>
    run(android ? androidHaptic(Haptics.AndroidHaptics.Virtual_Key) : () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  select: () => run(android ? androidHaptic(Haptics.AndroidHaptics.Segment_Tick) : () => Haptics.selectionAsync()),
  success: () =>
    run(
      android
        ? androidHaptic(Haptics.AndroidHaptics.Confirm)
        : () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    ),
  warning: () =>
    run(
      android
        ? androidHaptic(Haptics.AndroidHaptics.Reject)
        : () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
    ),
};
