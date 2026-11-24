import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export type HapticKind = 'light' | 'medium' | 'success' | 'warning';

/** Triggers subtle native tactile feedback; safely no-ops on web and unsupported devices. */
export function triggerHaptic(kind: HapticKind = 'light'): void {
  if (Platform.OS === 'web') return;
  try {
    if (kind === 'success') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (kind === 'warning') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else if (kind === 'medium') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  } catch {
    // Ignore on platforms/simulators without a haptic engine.
  }
}
