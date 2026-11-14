#!/usr/bin/env node
// Live staff-permission check (Phase 4, tier 3) on v2 with the publishable key only.
//
//   npm run smoke:admin
//
// Needs app/.env (URL + publishable key) and, in .env.smoke (git-ignored), test
// accounts only, never real staff:
//   SMOKE_EMAIL / SMOKE_PASSWORD               user A, no staff role
//   SMOKE_EMAIL_MOD / SMOKE_PASSWORD_MOD       moderator M
//   SMOKE_EMAIL_SUPER / SMOKE_PASSWORD_SUPER   super admin S (bootstrapped once by SQL)
//   SMOKE_EMAIL_EDITOR / SMOKE_PASSWORD_EDITOR editor E (S grants the role here)
//
// Role changes it makes are undone in the same run, except E's editor role,
// which is the point of the account. admin_audit_logs is append-only, so every
// run leaves its role.assign / role.revoke rows. Never prints a key, a password
// or a full email.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

import { OLD_REF, V2_URL } from './lib/v2.mjs';

const { values } = parseArgs({ options: { log: { type: 'string' } } });
const url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

function refuse(msg) {
  console.error(`live_admin_smoke: ${msg}`);
  process.exit(2);
}
if (url.includes(OLD_REF)) refuse(`URL points to the old project ${OLD_REF} (read-only reference); YoChef v2 is ${V2_URL}`);
if (url !== V2_URL) refuse(`URL must be the YoChef v2 project ${V2_URL}`);
if (!key || key.startsWith('sb_secret_')) refuse('the publishable key is required, and only that key');

const cred = (suffix) => ({
  email: (process.env[`SMOKE_EMAIL${suffix}`] ?? '').trim().toLowerCase(),
  password: process.env[`SMOKE_PASSWORD${suffix}`] ?? '',
});
const creds = { A: cred(''), M: cred('_MOD'), S: cred('_SUPER'), E: cred('_EDITOR') };
for (const [who, c] of Object.entries(creds)) {
  if (!c.email || !c.password) refuse(`credentials for ${who} are missing in .env.smoke`);
}
if (new Set(Object.values(creds).map((c) => c.email)).size !== 4) refuse('A, M, S and E must be four different accounts');

const mask = (email) => email.replace(/^(.)[^@]*(@.*)$/, '$1***$2');
const lines = [];
let failures = 0;
const log = (s) => {
  lines.push(s);
  console.log(s);
};
function check(name, ok, detail) {
  if (!ok) failures++;
  log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}
function finish() {
  log(failures === 0 ? 'ALL PASS' : `${failures} FAILED`);
  if (values.log) {
    mkdirSync(dirname(values.log), { recursive: true });
    writeFileSync(values.log, lines.join('\n') + '\n');
  }
  process.exit(failures === 0 ? 0 : 1);
}

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${url}${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${token ?? key}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}
const codeOf = (r) => r.body?.code ?? '-';
const detail = (r) => `HTTP ${r.status}, code ${codeOf(r)}`;
const rows = (r) => (Array.isArray(r.body) ? r.body : []);
const refused = (r) => r.status === 401 || r.status === 403 || codeOf(r) === '42501';
const rpc = (u, fn, args = {}) => call(`/rest/v1/rpc/${fn}`, { method: 'POST', token: u?.token, body: args });
const manage = (u, target, role, action, reason = 'smoke:admin') =>
  rpc(u, 'manage_user_role', { p_target: target?.id, p_role: role, p_action: action, p_reason: reason });
const rolesOf = async (u) => rows(await call(`/rest/v1/user_roles?select=role&user_id=eq.${u.id}`, { token: u.token })).map((r) => r.role).sort();

log(`YoChef live admin smoke  ${new Date().toISOString()}  target ${new URL(url).host}  ${Object.entries(creds).map(([w, c]) => `${w} ${mask(c.email)}`).join('  ')}`);

// --- Accounts -----------------------------------------------------------------------
const users = {};
for (const [who, c] of Object.entries(creds)) {
  const r = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: c.email, password: c.password } });
  users[who] = { token: r.body?.access_token, id: r.body?.user?.id };
  check(`${who} signs in`, r.status === 200 && !!users[who].token, `HTTP ${r.status}`);
}
const { A, M, S, E } = users;
if (!A.token || !M.token || !S.token || !E.token) finish();
check('S holds super_admin (bootstrapped by SQL)', (await rolesOf(S)).includes('super_admin'), (await rolesOf(S)).join(','));
check('M holds moderator', (await rolesOf(M)).includes('moderator'));

