import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { errorMessage, type AdminClient, type StaffRole } from '@/lib/supabase';

type Roles = { userId: string; roles: StaffRole[]; error: string | null };

export type AdminAuth = {
  client: AdminClient;
  status: 'loading' | 'signedOut' | 'signedIn';
  session: Session | null;
  /** Null while this user's roles load. On a read error: no roles and the message (no fallback). */
  roles: StaffRole[] | null;
  rolesError: string | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AdminAuth | null>(null);
const STAFF: readonly string[] = ['super_admin', 'editor', 'moderator'];

export function AdminAuthProvider({ client, children }: { client: AdminClient; children: ReactNode }) {
  const [state, setState] = useState<{ status: AdminAuth['status']; session: Session | null }>({ status: 'loading', session: null });
  const [loaded, setLoaded] = useState<Roles | null>(null);
  const userId = state.session?.user.id ?? null;

  useEffect(() => {
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setState({ status: session ? 'signedIn' : 'signedOut', session });
    });
    return () => data.subscription.unsubscribe();
  }, [client]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    client
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .then(({ data, error }) => {
        if (!active) return;
        const roles = ((data ?? []) as { role?: unknown }[]).map((r) => String(r.role)).filter((r) => STAFF.includes(r));
        setLoaded(
          error
            ? { userId, roles: [], error: errorMessage(error, 'Không tải được vai trò của tài khoản.') }
            : { userId, roles: roles as StaffRole[], error: null },
        );
      });
    return () => {
      active = false;
    };
  }, [client, userId]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (!error) return null;
      if (/invalid login credentials/i.test(error.message)) return 'Email hoặc mật khẩu không đúng.';
      if (/email not confirmed/i.test(error.message)) return 'Email chưa được xác nhận.';
      return errorMessage(error, 'Không đăng nhập được. Vui lòng thử lại.');
    },
    [client],
  );
  const signOut = useCallback(async () => {
    await client.auth.signOut({ scope: 'local' });
  }, [client]);

  const current = loaded && loaded.userId === userId ? loaded : null;
  const value = useMemo<AdminAuth>(
    () => ({
      client,
      status: state.status,
      session: state.session,
      roles: current?.roles ?? null,
      rolesError: current?.error ?? null,
      signIn,
      signOut,
    }),
    [client, state, current, signIn, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdminAuth(): AdminAuth {
  const value = useContext(Ctx);
  if (!value) throw new Error('useAdminAuth must be used inside AdminAuthProvider');
  return value;
}
