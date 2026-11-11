import { useState, type ComponentProps } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { colors, radius, spacing, touchTarget, typography } from '@/theme/tokens';

import { AppText } from './AppText';

// React 19: ref is an ordinary prop, carried by ComponentProps<typeof TextInput>.
export type TextFieldProps = ComponentProps<typeof TextInput> & {
  label: string;
  error?: string | null;
  hint?: string;
};

export function TextField({ label, error, hint, multiline, onFocus, onBlur, style, ref, ...rest }: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrapper}>
      <AppText variant="label" style={styles.label}>
        {label}
      </AppText>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...rest}
        style={[
          styles.input,
          multiline ? styles.multiline : null,
          focused ? styles.focused : null,
          error ? styles.invalid : null,
          style,
        ]}
      />
      {error ? (
        <AppText variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" tone="muted">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs, alignSelf: 'stretch' },
  label: { color: colors.text },
  input: {
    ...typography.body,
    minHeight: touchTarget,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
  },
  multiline: { minHeight: 112, textAlignVertical: 'top' },
  focused: { borderColor: colors.primary },
  invalid: { borderColor: colors.danger },
});
