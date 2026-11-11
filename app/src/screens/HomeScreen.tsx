import type { MainTabScreenProps } from '@/app/navigation/types';
import { AppText } from '@/components/AppText';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/features/auth/AuthProvider';

// Phase 1 shell. Recipe search and detail arrive in Phase 2.
export function HomeScreen(_props: MainTabScreenProps<'Home'>) {
  const { status } = useAuth();
  return (
    <Screen centered>
      <AppText variant="display" align="center">
        YoChef
      </AppText>
      <AppText tone="muted" align="center">
        Món Việt, nấu từng bước.
      </AppText>
      <AppText variant="caption" tone="muted" align="center">
        {status === 'signedIn' ? 'Bạn đã đăng nhập.' : 'Bạn đang xem với tư cách khách.'}
      </AppText>
    </Screen>
  );
}
