// In-memory stand-in for the Supabase client, covering only what the admin calls.
// It proves UI wiring, not integration: smoke:admin checks the real project.
import type { Session } from '@supabase/supabase-js';
import { vi } from 'vitest';

import type { AdminClient, StaffRole } from '@/lib/supabase';

type Listener = (event: string, session: Session | null) => void;
type Result = { data: unknown; error: { message: string; code?: string } | null };

export function fakeSession(id = 'u-1', email = 'staff@example.test'): Session {
  return {
    access_token: 'a',
    refresh_token: 'r',
    expires_in: 3600,
    token_type: 'bearer',
    user: { id, email, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '' },
  } as Session;
}

export function createFakeClient(options: { session?: Session | null; roles?: StaffRole[]; rolesError?: boolean } = {}) {
  let session = options.session ?? null;
  const listeners = new Set<Listener>();
  const roles = { value: options.roles ?? [], error: options.rolesError ?? false };
  const counts: Record<string, number> = {};
  const rpcHandlers: Record<string, (args: Record<string, unknown>) => Result | Promise<Result>> = {};

  const auth = {
    onAuthStateChange: vi.fn((cb: Listener) => {
      listeners.add(cb);
      Promise.resolve().then(() => cb('INITIAL_SESSION', session));
      return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
    }),
    signInWithPassword: vi.fn(async ({ email, password }: { email: string; password: string }) => {
      if (password !== 'correct') return { data: { session: null }, error: { message: 'Invalid login credentials' } };
      session = fakeSession('u-1', email);
      listeners.forEach((l) => l('SIGNED_IN', session));
      return { data: { session }, error: null };
    }),
    signOut: vi.fn(async () => {
      session = null;
      listeners.forEach((l) => l('SIGNED_OUT', null));
      return { error: null };
    }),
  };

  const from = vi.fn((table: string) => {
    const filters: Record<string, unknown> = {};
    let head = false;
    const run = async (): Promise<Result & { count?: number | null }> => {
      if (table === 'user_roles') {
        if (roles.error) return { data: null, error: { message: 'boom' } };
        return { data: session && filters.user_id === session.user.id ? roles.value.map((role) => ({ role })) : [], error: null };
      }
      if (head) return { data: null, error: null, count: counts[`${table}.${String(filters.status)}`] ?? 0 };
      return { data: [], error: null };
    };
    const b = {
      select: (_cols: string, opts?: { head?: boolean }) => ((head = !!opts?.head), b),
      eq: (col: string, value: unknown) => ((filters[col] = value), b),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => run().then(resolve, reject),
    };
    return b;
  });

  const rpc = vi.fn(async (fn: string, args: Record<string, unknown> = {}) => {
    const handler = rpcHandlers[fn];
    return handler ? handler(args) : { data: null, error: { message: `no fake for ${fn}` } };
  });

  const client = { auth, from, rpc } as unknown as AdminClient;
  return { client, auth, from, rpc, roles, counts, rpcHandlers };
}
