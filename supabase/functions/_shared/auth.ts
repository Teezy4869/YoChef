// Runtime-neutral authorization helpers for the Edge Functions (no Deno globals), so the
// exact checks the functions run are unit-tested under Vitest (admin/src/test).
import { ContractError } from './http.ts';

export type StaffRole = 'super_admin' | 'editor' | 'moderator';

/** The subset of a supabase-js client these checks use (a user-JWT client, never service role). */
export interface UserScopedClient {
  auth: { getUser(): Promise<{ data: { user: { id: string } | null }; error: unknown }> };
  from(table: string): {
    select(cols: string): { eq(col: string, val: string): PromiseLike<{ data: unknown; error: unknown }> };
  };
}

/**
 * Requires a valid user session AND one of `allowed` roles in public.user_roles, read with
 * the CALLER's JWT (RLS lets a user read only their own roles). Any error fails closed.
 */
export async function requireStaffRole(
  authHeader: string | null,
  makeClient: (authHeader: string) => UserScopedClient,
  allowed: StaffRole[],
  forbiddenMessage: string
): Promise<{ userId: string }> {
  if (!authHeader || !/^Bearer\s+\S+$/i.test(authHeader)) {
    throw new ContractError('unauthorized', 'Missing Authorization header.');
  }
  const client = makeClient(authHeader);
  let user: { id: string } | null = null;
  try {
    const res = await client.auth.getUser();
    user = res.error ? null : res.data.user;
  } catch {
    user = null;
  }
  if (!user) {
    throw new ContractError('unauthorized', 'Invalid or expired user session.');
  }

  let roles: unknown = null;
  let rolesError: unknown = null;
  try {
    const res = await client.from('user_roles').select('role').eq('user_id', user.id);
    roles = res.data;
    rolesError = res.error;
  } catch (err) {
    rolesError = err;
  }
  const ok =
    !rolesError &&
    Array.isArray(roles) &&
    roles.some((r) => typeof r === 'object' && r !== null && allowed.includes((r as { role: StaffRole }).role));
  if (!ok) {
    throw new ContractError('forbidden', forbiddenMessage);
  }
  return { userId: user.id };
}

