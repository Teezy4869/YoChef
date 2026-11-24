import { StyleSheet, View } from "react-native";

import { colors, radius } from "@/theme/tokens";

import { AppIcon } from "./AppIcon";
import { AppImage } from "./AppImage";
import { AppText } from "./AppText";

export function initialsOf(
  name: string | null | undefined,
  fallback = "?",
): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return fallback;
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export function Avatar({
  uri,
  name,
  size = 88,
  showEditBadge = false,
}: {
  uri: string | null;
  name: string | null;
  size?: number;
  showEditBadge?: boolean;
}) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      {uri ? (
        <AppImage
          uri={uri}
          style={[styles.base, box]}
          accessibilityLabel="Ảnh đại diện"
          testID="avatar-image"
        />
      ) : (
        <View
          style={[styles.base, styles.placeholder, box]}
          accessible
          accessibilityLabel="Chưa có ảnh đại diện"
        >
          <AppText
            variant="title"
            tone="primary"
            style={{ fontSize: size * 0.36, lineHeight: size * 0.44 }}
          >
            {initialsOf(name)}
          </AppText>
        </View>
      )}
      {showEditBadge ? (
        <View style={styles.editBadge}>
          <AppIcon name="camera" size={14} tone="onPrimary" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative" },
  base: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
    borderColor: colors.border,
  },
  editBadge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
});
