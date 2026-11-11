import { useState } from 'react';

import type { MainTabScreenProps } from '@/app/navigation/types';
import { AppText } from '@/components/AppText';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/features/auth/AuthProvider';

export function AccountScreen({ navigation }: MainTabScreenProps<'Account'>) {
  const { status, session, signOut } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status !== 'signedIn' || !session) {
    return (
      <Screen centered testID="account-guest">
        <AppText variant="title">Tài khoản</AppText>
        <AppText tone="muted">
          Bạn đang xem với tư cách khách. Đăng nhập để lưu yêu thích, đánh giá và tạo danh sách mua sắm.
        </AppText>
        <Button title="Đăng nhập" onPress={() => navigation.navigate('SignIn')} />
        <Button title="Tạo tài khoản" variant="secondary" onPress={() => navigation.navigate('SignUp')} />
      </Screen>
    );
  }

  async function onSignOut() {
    setBusy(true);
    setError(null);
    const r = await signOut();
    setBusy(false);
    if (r.error) setError(r.error);
  }

  return (
    <Screen testID="account-signed-in">
      <AppText variant="title">Tài khoản</AppText>
      <AppText tone="muted">{session.user.email}</AppText>
      {error ? <Banner tone="error" message={error} /> : null}
      <Button title="Đăng xuất" variant="secondary" onPress={onSignOut} loading={busy} />
    </Screen>
  );
}
