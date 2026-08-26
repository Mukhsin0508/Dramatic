import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

function nativeOnly(action: () => Promise<void>) {
  if (Platform.OS !== 'web') void action().catch(() => undefined);
}

export const haptics = {
  selection: () => nativeOnly(Haptics.selectionAsync),
  success: () => nativeOnly(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => nativeOnly(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  light: () => nativeOnly(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
};
