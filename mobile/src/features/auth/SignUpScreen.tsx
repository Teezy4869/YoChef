import { useState } from "react";
import { StyleSheet, View } from "react-native";

import type { RootStackScreenProps } from "@/app/navigation/types";
import { AppIcon } from "@/components/AppIcon";
import { AppText } from "@/components/AppText";
import { Banner } from "@/components/Banner";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { colors, radius, shadows, spacing } from "@/theme/tokens";

import { useAuth } from "./AuthProvider";
import {
  DISPLAY_NAME_MAX,
  hasErrors,
  PASSWORD_MIN,
  validateSignUp,
  type SignUpErrors,
} from "./validation";

export function SignUpScreen({ navigation }: RootStackScreenProps<"SignUp">) {
  const { signUp } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<SignUpErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmSent, setConfirmSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (submitting) return;
    const found = validateSignUp({ email, password, confirm, displayName });
    setErrors(found);
    setFormError(null);
    if (hasErrors(found)) return;
    setSubmitting(true);
    const outcome = await signUp({ email, password, displayName });
    setSubmitting(false);
    if (outcome.kind === "error") setFormError(outcome.message);
    else if (outcome.kind === "confirmEmail") setConfirmSent(true);
    // signedIn: the auth group unmounts and the modal closes.
  }

  if (confirmSent) {
    return (
      <Screen centered edges={["left", "right", "bottom"]}>
        <View style={styles.confirmCard}>
          <View style={styles.emblem}>
            <AppIcon name="mail-open-outline" size={30} tone="primary" />
          </View>
          <AppText variant="title" align="center">
            Kiểm tra hộp thư
          </AppText>
          <Banner
            tone="success"
            testID="signup-confirm"
            message={`Nếu ${email.trim()} chưa có tài khoản, YoChef đã gửi thư xác nhận. Mở liên kết trong thư rồi đăng nhập.`}
          />
          <Button
            title="Về trang đăng nhập"
            icon="log-in-outline"
            onPress={() => navigation.replace("SignIn")}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={["left", "right", "bottom"]}>
      <View style={styles.hero}>
        <View style={styles.emblem}>
          <AppIcon name="person-add-outline" size={28} tone="primary" />
        </View>
        <AppText variant="title" align="center">
          Tạo tài khoản
        </AppText>
        <AppText tone="muted" align="center">
          Miễn phí. Dùng email và mật khẩu.
        </AppText>
      </View>

      <View style={styles.card}>
        {formError ? (
          <Banner tone="error" message={formError} testID="signup-error" />
        ) : null}
        <TextField
          label="Tên hiển thị (không bắt buộc)"
          leftIcon="person-outline"
          value={displayName}
          onChangeText={setDisplayName}
          error={errors.displayName}
          maxLength={DISPLAY_NAME_MAX + 10}
          autoComplete="name"
          textContentType="nickname"
        />
        <TextField
          label="Email"
          leftIcon="mail-outline"
          value={email}
          onChangeText={setEmail}
          error={errors.email}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <TextField
          label="Mật khẩu"
          leftIcon="lock-closed-outline"
          value={password}
          onChangeText={setPassword}
          error={errors.password}
          hint={`Ít nhất ${PASSWORD_MIN} ký tự.`}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <TextField
          label="Nhập lại mật khẩu"
          leftIcon="shield-checkmark-outline"
          value={confirm}
          onChangeText={setConfirm}
          error={errors.confirm}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        <Button
          title="Đăng ký"
          icon="checkmark-circle-outline"
          onPress={submit}
          loading={submitting}
        />
      </View>

      <Button
        title="Đã có tài khoản? Đăng nhập"
        variant="ghost"
        onPress={() => navigation.replace("SignIn")}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: "center",
    gap: spacing.xs,
    paddingTop: spacing.sm,
  },
  emblem: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  confirmCard: {
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
});
