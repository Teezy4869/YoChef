import { Text, type TextProps } from "react-native";

import { colors, typography, type TextVariant } from "@/theme/tokens";

type Tone =
  | "default"
  | "muted"
  | "primary"
  | "danger"
  | "success"
  | "warning"
  | "info"
  | "onPrimary";

const toneColor: Record<Tone, string> = {
  default: colors.text,
  muted: colors.textMuted,
  primary: colors.primary,
  danger: colors.danger,
  success: colors.success,
  warning: colors.warning,
  info: colors.info,
  onPrimary: colors.textOnPrimary,
};

export type AppTextProps = TextProps & {
  variant?: TextVariant;
  tone?: Tone;
  align?: "auto" | "left" | "center" | "right";
  tabularNums?: boolean;
};

export function AppText({
  variant = "body",
  tone = "default",
  align,
  tabularNums = false,
  style,
  ...rest
}: AppTextProps) {
  const role =
    variant === "display" || variant === "title" || variant === "heading"
      ? "header"
      : undefined;
  return (
    <Text
      accessibilityRole={role}
      {...rest}
      style={[
        typography[variant],
        { color: toneColor[tone] },
        align ? { textAlign: align } : null,
        tabularNums ? { fontVariant: ["tabular-nums"] } : null,
        style,
      ]}
    />
  );
}
