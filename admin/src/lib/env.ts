// Fail-closed environment check, the same rules as the mobile app (app/src/lib/env.ts).
// Every VITE_* value ships in the browser bundle, so only the project URL and the
// publishable key are allowed; anything else stops the admin before a client exists.

export type AdminEnv = { supabaseUrl: string; supabasePublishableKey: string };
export type EnvResult = { ok: true; env: AdminEnv } | { ok: false; problems: string[] };
export type RawEnv = { url: string | undefined; key: string | undefined };

const SUPABASE_URL_RE = /^https:\/\/[a-z0-9]{20}\.supabase\.co$/;
// The pre-rebuild project: read-only reference with a schema the admin does not match (AGENTS.md).
const OLD_PROJECT_REF = 'ihfuftmpsfgtwvmtfdja';

export const rawEnvFromVite = (): RawEnv => ({
  url: import.meta.env.VITE_SUPABASE_URL,
  key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
});

function jwtRole(token: string): string | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))) as { role?: unknown };
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

export function validateEnv(raw: RawEnv): EnvResult {
  const problems: string[] = [];
  const url = (raw.url ?? '').trim().replace(/\/+$/, '');
  const key = (raw.key ?? '').trim();

  if (!url) problems.push('Thiếu VITE_SUPABASE_URL.');
  else if (!SUPABASE_URL_RE.test(url)) problems.push('VITE_SUPABASE_URL phải có dạng https://<project-ref>.supabase.co.');
  else if (url.includes(OLD_PROJECT_REF)) {
    problems.push('VITE_SUPABASE_URL đang trỏ tới project cũ (chỉ đọc). YoChef v2 dùng project bdhphjwhagygbwtfhhxn.');
  }

  if (!key) problems.push('Thiếu VITE_SUPABASE_PUBLISHABLE_KEY.');
  else if (key.startsWith('sb_secret_')) problems.push('Khóa là secret key. Admin chỉ được dùng publishable key.');
  else if (key.startsWith('eyJ')) {
    const role = jwtRole(key);
    if (role !== 'anon') problems.push(`Khóa JWT có vai trò "${role ?? 'không đọc được'}". Admin chỉ được dùng khóa anon/publishable.`);
  } else if (!key.startsWith('sb_publishable_') || key.includes('<')) {
    problems.push('VITE_SUPABASE_PUBLISHABLE_KEY không phải publishable key (sb_publishable_...).');
  }

  return problems.length > 0 ? { ok: false, problems } : { ok: true, env: { supabaseUrl: url, supabasePublishableKey: key } };
}
