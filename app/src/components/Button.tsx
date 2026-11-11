import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps } from 'react-native';

import { colors, radius, spacing, touchTarget, typography } from '@/theme/tokens';

import { AppText } from './AppText';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  title: string;
  variant?: Variant;
  loading?: boolean;
  fullWidth?: boolean;
};

export function Button({ title, variant = 'primary', loading = false, disabled, fullWidth = true, ...rest }: ButtonProps) {
  const inactive = disabled || loading;
  const textTone = variant === 'primary' || variant === 'danger' ? 'onPrimary' : variant === 'ghost' ? 'primary' : 'default';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!inactive, busy: loading }}
      disabled={inactive}
      hitSlop={4}
      {...rest}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && !inactive ? pressedStyle[variant] : null,
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
          <AppText tone={textTone} style={styles.label}>
            {title}
          </AppText>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullWidth: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center' },
  label: { ...typography.label, fontSize: 16 },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: colors.danger },
  inactive: { opacity: 0.55 },
});

const pressedStyle = StyleSheet.create({
  primary: { backgroundColor: colors.primaryPressed },
  secondary: { backgroundColor: colors.surfaceMuted },
  ghost: { backgroundColor: colors.primarySoft },
  danger: { opacity: 0.85 },
});
