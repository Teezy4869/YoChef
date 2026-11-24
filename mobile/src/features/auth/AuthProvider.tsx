import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

import { useSupabase } from '@/lib/supabase';

import { authErrorMessage } from './authErrors';
import { normalizeEmail } from './validation';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

export type SignUpOutcome =
  | { kind: 'signedIn' }
  | { kind: 'confirmEmail' } // email confirmation is on: user must open the link first
  | { kind: 'error'; message: string };

export type AuthContextValue = {
  status: AuthStatus;
  session: Session | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (input: { email: string; password: string; displayName: string }) => Promise<SignUpOutcome>;
  signOut: () => Promise<{ error: string | null }>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useSupabase();
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  // Session restore: the client reads the persisted session from AsyncStorage
  // and emits INITIAL_SESSION, then every later change. Only set state here;
  // calling other Supabase methods inside this callback can deadlock.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setStatus(next ? 'signedIn' : 'signedOut');
    });
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  // Refresh tokens only while the app is in the foreground (Supabase guidance for RN).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (AppState.currentState === 'active') supabase.auth.startAutoRefresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });
    return () => {
      sub.remove();
      supabase.auth.stopAutoRefresh();
    };
  }, [supabase]);

  const signIn = useCallback<AuthContextValue['signIn']>(
    async (email, password) => {
      try {
        const { error } = await supabase.auth.signInWithPassword({ email: normalizeEmail(email), password });
        return { error: error ? authErrorMessage(error) : null };
      } catch (e) {
        return { error: authErrorMessage(e as Error) };
      }
    },
    [supabase],
  );

  const signUp = useCallback<AuthContextValue['signUp']>(
    async ({ email, password, displayName }) => {
      try {
        const name = displayName.trim();
        const { data, error } = await supabase.auth.signUp({
          email: normalizeEmail(email),
          password,
          // Read only by the handle_new_user trigger for profiles.display_name;
          // it can never grant a role.
          options: name ? { data: { display_name: name } } : undefined,
        });
        if (error) return { kind: 'error', message: authErrorMessage(error) };
        // With confirmation on, Supabase returns no session. For an already
        // registered email it also returns no session and no error (anti-
        // enumeration), so both cases get the same neutral message.
        return data.session ? { kind: 'signedIn' } : { kind: 'confirmEmail' };
      } catch (e) {
        return { kind: 'error', message: authErrorMessage(e as Error) };
      }
    },
    [supabase],
  );

  const signOut = useCallback<AuthContextValue['signOut']>(async () => {
    try {
      // Local scope: sign out this device only. The stored session is cleared
      // even when the network call fails.
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      return { error: error ? authErrorMessage(error) : null };
    } catch (e) {
      return { error: authErrorMessage(e as Error) };
    }
  }, [supabase]);

  const value = useMemo(
    () => ({ status, session, signIn, signUp, signOut }),
    [status, session, signIn, signUp, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
