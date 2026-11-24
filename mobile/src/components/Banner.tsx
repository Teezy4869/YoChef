import { StyleSheet, View } from "react-native";

import { colors, radius, spacing } from "@/theme/tokens";

import { AppIcon, type IconName } from "./AppIcon";
import { AppText } from "./AppText";

type Tone = "error" | "success" | "info";

const palette: Record<
  Tone,
  {
    bg: string;
    border: string;
    text: "danger" | "success" | "default";
    icon: IconName;
    iconTone: "danger" | "success" | "info";
  }
> = {
  error: {
    bg: colors.dangerSoft,
    border: colors.danger,
    text: "danger",
    icon: "alert-circle",
    iconTone: "danger",
  },
  success: {
    bg: colors.successSoft,
    border: colors.success,
    text: "success",
    icon: "checkmark-circle",
    iconTone: "success",
  },
  info: {
    bg: colors.infoSoft,
    border: colors.info,
    text: "default",
    icon: "information-circle",
    iconTone: "info",
  },
};

export function Banner({
  tone,
  message,
  testID,
}: {
  tone: Tone;
  message: string;
  testID?: string;
}) {
  const p = palette[tone];
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole={tone === "error" ? "alert" : undefined}
      accessibilityLiveRegion="polite"
      style={[styles.box, { backgroundColor: p.bg, borderColor: p.border }]}
    >
      <AppIcon name={p.icon} size={18} tone={p.iconTone} style={styles.icon} />
      <AppText tone={p.text} style={styles.text}>
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    alignSelf: "stretch",
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: radius.md,
    borderCurve: "continuous",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  icon: {
    marginTop: 2,
  },
  text: {
    flex: 1,
  },
});
