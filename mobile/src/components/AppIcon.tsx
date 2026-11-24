import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import type { StyleProp, TextStyle } from 'react-native';

import { colors } from '@/theme/tokens';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export type IconTone = 'default' | 'muted' | 'primary' | 'danger' | 'success' | 'warning' | 'info' | 'star' | 'onPrimary';

const TONE_COLOR: Record<IconTone, string> = {
  default: colors.text,
  muted: colors.textMuted,
  primary: colors.primary,
  danger: colors.danger,
  success: colors.success,
  warning: colors.warning,
  info: colors.info,
  star: colors.star,
  onPrimary: colors.textOnPrimary,
};

export type AppIconProps = {
  name: IconName;
  size?: number;
  tone?: IconTone;
  color?: string;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<TextStyle>;
};

export function AppIcon({ name, size = 20, tone = 'default', color, accessibilityLabel, testID, style }: AppIconProps) {
  return (
    <Ionicons
      name={name}
      size={size}
      color={color ?? TONE_COLOR[tone]}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={style}
    />
  );
}
