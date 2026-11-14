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
  // Rows the signed-in staff member may read (RLS is not modelled here).
  const tables: Record<string, Record<string, unknown>[]> = {};
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
    const lists: Record<string, unknown[]> = {};
    const likes: Record<string, string> = {};
    let head = false;
    let counted = false;
    let single = false;
    const run = async (): Promise<Result & { count?: number | null }> => {
      if (table === 'user_roles') {
        if (roles.error) return { data: null, error: { message: 'boom' } };
        return { data: session && filters.user_id === session.user.id ? roles.value.map((role) => ({ role })) : [], error: null };
      }
      if (head) return { data: null, error: null, count: counts[`${table}.${String(filters.status)}`] ?? 0 };
      const like = (v: unknown, pattern: string) => String(v).toLowerCase().includes(pattern.replace(/%/g, '').toLowerCase());
      const rows = (tables[table] ?? []).filter(
        (r) =>
          Object.entries(filters).every(([c, v]) => r[c] === v) &&
          Object.entries(lists).every(([c, vs]) => vs.includes(r[c])) &&
          Object.entries(likes).every(([c, p]) => like(r[c], p)),
      );
      const data = rows.map((r) => ({ ...r }));
      return single ? { data: data[0] ?? null, error: null } : { data, error: null, count: counted ? rows.length : null };
    };
    const b = {
      select: (_cols: string, opts?: { head?: boolean; count?: string }) => ((head = !!opts?.head), (counted = !!opts?.count), b),
      ilike: (col: string, pattern: string) => ((likes[col] = pattern), b),
      range: () => b,
      maybeSingle: () => ((single = true), run()),
      eq: (col: string, value: unknown) => ((filters[col] = value), b),
      in: (col: string, values: unknown[]) => ((lists[col] = values), b),
      order: () => b,
      limit: () => b,
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => run().then(resolve, reject),
    };
    return b;
  });

  const rpc = vi.fn(async (fn: string, args: Record<string, unknown> = {}) => {
    const handler = rpcHandlers[fn];
    return handler ? handler(args) : { data: null, error: { message: `no fake for ${fn}` } };
  });

  const storage = {
    from: vi.fn(() => bucket),
  };
  const bucket = {
    createSignedUrls: vi.fn(async (paths: string[]) => ({
      data: paths.map((p) => ({ path: p, signedUrl: `https://example.test/sign/${p}`, error: null })),
      error: null,
    })),
    upload: vi.fn(async (path: string) => ({ data: { path }, error: null })),
    remove: vi.fn(async (paths: string[]) => ({ data: paths, error: null })),
    getPublicUrl: vi.fn((path: string) => ({ data: { publicUrl: `https://example.test/public/${path}` } })),
  };

  const client = { auth, from, rpc, storage } as unknown as AdminClient;
  return { client, auth, from, rpc, roles, counts, rpcHandlers, tables, bucket };
}
