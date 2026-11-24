import { useState } from 'react';

import type { RootStackScreenProps } from '@/app/navigation/types';
import { AppText } from '@/components/AppText';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';

import { useAuth } from './AuthProvider';
import { DISPLAY_NAME_MAX, hasErrors, PASSWORD_MIN, validateSignUp, type SignUpErrors } from './validation';

export function SignUpScreen({ navigation }: RootStackScreenProps<'SignUp'>) {
  const { signUp } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
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
    if (outcome.kind === 'error') setFormError(outcome.message);
    else if (outcome.kind === 'confirmEmail') setConfirmSent(true);
    // signedIn: the auth group unmounts and the modal closes.
  }

  if (confirmSent) {
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        <AppText variant="title">Kiểm tra hộp thư</AppText>
        <Banner
          tone="success"
          testID="signup-confirm"
          message={`Nếu ${email.trim()} chưa có tài khoản, YoChef đã gửi thư xác nhận. Mở liên kết trong thư rồi đăng nhập.`}
        />
        <Button title="Về trang đăng nhập" onPress={() => navigation.replace('SignIn')} />
      </Screen>
    );
  }

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <AppText variant="title">Tạo tài khoản</AppText>
      <AppText tone="muted">Miễn phí. Dùng email và mật khẩu.</AppText>
      {formError ? <Banner tone="error" message={formError} testID="signup-error" /> : null}
      <TextField
        label="Tên hiển thị (không bắt buộc)"
        value={displayName}
        onChangeText={setDisplayName}
        error={errors.displayName}
        maxLength={DISPLAY_NAME_MAX + 10}
        autoComplete="name"
        textContentType="nickname"
      />
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
      />
      <TextField
        label="Mật khẩu"
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
      <Button title="Đăng ký" onPress={submit} loading={submitting} />
      <Button title="Đã có tài khoản? Đăng nhập" variant="ghost" onPress={() => navigation.replace('SignIn')} />
    </Screen>
  );
}
