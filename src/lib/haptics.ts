import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** Hafif haptik geri bildirim yardımcıları. Web'de ve ayarlardan kapatılınca sessizdir. */

const supported = Platform.OS === 'ios' || Platform.OS === 'android';
let enabled = true;

/** Ayarlar ekranındaki "Titreşim" tercihi */
export const setHapticsEnabled = (value: boolean) => {
  enabled = value;
};

const run = (fn: () => Promise<void>) => {
  if (supported && enabled) fn().catch(() => {});
};

export const haptics = {
  tap: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  select: () => run(() => Haptics.selectionAsync()),
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};
