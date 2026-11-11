import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Screen } from '@/components/Screen';
import { rawEnvFromProcess, validateEnv, type AppEnv, type RawEnv } from '@/lib/env';
import { createSupabaseClient, SupabaseContext, type YoChefClient } from '@/lib/supabase';
import { ConfigErrorScreen } from '@/screens/ConfigErrorScreen';

export type AppProps = {
  /** Injected in tests; production reads EXPO_PUBLIC_* at build time. */
  rawEnv?: RawEnv;
  /** Injected in tests to avoid a real network client. */
  createClient?: (env: AppEnv) => YoChefClient;
};

export default function App({ rawEnv, createClient = createSupabaseClient }: AppProps) {
  const envResult = useMemo(() => validateEnv(rawEnv ?? rawEnvFromProcess()), [rawEnv]);
  const client = useMemo(() => (envResult.ok ? createClient(envResult.env) : null), [envResult, createClient]);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {envResult.ok && client ? (
        <SupabaseContext.Provider value={client}>
          <Screen centered>
            <AppText variant="display" align="center">
              YoChef
            </AppText>
          </Screen>
        </SupabaseContext.Provider>
      ) : (
        <ConfigErrorScreen problems={envResult.ok ? [] : envResult.problems} />
      )}
    </SafeAreaProvider>
  );
}
