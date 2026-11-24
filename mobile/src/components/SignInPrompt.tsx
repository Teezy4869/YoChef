import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { StyleSheet, View } from "react-native";

import type { RootStackParamList } from "@/app/navigation/types";
import { colors, radius, shadows, spacing } from "@/theme/tokens";

import { AppIcon } from "./AppIcon";
import { AppText } from "./AppText";
import { Button } from "./Button";
import { Screen } from "./Screen";

/** Guest view of a screen that needs an account: explains why and opens the auth modals. */
export function SignInPrompt({
  title,
  message,
  testID,
}: {
  title: string;
  message: string;
  testID?: string;
}) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <Screen centered testID={testID}>
      <View style={styles.card}>
        <View style={styles.emblem}>
          <AppIcon name="restaurant" size={32} tone="primary" />
        </View>
        <View style={styles.copy}>
          <AppText variant="title" align="center">
            {title}
          </AppText>
          <AppText tone="muted" align="center">
            {message}
          </AppText>
        </View>
        <View style={styles.actions}>
          <Button
            title="Đăng nhập"
            icon="log-in-outline"
            onPress={() => navigation.navigate("SignIn")}
          />
          <Button
            title="Tạo tài khoản"
            variant="secondary"
            icon="person-add-outline"
            onPress={() => navigation.navigate("SignUp")}
          />
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
    gap: spacing.lg,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  emblem: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: {
    gap: spacing.xs,
  },
  actions: {
    alignSelf: "stretch",
    gap: spacing.sm,
  },
});
