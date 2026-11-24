import { SignInPrompt } from '@/components/SignInPrompt';
import { useAuth } from '@/features/auth/AuthProvider';
import { ProfileView } from '@/features/profile/ProfileView';

export function AccountScreen() {
  const { status, session } = useAuth();

  if (status === 'signedIn' && session) {
    // key: a different user gets a fresh view, never the previous user's state.
    return <ProfileView key={session.user.id} session={session} />;
  }

  return (
    <SignInPrompt
      title="Tài khoản"
      message="Bạn đang xem với tư cách khách. Đăng nhập để lưu yêu thích, đánh giá và tạo danh sách mua sắm."
      testID="account-guest"
    />
  );
}
