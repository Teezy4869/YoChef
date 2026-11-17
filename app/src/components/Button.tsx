import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps } from 'react-native';

import { colors, radius, shadows, spacing, touchTarget, typography } from '@/theme/tokens';

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
        variant === 'primary' && !inactive ? shadows.subtle : null,
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
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullWidth: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center' },
  label: { ...typography.label, fontSize: 16, fontWeight: '700' },
  primary: { backgroundColor: colors.primary },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.subtle,
  },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: colors.danger },
  inactive: { opacity: 0.55 },
});

const pressedStyle = StyleSheet.create({
  primary: { backgroundColor: colors.primaryPressed, transform: [{ scale: 0.985 }] },
  secondary: { backgroundColor: colors.surfaceMuted, transform: [{ scale: 0.985 }] },
  ghost: { backgroundColor: colors.primarySoft },
  danger: { opacity: 0.85, transform: [{ scale: 0.985 }] },
});
