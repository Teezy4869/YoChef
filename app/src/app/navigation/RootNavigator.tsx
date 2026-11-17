import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DefaultTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import { SignInScreen } from '@/features/auth/SignInScreen';
import { SignUpScreen } from '@/features/auth/SignUpScreen';
import { AccountScreen } from '@/screens/AccountScreen';
import { CookingModeScreen } from '@/screens/CookingModeScreen';
import { FavoritesScreen } from '@/screens/FavoritesScreen';
import { HomeScreen } from '@/screens/HomeScreen';
import { ModerationScreen } from '@/screens/ModerationScreen';
import { RecipeDetailScreen } from '@/screens/RecipeDetailScreen';
import { ShoppingScreen } from '@/screens/ShoppingScreen';
import { colors, shadows, typography } from '@/theme/tokens';

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
    border: colors.borderLight,
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
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.borderLight,
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
          ...shadows.subtle,
        },
        tabBarLabelStyle: {
          ...typography.label,
          fontSize: 12,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'Khám phá',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'restaurant' : 'restaurant-outline'} size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Favorites"
        component={FavoritesScreen}
        options={{
          title: 'Yêu thích',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'heart' : 'heart-outline'} size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Shopping"
        component={ShoppingScreen}
        options={{
          title: 'Đi chợ',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'basket' : 'basket-outline'} size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Account"
        component={AccountScreen}
        options={{
          title: 'Tài khoản',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={size ?? 22} color={color} />
          ),
        }}
      />
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
          headerTitleStyle: { color: colors.text, fontWeight: '700' },
          contentStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.surface },
        }}
      >
        <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
        <Stack.Screen name="RecipeDetail" component={RecipeDetailScreen} options={{ title: 'Công thức' }} />
        <Stack.Screen name="CookingMode" component={CookingModeScreen} options={{ title: 'Chế độ nấu' }} />
        {status === 'signedIn' ? (
          <Stack.Screen name="Moderation" component={ModerationScreen} options={{ title: 'Duyệt nội dung' }} />
        ) : null}
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