// Leftover of a failed run: E must not keep the temporary moderator role.
if ((await rolesOf(E)).includes('moderator')) await manage(S, E, 'moderator', 'revoke', 'smoke:admin cleanup');

// --- 4.1 Role management ---------------------------------------------------------------
const ensure = await manage(S, E, 'editor', 'assign', 'smoke:admin: tài khoản test biên tập');
check('S makes E an editor (or E already is)', ensure.status === 200 && typeof ensure.body === 'boolean', detail(ensure));
check('E now holds editor', (await rolesOf(E)).includes('editor'), (await rolesOf(E)).join(','));

for (const [who, u] of [['A', A], ['E', E], ['M', M]]) {
  const r = await manage(u, A, 'moderator', 'assign');
  check(`${who} cannot manage roles`, refused(r), detail(r));
}
const anon = await manage(null, A, 'moderator', 'assign');
check('anon cannot manage roles', refused(anon), detail(anon));
check('A gained no role from those attempts', (await rolesOf(A)).length === 0);

const give = await manage(S, E, 'moderator', 'assign', 'smoke:admin: thử gán');
check('S assigns moderator to E', give.status === 200 && give.body === true, detail(give));
check('E sees the new role', (await rolesOf(E)).includes('moderator'));
const take = await manage(S, E, 'moderator', 'revoke', 'smoke:admin: thử thu hồi');
check('S revokes it again', take.status === 200 && take.body === true, detail(take));
check('E no longer has it', !(await rolesOf(E)).includes('moderator'));

const noReason = await manage(S, E, 'moderator', 'assign', '   ');
check('a reason is required', codeOf(noReason) === '22023', detail(noReason));
const badAction = await rpc(S, 'manage_user_role', { p_target: E.id, p_role: 'moderator', p_action: 'promote', p_reason: 'x' });
check('an unknown action is refused', codeOf(badAction) === '22023', detail(badAction));
const self = await manage(S, S, 'super_admin', 'revoke', 'smoke:admin: tự gỡ');
check('S cannot revoke their own super_admin role', refused(self) && (await rolesOf(S)).includes('super_admin'), detail(self));

// --- Staff listing, lookup and audit log ---------------------------------------------
const staff = await rpc(S, 'list_staff');
const byId = new Map(rows(staff).map((p) => [p.user_id, p.roles]));
check(
  'S lists staff with their roles',
  staff.status === 200 && byId.get(S.id)?.includes('super_admin') && byId.get(E.id)?.includes('editor') && byId.get(M.id)?.includes('moderator') && !byId.has(A.id),
  detail(staff),
);
const lookup = await rpc(S, 'find_user_by_email', { p_email: creds.E.email.toUpperCase() });
check('S finds E by email (case-insensitive)', rows(lookup)[0]?.user_id === E.id, detail(lookup));
const logs = await rpc(S, 'list_admin_audit_logs', { p_limit: 5 });
const recent = rows(logs).filter((l) => l.target_id === E.id && l.actor_id === S.id).map((l) => `${l.action}:${l.details?.role}:${l.reason}`);
check(
  'the audit log records the assign and the revoke, newest first',
  recent[0] === 'role.revoke:moderator:smoke:admin: thử thu hồi' && recent[1] === 'role.assign:moderator:smoke:admin: thử gán',
  `${detail(logs)}; ${recent.slice(0, 2).join(' | ')}`,
);
for (const [who, u] of [['A', A], ['E', E], ['M', M]]) {
  const results = await Promise.all([
    rpc(u, 'list_staff'),
    rpc(u, 'find_user_by_email', { p_email: creds.S.email }),
    rpc(u, 'list_admin_audit_logs'),
  ]);
  check(`${who} cannot list staff, look up users or read the audit log`, results.every(refused), results.map(detail).join('; '));
}
const directLog = await call('/rest/v1/admin_audit_logs?select=id&limit=1', { token: S.token });
check('nobody reads admin_audit_logs directly, not even S', refused(directLog), detail(directLog));
const directRole = await call('/rest/v1/user_roles', { method: 'POST', token: S.token, body: { user_id: A.id, role: 'editor' } });
check('nobody writes user_roles directly, not even S', refused(directRole), detail(directRole));

finish();
