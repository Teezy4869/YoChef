import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createContext, useContext } from 'react';

import type { AppEnv } from './env';

export type YoChefClient = SupabaseClient;

export function createSupabaseClient(env: AppEnv): YoChefClient {
  return createClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: {
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      // Mobile app: sessions never arrive through the URL.
      detectSessionInUrl: false,
    },
  });
}

export const SupabaseContext = createContext<YoChefClient | null>(null);

export function useSupabase(): YoChefClient {
  const client = useContext(SupabaseContext);
  if (!client) throw new Error('useSupabase must be used inside <SupabaseContext.Provider>');
  return client;
}
