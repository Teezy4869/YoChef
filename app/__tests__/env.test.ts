import { validateEnv } from '@/lib/env';

const URL = 'https://bdhphjwhagygbwtfhhxn.supabase.co';
const PUBLISHABLE = 'sb_publishable_abcDEF123_xyz';

function jwt(payload: object) {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.signature`;
}

describe('validateEnv (fail-closed)', () => {
  it('accepts the project URL with a publishable key', () => {
    const r = validateEnv({ url: `${URL}/`, key: ` ${PUBLISHABLE} ` });
    expect(r).toEqual({ ok: true, env: { supabaseUrl: URL, supabasePublishableKey: PUBLISHABLE } });
  });

  it('accepts a legacy anon JWT', () => {
    expect(validateEnv({ url: URL, key: jwt({ role: 'anon' }) }).ok).toBe(true);
  });

  it.each([
    ['missing everything', undefined, undefined],
    ['empty strings', '', ''],
    ['template placeholders', 'https://<project-ref>.supabase.co', '<sb_publishable_...>'],
    ['http URL', 'http://bdhphjwhagygbwtfhhxn.supabase.co', PUBLISHABLE],
    ['foreign host', 'https://evil.example.com', PUBLISHABLE],
    ['secret key', URL, 'sb_secret_abc123'],
    ['service_role JWT', URL, jwt({ role: 'service_role' })],
    ['unreadable JWT', URL, 'eyJnot-a-jwt'],
    ['unknown key format', URL, 'abc123'],
  ])('rejects %s', (_name, url, key) => {
    const r = validateEnv({ url, key });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.length).toBeGreaterThan(0);
  });

  it('never echoes the key value in problems', () => {
    const r = validateEnv({ url: URL, key: 'sb_secret_TOPSECRET' });
    expect(JSON.stringify(r)).not.toContain('TOPSECRET');
  });
});
