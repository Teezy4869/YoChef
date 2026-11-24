import { StyleSheet, View } from "react-native";

import { AppIcon } from "@/components/AppIcon";
import { AppText } from "@/components/AppText";
import { Screen } from "@/components/Screen";
import { colors, radius, shadows, spacing } from "@/theme/tokens";

// Shown instead of the app when the environment is not safe to use (fail-closed).
// No Supabase client exists while this screen is up, so nothing touches the network.
export function ConfigErrorScreen({ problems }: { problems: string[] }) {
  return (
    <Screen centered testID="config-error">
      <View style={styles.card}>
        <View style={styles.iconBox}>
          <AppIcon name="warning-outline" size={30} tone="danger" />
        </View>
        <AppText variant="title" align="center">
          Chưa cấu hình xong
        </AppText>
        <AppText tone="muted" align="center">
          YoChef không kết nối tới máy chủ khi cấu hình chưa hợp lệ. Người phát
          triển cần sửa file mobile/.env rồi khởi động lại.
        </AppText>
        <View style={styles.list}>
          {problems.map((p) => (
            <AppText key={p} tone="danger">
              • {p}
            </AppText>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderCurve: "continuous",
    padding: spacing.xl,
    gap: spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.dangerSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    alignSelf: "stretch",
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
  },
});
