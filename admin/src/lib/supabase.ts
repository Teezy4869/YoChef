import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { AdminEnv } from './env';

export type AdminClient = SupabaseClient;

export const createAdminClient = (env: AdminEnv): AdminClient =>
  createClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });

export type StaffRole = 'super_admin' | 'editor' | 'moderator';

/** The matching helper in the database (is_editor / is_moderator) also counts super_admin. */
export const hasRole = (roles: readonly StaffRole[], allowed: readonly StaffRole[]) =>
  roles.includes('super_admin') || roles.some((r) => allowed.includes(r));

/** Vietnamese message for a failed call; network problems get their own. */
export function errorMessage(error: { message?: string; code?: string } | null | undefined, fallback: string): string {
  if (error?.code === '42501') return 'Bạn không có quyền làm việc này.';
  if (error?.message && /network|fetch/i.test(error.message)) return 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';
  return fallback;
}

export const ROLE_LABEL: Record<StaffRole, string> = {
  super_admin: 'Super admin',
  editor: 'Biên tập',
  moderator: 'Kiểm duyệt',
};
