import { useState, type ComponentProps, type ReactNode } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import {
  colors,
  radius,
  spacing,
  touchTarget,
  typography,
} from "@/theme/tokens";

import { AppIcon, type IconName } from "./AppIcon";
import { AppText } from "./AppText";

// React 19: ref is an ordinary prop, carried by ComponentProps<typeof TextInput>.
export type TextFieldProps = ComponentProps<typeof TextInput> & {
  label: string;
  error?: string | null;
  hint?: string;
  leftIcon?: IconName;
  rightAccessory?: ReactNode;
};

export function TextField({
  label,
  error,
  hint,
  multiline,
  secureTextEntry,
  leftIcon,
  rightAccessory,
  onFocus,
  onBlur,
  style,
  ref,
  ...rest
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const isPassword = Boolean(secureTextEntry);

  return (
    <View style={styles.wrapper}>
      <AppText variant="label" style={styles.label}>
        {label}
      </AppText>
      <View
        style={[
          styles.fieldBox,
          multiline ? styles.multilineBox : null,
          focused ? styles.focused : null,
          error ? styles.invalid : null,
        ]}
      >
        {leftIcon ? (
          <View style={styles.leftIcon}>
            <AppIcon
              name={leftIcon}
              size={18}
              tone={focused ? "primary" : "muted"}
            />
          </View>
        ) : null}
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityHint={hint}
          placeholderTextColor={colors.textMuted}
          multiline={multiline}
          secureTextEntry={isPassword && !revealed}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
          style={[styles.input, multiline ? styles.multiline : null, style]}
        />
        {isPassword ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            onPress={() => setRevealed((v) => !v)}
            hitSlop={6}
            style={styles.toggleBtn}
          >
            <AppIcon
              name={revealed ? "eye-off-outline" : "eye-outline"}
              size={20}
              tone="muted"
            />
          </Pressable>
        ) : rightAccessory ? (
          <View style={styles.rightAccessory}>{rightAccessory}</View>
        ) : null}
      </View>
      {error ? (
        <AppText
          variant="caption"
          tone="danger"
          accessibilityLiveRegion="polite"
        >
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
  wrapper: { gap: spacing.xs, alignSelf: "stretch" },
  label: { color: colors.text },
  fieldBox: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: touchTarget,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderCurve: "continuous",
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  multilineBox: {
    alignItems: "flex-start",
    minHeight: 112,
    paddingVertical: spacing.sm,
  },
  leftIcon: {
    marginRight: spacing.sm,
  },
  input: {
    ...typography.body,
    flex: 1,
    paddingVertical: spacing.sm,
    color: colors.text,
  },
  multiline: {
    minHeight: 96,
    textAlignVertical: "top",
    paddingVertical: 0,
  },
  toggleBtn: {
    minWidth: 36,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.xs,
  },
  rightAccessory: {
    marginLeft: spacing.xs,
  },
  focused: { borderColor: colors.primary, borderWidth: 1.5 },
  invalid: { borderColor: colors.danger, borderWidth: 1.5 },
});
