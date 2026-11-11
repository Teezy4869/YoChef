import type { MainTabScreenProps } from '@/app/navigation/types';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/features/auth/AuthProvider';
import { ProfileView } from '@/features/profile/ProfileView';

export function AccountScreen({ navigation }: MainTabScreenProps<'Account'>) {
  const { status, session } = useAuth();

  if (status === 'signedIn' && session) {
    // key: a different user gets a fresh view, never the previous user's state.
    return <ProfileView key={session.user.id} session={session} />;
  }

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
