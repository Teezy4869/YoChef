import type { ReactElement, ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type RefreshControlProps,
} from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

import { colors, spacing } from "@/theme/tokens";

export type ScreenProps = {
  children: ReactNode;
  /** Scrollable content with keyboard avoidance (forms). Default true. */
  scroll?: boolean;
  /** Vertically center the content (empty states, simple forms). */
  centered?: boolean;
  padding?: "default" | "compact" | "none";
  refreshControl?: ReactElement<RefreshControlProps>;
  edges?: Edge[];
  testID?: string;
};

export function Screen({
  children,
  scroll = true,
  centered = false,
  padding = "default",
  refreshControl,
  edges = ["top", "left", "right"],
  testID,
}: ScreenProps) {
  const padStyle =
    padding === "none"
      ? styles.padNone
      : padding === "compact"
        ? styles.padCompact
        : styles.padDefault;

  const content = scroll ? (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        padStyle,
        centered ? styles.centered : null,
      ]}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  ) : (
    <View
      style={[
        styles.content,
        styles.fill,
        padStyle,
        centered ? styles.centered : null,
      ]}
    >
      {children}
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={edges} testID={testID}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {content}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  fill: { flex: 1 },
  content: {
    flexGrow: 1,
    gap: spacing.lg,
  },
  padDefault: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  padCompact: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  padNone: {
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  centered: { justifyContent: "center" },
});
