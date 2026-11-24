import { Pressable, StyleSheet } from "react-native";

import { triggerHaptic } from "@/lib/haptics";
import { colors, radius, spacing, touchTarget } from "@/theme/tokens";

import { AppIcon, type IconName, type IconTone } from "./AppIcon";
import { AppText } from "./AppText";

export function Chip({
  label,
  selected,
  icon,
  iconTone = "primary",
  onPress,
}: {
  label: string;
  selected: boolean;
  icon?: IconName;
  iconTone?: IconTone;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={() => {
        triggerHaptic("light");
        onPress();
      }}
      hitSlop={4}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.selected : null,
        pressed ? styles.pressed : null,
      ]}
    >
      {icon ? (
        <AppIcon
          name={icon}
          size={15}
          tone={selected ? "onPrimary" : iconTone}
        />
      ) : null}
      <AppText variant="label" tone={selected ? "onPrimary" : "default"}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    flexShrink: 0,
    gap: spacing.xs,
    minHeight: touchTarget - 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  pressed: { opacity: 0.85 },
});
