import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** Hafif haptik geri bildirim yardımcıları. Web'de sessizce hiçbir şey yapmaz. */

const enabled = Platform.OS === 'ios' || Platform.OS === 'android';

export const haptics = {
  tap: () => enabled && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  select: () => enabled && Haptics.selectionAsync(),
  success: () => enabled && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  warning: () => enabled && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
};
