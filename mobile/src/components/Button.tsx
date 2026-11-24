import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps } from 'react-native';

import { triggerHaptic } from '@/lib/haptics';
import { colors, radius, spacing, touchTarget, typography } from '@/theme/tokens';

import { AppIcon, type IconName } from './AppIcon';
import { AppText } from './AppText';

type Variant = 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger';
type Size = 'md' | 'sm';

export type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  title: string;
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  rightIcon?: IconName;
  haptic?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
};

export function Button({
  title,
  variant = 'primary',
  size = 'md',
  icon,
  rightIcon,
  haptic = true,
  loading = false,
  disabled,
  fullWidth = true,
  onPress,
  ...rest
}: ButtonProps) {
  const inactive = disabled || loading;
  const textTone =
    variant === 'primary' || variant === 'danger'
      ? 'onPrimary'
      : variant === 'ghost' || variant === 'soft'
        ? 'primary'
        : 'default';
  const iconSize = size === 'sm' ? 16 : 18;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!inactive, busy: loading }}
      disabled={inactive}
      hitSlop={4}
      onPress={(e) => {
        if (haptic) triggerHaptic('light');
        onPress?.(e);
      }}
      {...rest}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' ? styles.sm : null,
        styles[variant],
        pressed && !inactive ? pressedStyle[variant] : null,
        pressed && !inactive ? styles.pressedScale : null,
        inactive ? styles.inactive : null,
        fullWidth ? styles.fullWidth : null,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator
            testID="button-spinner"
            color={textTone === 'onPrimary' ? colors.textOnPrimary : colors.primary}
          />
        ) : (
          <>
            {icon ? <AppIcon name={icon} size={iconSize} tone={textTone} /> : null}
            <AppText tone={textTone} style={[styles.label, size === 'sm' ? styles.labelSm : null]}>
              {title}
            </AppText>
            {rightIcon ? <AppIcon name={rightIcon} size={iconSize} tone={textTone} /> : null}
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sm: {
    minHeight: touchTarget - 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
  },
  fullWidth: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  label: { ...typography.label, fontSize: 15 },
  labelSm: { fontSize: 13 },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong },
  soft: { backgroundColor: colors.primarySoft },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: colors.danger },
  pressedScale: { transform: [{ scale: 0.985 }] },
  inactive: { opacity: 0.52 },
});

const pressedStyle = StyleSheet.create({
  primary: { backgroundColor: colors.primaryPressed },
  secondary: { backgroundColor: colors.surfaceMuted },
  soft: { backgroundColor: '#F6D7C5' },
  ghost: { backgroundColor: colors.primarySoft },
  danger: { opacity: 0.86 },
});
