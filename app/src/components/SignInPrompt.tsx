import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '@/app/navigation/types';

import { AppText } from './AppText';
import { Button } from './Button';
import { Screen } from './Screen';

/** Guest view of a screen that needs an account: explains why and opens the auth modals. */
export function SignInPrompt({ title, message, testID }: { title: string; message: string; testID?: string }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <Screen centered testID={testID}>
      <AppText variant="title">{title}</AppText>
      <AppText tone="muted">{message}</AppText>
      <Button title="Đăng nhập" onPress={() => navigation.navigate('SignIn')} />
      <Button title="Tạo tài khoản" variant="secondary" onPress={() => navigation.navigate('SignUp')} />
    </Screen>
  );
}
