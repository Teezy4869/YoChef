import { useRef, useState, type ComponentRef } from 'react';
import type { TextInput } from 'react-native';

import type { RootStackScreenProps } from '@/app/navigation/types';
import { AppText } from '@/components/AppText';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';

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
      <AppText variant="title">Chào mừng trở lại</AppText>
      <AppText tone="muted">Đăng nhập để lưu công thức yêu thích và danh sách mua sắm.</AppText>
      {formError ? <Banner tone="error" message={formError} testID="signin-error" /> : null}
      <TextField
        label="Email"
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
      <Button title="Đăng nhập" onPress={submit} loading={submitting} />
      <Button title="Chưa có tài khoản? Đăng ký" variant="ghost" onPress={() => navigation.replace('SignUp')} />
    </Screen>
  );
}
