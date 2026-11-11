import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DefaultTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import { SignInScreen } from '@/features/auth/SignInScreen';
import { SignUpScreen } from '@/features/auth/SignUpScreen';
import { AccountScreen } from '@/screens/AccountScreen';
import { HomeScreen } from '@/screens/HomeScreen';
import { colors, typography } from '@/theme/tokens';

import type { MainTabParamList, RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

const navTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.primary,
  },
};

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        // No icon set is bundled yet; labels alone keep the bar readable.
        tabBarIconStyle: { display: 'none' },
        tabBarLabelStyle: { ...typography.label, fontSize: 15 },
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Khám phá' }} />
      <Tab.Screen name="Account" component={AccountScreen} options={{ title: 'Tài khoản' }} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const { status } = useAuth();

  // Wait for the persisted session so a signed-in user never sees the guest UI flash.
  if (status === 'loading') {
    return (
      <View style={styles.splash} testID="auth-loading">
        <ActivityIndicator color={colors.primary} size="large" accessibilityLabel="Đang tải" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerTintColor: colors.primary,
          headerTitleStyle: { color: colors.text },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
        {status === 'signedOut' ? (
          <Stack.Group screenOptions={{ presentation: 'modal' }}>
            <Stack.Screen name="SignIn" component={SignInScreen} options={{ title: 'Đăng nhập' }} />
            <Stack.Screen name="SignUp" component={SignUpScreen} options={{ title: 'Đăng ký' }} />
          </Stack.Group>
        ) : null}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
});
