import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DefaultTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon, type IconName } from '@/components/AppIcon';
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
import { colors, fonts, shadows } from '@/theme/tokens';

import type { MainTabParamList, RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

const TAB_ICON: Record<keyof MainTabParamList, { active: IconName; idle: IconName }> = {
  Home: { active: 'compass', idle: 'compass-outline' },
  Favorites: { active: 'heart', idle: 'heart-outline' },
  Shopping: { active: 'basket', idle: 'basket-outline' },
  Account: { active: 'person', idle: 'person-outline' },
};

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
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 4);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelPosition: 'below-icon',
        tabBarStyle: [
          styles.tabBar,
          {
            height: 52 + bottomPad,
            paddingTop: 4,
            paddingBottom: bottomPad,
          },
        ],
        tabBarItemStyle: styles.tabItem,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ focused, color }) => {
          const icons = TAB_ICON[route.name];
          return <AppIcon name={focused ? icons.active : icons.idle} size={20} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Khám phá' }} />
      <Tab.Screen name="Favorites" component={FavoritesScreen} options={{ title: 'Yêu thích' }} />
      <Tab.Screen name="Shopping" component={ShoppingScreen} options={{ title: 'Đi chợ' }} />
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
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.primary,
          headerTitleStyle: { color: colors.text, fontFamily: fonts.semibold, fontSize: 17 },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
        <Stack.Screen name="RecipeDetail" component={RecipeDetailScreen} options={{ headerShown: false }} />
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
  tabBar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadows.card,
  },
  tabItem: {
    justifyContent: 'center',
    paddingVertical: 0,
  },
  tabLabel: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    lineHeight: 14,
    marginTop: 1,
  },
});
