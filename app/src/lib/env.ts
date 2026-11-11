// Fail-closed environment check (Phase 1.2).
//
// The app only ever talks to Supabase with the PUBLISHABLE key. If the URL or
// key is missing, malformed, a placeholder, or a privileged key, the app must
// not start a client at all: it shows a configuration error instead.
//
// Expo inlines EXPO_PUBLIC_* only for static `process.env.NAME` reads, so the
// defaults below must stay literal property accesses.

export type AppEnv = {
  supabaseUrl: string;
  supabasePublishableKey: string;
};

export type EnvResult = { ok: true; env: AppEnv } | { ok: false; problems: string[] };

export type RawEnv = {
  url: string | undefined;
  key: string | undefined;
};

const SUPABASE_URL_RE = /^https:\/\/[a-z0-9]{20}\.supabase\.co$/;

export function rawEnvFromProcess(): RawEnv {
  return {
    url: process.env.EXPO_PUBLIC_SUPABASE_URL,
    key: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

function decodeJwtRole(token: string): string | null {
  const part = token.split('.')[1];
  if (!part || typeof globalThis.atob !== 'function') return null;
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(globalThis.atob(padded)) as { role?: unknown };
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

export function validateEnv(raw: RawEnv): EnvResult {
  const problems: string[] = [];
  const url = (raw.url ?? '').trim().replace(/\/+$/, '');
  const key = (raw.key ?? '').trim();

  if (!url) {
    problems.push('Thiếu EXPO_PUBLIC_SUPABASE_URL.');
  } else if (!SUPABASE_URL_RE.test(url)) {
    problems.push('EXPO_PUBLIC_SUPABASE_URL phải có dạng https://<project-ref>.supabase.co.');
  }

  if (!key) {
    problems.push('Thiếu EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
  } else if (key.startsWith('sb_secret_')) {
    problems.push('Khóa là secret key. App chỉ được dùng publishable key.');
  } else if (key.startsWith('eyJ')) {
    const role = decodeJwtRole(key);
    if (role !== 'anon') {
      problems.push(`Khóa JWT có vai trò "${role ?? 'không đọc được'}". App chỉ được dùng khóa anon/publishable.`);
    }
  } else if (!key.startsWith('sb_publishable_') || key.includes('<')) {
    problems.push('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY không phải publishable key (sb_publishable_...).');
  }

  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, env: { supabaseUrl: url, supabasePublishableKey: key } };
}
