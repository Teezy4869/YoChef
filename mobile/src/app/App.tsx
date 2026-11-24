import {
  BeVietnamPro_400Regular,
  BeVietnamPro_500Medium,
  BeVietnamPro_600SemiBold,
  BeVietnamPro_700Bold,
  useFonts,
} from '@expo-google-fonts/be-vietnam-pro';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/features/auth/AuthProvider';
import { FavoritesProvider } from '@/features/favorites/FavoritesProvider';
import { rawEnvFromProcess, validateEnv, type AppEnv, type RawEnv } from '@/lib/env';
import { createSupabaseClient, SupabaseContext, type YoChefClient } from '@/lib/supabase';
import { ConfigErrorScreen } from '@/screens/ConfigErrorScreen';

import { RootNavigator } from './navigation/RootNavigator';

export type AppProps = {
  /** Injected in tests; production reads EXPO_PUBLIC_* at build time. */
  rawEnv?: RawEnv;
  /** Injected in tests to avoid a real network client. */
  createClient?: (env: AppEnv) => YoChefClient;
};

export default function App({ rawEnv, createClient = createSupabaseClient }: AppProps) {
  const [fontsLoaded, fontError] = useFonts({
    BeVietnamPro_400Regular,
    BeVietnamPro_500Medium,
    BeVietnamPro_600SemiBold,
    BeVietnamPro_700Bold,
  });

  const envResult = useMemo(() => validateEnv(rawEnv ?? rawEnvFromProcess()), [rawEnv]);
  const client = useMemo(() => (envResult.ok ? createClient(envResult.env) : null), [envResult, createClient]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {envResult.ok && client ? (
        <SupabaseContext.Provider value={client}>
          <AuthProvider>
            <FavoritesProvider>
              <RootNavigator />
            </FavoritesProvider>
          </AuthProvider>
        </SupabaseContext.Provider>
      ) : (
        <ConfigErrorScreen problems={envResult.ok ? [] : envResult.problems} />
      )}
    </SafeAreaProvider>
  );
}
