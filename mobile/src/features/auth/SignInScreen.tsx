import { useRef, useState, type ComponentRef } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';

import type { RootStackScreenProps } from '@/app/navigation/types';
import { AppIcon } from '@/components/AppIcon';
import { AppText } from '@/components/AppText';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { colors, radius, shadows, spacing } from '@/theme/tokens';

import { useAuth } from './AuthProvider';
import { hasErrors, validateSignIn, type SignInErrors } from './validation';

export function SignInScreen({ navigation }: RootStackScreenProps<'SignIn'>) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<SignInErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);

  async function submit() {
    if (submitting) return;
    const found = validateSignIn({ email, password });
    setErrors(found);
    setFormError(null);
    if (hasErrors(found)) return;
    setSubmitting(true);
    const { error } = await signIn(email, password);
    // On success the auth group unmounts and the modal closes; nothing else to do.
    if (error) {
      setFormError(error);
      setSubmitting(false);
    }
  }

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <View style={styles.hero}>
        <View style={styles.emblem}>
          <AppIcon name="restaurant" size={28} tone="primary" />
        </View>
        <AppText variant="title" align="center">
          Chào mừng trở lại
        </AppText>
        <AppText tone="muted" align="center">
          Đăng nhập để lưu công thức yêu thích và danh sách mua sắm.
        </AppText>
      </View>

      <View style={styles.card}>
        {formError ? <Banner tone="error" message={formError} testID="signin-error" /> : null}
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
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          submitBehavior="submit"
        />
        <TextField
          ref={passwordRef}
          label="Mật khẩu"
          leftIcon="lock-closed-outline"
          value={password}
          onChangeText={setPassword}
          error={errors.password}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        <Button title="Đăng nhập" icon="log-in-outline" onPress={submit} loading={submitting} />
      </View>

      <Button title="Chưa có tài khoản? Đăng ký" variant="ghost" onPress={() => navigation.replace('SignUp')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.sm,
  },
  emblem: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
});
