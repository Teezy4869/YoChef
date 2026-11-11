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

  // profiles: one row per user, created on first read like the sign-up trigger.
  const profiles = new Map<string, Record<string, unknown>>();
  const profileOf = (id: string) => {
    if (!profiles.has(id)) {
      profiles.set(id, { id, display_name: null, avatar_path: null, bio: null, created_at: '2026-11-11T00:00:00Z' });
    }
    return profiles.get(id)!;
  };

  const rpc = jest.fn(async (fn: string) => {
    if (fn !== 'get_my_profile') return { data: null, error: { message: `unknown rpc ${fn}` } };
    return { data: session ? [{ ...profileOf(session.user.id) }] : [], error: null };
  });

  const from = jest.fn((table: string) => ({
    update: (patch: Record<string, unknown>) => ({
      eq: (_col: string, id: string) => ({
        select: async () => {
          if (table !== 'profiles' || !session || session.user.id !== id) return { data: [], error: null };
          Object.assign(profileOf(id), patch);
          return { data: [{ id }], error: null };
        },
      }),
    }),
  }));

  const objects = new Set<string>();
  const bucket = {
    upload: jest.fn(async (path: string, _body: unknown, _opts?: unknown) => {
      objects.add(path);
      return { data: { path }, error: null };
    }),
    remove: jest.fn(async (paths: string[]) => {
      paths.forEach((p) => objects.delete(p));
      return { data: [], error: null };
    }),
    getPublicUrl: jest.fn((path: string) => ({
      data: { publicUrl: `https://bdhphjwhagygbwtfhhxn.supabase.co/storage/v1/object/public/avatars/${path}` },
    })),
  };
  const storage = { from: jest.fn((_name: string) => bucket) };

  const client = { auth, rpc, from, storage } as unknown as YoChefClient;
  return {
    client,
    auth,
    rpc,
    from,
    bucket,
    objects,
    profiles,
    profileOf,
    setSession: (s: Session | null, event = 'TOKEN_REFRESHED') => ((session = s), emit(event)),
  };
}
