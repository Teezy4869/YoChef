// In-memory stand-in for the Supabase client, covering only what the app calls.
// Mocks prove UI wiring, not integration: the live check (smoke:auth) covers that.
import type { Session } from '@supabase/supabase-js';

import type { YoChefClient } from '@/lib/supabase';

type Listener = (event: string, session: Session | null) => void;

export function fakeSession(overrides: Partial<{ id: string; email: string }> = {}): Session {
  const id = overrides.id ?? '11111111-1111-4111-8111-111111111111';
  return {
    access_token: 'access',
    refresh_token: 'refresh',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: {
      id,
      email: overrides.email ?? 'an@example.com',
      aud: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  } as Session;
}

export function createFakeSupabase(initial: Session | null = null) {
  let session = initial;
  const listeners = new Set<Listener>();
  const emit = (event: string) => listeners.forEach((l) => l(event, session));

  const auth = {
    onAuthStateChange: jest.fn((cb: Listener) => {
      listeners.add(cb);
      // Real client emits INITIAL_SESSION asynchronously after restoring storage.
      Promise.resolve().then(() => cb('INITIAL_SESSION', session));
      return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
    }),
    startAutoRefresh: jest.fn(async () => {}),
    stopAutoRefresh: jest.fn(async () => {}),
    signInWithPassword: jest.fn(async ({ email }: { email: string; password: string }) => {
      session = fakeSession({ email });
      emit('SIGNED_IN');
      return { data: { session, user: session.user }, error: null };
    }),
    signUp: jest.fn(async ({ email }: { email: string; password: string; options?: unknown }) => {
      session = fakeSession({ email });
      emit('SIGNED_IN');
      return { data: { session, user: session.user }, error: null };
    }),
    signOut: jest.fn(async (_opts?: { scope?: string }) => {
      session = null;
      emit('SIGNED_OUT');
      return { error: null };
    }),
  };

  const client = { auth } as unknown as YoChefClient;
  return { client, auth, setSession: (s: Session | null, event = 'TOKEN_REFRESHED') => ((session = s), emit(event)) };
}
