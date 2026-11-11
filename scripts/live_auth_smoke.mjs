#!/usr/bin/env node
// Live auth check (Phase 1, tier 3): a REAL user on v2, publishable key only.
// Proves what PGlite cannot: GoTrue sign-up/sign-in, the profile trigger on
// the real auth.users, get_my_profile(), RLS/grants as `authenticated`, the
// avatars bucket policies, and sign-out revoking the refresh token.
//
//   npm run smoke:auth -- --signup     create the test user once (then confirm the email if asked)
//   npm run smoke:auth                 run the checks as that user
//
// Needs app/.env (URL + publishable key) and SMOKE_EMAIL / SMOKE_PASSWORD,
// read from .env.smoke at the repo root (git-ignored) or the environment.
// Use a dedicated test mailbox, never a staff account.
//
// Writes it makes, all on the test user's own data and all reverted:
// bio is set then restored; avatar_path is set then restored; one 1x1 PNG is
// uploaded to avatars/<test user id>/ then deleted. Probes against other
// users carry values that fail a CHECK, so even broken RLS cannot change them.
// Never prints the key, the password or the full email.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { log: { type: 'string' }, signup: { type: 'boolean', default: false } } });

const url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
const email = (process.env.SMOKE_EMAIL ?? '').trim().toLowerCase();
const password = process.env.SMOKE_PASSWORD ?? '';

function refuse(msg) {
  console.error(`live_auth_smoke: ${msg}`);
  process.exit(2);
}
if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url)) refuse('EXPO_PUBLIC_SUPABASE_URL missing or not https://<ref>.supabase.co');
if (!key) refuse('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY missing');
if (key.startsWith('sb_secret_')) refuse('a secret key was supplied; only the publishable key is allowed');
if (key.startsWith('eyJ')) {
  let role = null;
  try {
    role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role;
  } catch {
    refuse('unreadable JWT key');
  }
  if (role !== 'anon') refuse(`JWT key has role "${role}"; only the anon/publishable key is allowed`);
}
if (!email || !password) refuse('SMOKE_EMAIL and SMOKE_PASSWORD are required (put them in .env.smoke at the repo root)');

const maskedEmail = email.replace(/^(.)[^@]*(@.*)$/, '$1***$2');
const short = (id) => (id ? `${id.slice(0, 8)}…` : String(id));

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
  log(`${failures === 0 ? 'ALL PASS' : `${failures} FAILED`}`);
  if (values.log) {
    mkdirSync(dirname(values.log), { recursive: true });
    writeFileSync(values.log, lines.join('\n') + '\n');
  }
  process.exit(failures === 0 ? 0 : 1);
}

async function call(path, { method = 'GET', token, headers = {}, body } = {}) {
  const res = await fetch(`${url}${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${token ?? key}`, ...headers },
    body,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json, headers: res.headers };
}
const jsonBody = (o) => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) });

log(`YoChef live auth smoke  ${new Date().toISOString()}  target ${new URL(url).host}  user ${maskedEmail}`);

// --- One-time sign-up ----------------------------------------------------------
if (values.signup) {
  const r = await call('/auth/v1/signup', {
    method: 'POST',
    ...jsonBody({ email, password, data: { display_name: 'YoChef Smoke' } }),
  });
  const session = r.body?.access_token;
  check('sign-up accepted', r.status === 200, `HTTP ${r.status}${r.body?.error_code ? `, ${r.body.error_code}` : ''}`);
  if (r.status === 200) {
    log(
      session
        ? 'INFO  email confirmation is OFF: a session came back. Run `npm run smoke:auth` now.'
        : 'INFO  email confirmation is ON: open the confirmation mail for this address, then run `npm run smoke:auth`.',
    );
  }
  finish();
}

// --- Sign in -----------------------------------------------------------------
const signIn = await call('/auth/v1/token?grant_type=password', { method: 'POST', ...jsonBody({ email, password }) });
const token = signIn.body?.access_token;
const refreshToken = signIn.body?.refresh_token;
const user = signIn.body?.user;
check(
  'sign in with email and password',
  signIn.status === 200 && !!token && user?.email === email,
  `HTTP ${signIn.status}${signIn.body?.error_code ? `, ${signIn.body.error_code}` : ''}`,
);
if (!token) {
  log('INFO  cannot continue without a session (run with --signup first, and confirm the email if required)');
  finish();
}
const uid = user.id;
log(`INFO  user id ${short(uid)}`);

const me = await call('/auth/v1/user', { token });
check('session is valid for /auth/v1/user', me.status === 200 && me.body?.id === uid, `HTTP ${me.status}`);

const roleClaim = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).role;
check('access token role is authenticated', roleClaim === 'authenticated', `role ${roleClaim}`);

// --- Profile created by the trigger, read through get_my_profile() ------------
const mine = await call('/rest/v1/rpc/get_my_profile', { method: 'POST', token, ...jsonBody({}) });
const profile = Array.isArray(mine.body) ? mine.body[0] : null;
check(
  'trigger created the profile; get_my_profile returns only my row',
  mine.status === 200 && Array.isArray(mine.body) && mine.body.length === 1 && profile?.id === uid,
  `HTTP ${mine.status}, rows ${Array.isArray(mine.body) ? mine.body.length : 'n/a'}`,
);
check('profile row has bio column for the owner', profile ? 'bio' in profile : false);

const anonRpc = await call('/rest/v1/rpc/get_my_profile', { method: 'POST', ...jsonBody({}) });
check('anon cannot call get_my_profile', anonRpc.status === 401 || anonRpc.status === 403 || anonRpc.status === 404, `HTTP ${anonRpc.status}, code ${anonRpc.body?.code}`);

const bioDirect = await call(`/rest/v1/profiles?select=bio&id=eq.${uid}`, { token });
check('profiles.bio is not selectable even by its owner', bioDirect.body?.code === '42501', `HTTP ${bioDirect.status}, code ${bioDirect.body?.code}`);

const pub = await call(`/rest/v1/profiles?select=id,display_name,avatar_path&id=eq.${uid}`, { token });
check('own public profile columns readable', pub.status === 200 && pub.body?.[0]?.id === uid, `HTTP ${pub.status}`);

// --- Owner update (reverted) ---------------------------------------------------
const originalBio = profile?.bio ?? null;
const originalAvatar = profile?.avatar_path ?? null;
const marker = `smoke ${Date.now()}`;
const patchMine = (patch) =>
  call(`/rest/v1/profiles?id=eq.${uid}&select=id`, {
    method: 'PATCH',
    token,
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  });

const upd = await patchMine({ bio: marker });
const reread = await call('/rest/v1/rpc/get_my_profile', { method: 'POST', token, ...jsonBody({}) });
check('owner can update own bio', upd.status === 200 && upd.body?.length === 1 && reread.body?.[0]?.bio === marker, `HTTP ${upd.status}`);
const restore = await patchMine({ bio: originalBio });
check('bio restored', restore.status === 200 && restore.body?.length === 1, `HTTP ${restore.status}`);

// Other users: a 51-char display_name fails the CHECK, so broken RLS would
// surface as 23514 instead of silently changing anyone.
const others = await call(`/rest/v1/profiles?id=neq.${uid}&select=id`, {
  method: 'PATCH',
  token,
  headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
  body: JSON.stringify({ display_name: 'x'.repeat(51) }),
});
check('cannot update other users’ profiles (RLS)', others.status === 200 && Array.isArray(others.body) && others.body.length === 0, `HTTP ${others.status}, code ${others.body?.code ?? '-'}`);

const insert = await call('/rest/v1/profiles', {
  method: 'POST',
  token,
  headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
  body: JSON.stringify({ id: uid, display_name: 'x'.repeat(51) }),
});
check('cannot insert profiles from the client', insert.body?.code === '42501', `HTTP ${insert.status}, code ${insert.body?.code}`);

const delOwn = await call(`/rest/v1/profiles?id=eq.00000000-0000-0000-0000-000000000000`, { method: 'DELETE', token });
check('cannot delete profiles from the client', delOwn.body?.code === '42501', `HTTP ${delOwn.status}, code ${delOwn.body?.code}`);

const roles = await call('/rest/v1/user_roles?select=role', { token });
check('a new user has no staff role', roles.status === 200 && Array.isArray(roles.body) && roles.body.length === 0, `HTTP ${roles.status}`);

const grant = await call('/rest/v1/user_roles', {
  method: 'POST',
  token,
  headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
  body: JSON.stringify({ user_id: uid, role: 'not_a_role' }),
});
check('cannot grant self a role', grant.body?.code === '42501', `HTTP ${grant.status}, code ${grant.body?.code}`);

// --- Avatars bucket ----------------------------------------------------------------
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const avatarPath = `${uid}/smoke-${Date.now()}.png`;
const upload = await call(`/storage/v1/object/avatars/${avatarPath}`, {
  method: 'POST',
  token,
  headers: { 'Content-Type': 'image/png', 'x-upsert': 'false' },
  body: PNG,
});
check('upload own avatar into <user id>/', upload.status === 200, `HTTP ${upload.status}`);

const publicGet = await fetch(`${url}/storage/v1/object/public/avatars/${avatarPath}`);
await publicGet.arrayBuffer();
check('avatar served publicly', publicGet.status === 200 && publicGet.headers.get('content-type') === 'image/png', `HTTP ${publicGet.status} ${publicGet.headers.get('content-type')}`);

const foreign = await call(`/storage/v1/object/avatars/00000000-0000-0000-0000-000000000000/smoke.png`, {
  method: 'POST',
  token,
  headers: { 'Content-Type': 'image/png' },
  body: PNG,
});
check('cannot upload into another user folder', foreign.status >= 400, `HTTP ${foreign.status}`);

const anonUpload = await call(`/storage/v1/object/avatars/${uid}/anon-smoke.png`, {
  method: 'POST',
  headers: { 'Content-Type': 'image/png' },
  body: PNG,
});
check('anon cannot upload avatars', anonUpload.status >= 400, `HTTP ${anonUpload.status}`);

const wrongType = await call(`/storage/v1/object/avatars/${uid}/smoke-${Date.now()}.txt`, {
  method: 'POST',
  token,
  headers: { 'Content-Type': 'text/plain' },
  body: 'not an image',
});
check('bucket rejects non-image types', wrongType.status >= 400, `HTTP ${wrongType.status}`);

const setAvatar = await patchMine({ avatar_path: avatarPath });
check('avatar_path set to own file', setAvatar.status === 200 && setAvatar.body?.length === 1, `HTTP ${setAvatar.status}`);
const badAvatar = await patchMine({ avatar_path: '00000000-0000-0000-0000-000000000000/x.png' });
check('avatar_path outside own folder rejected by CHECK', badAvatar.body?.code === '23514', `HTTP ${badAvatar.status}, code ${badAvatar.body?.code}`);
const restoreAvatar = await patchMine({ avatar_path: originalAvatar });
check('avatar_path restored', restoreAvatar.status === 200 && restoreAvatar.body?.length === 1, `HTTP ${restoreAvatar.status}`);

const remove = await call(`/storage/v1/object/avatars/${avatarPath}`, { method: 'DELETE', token });
check('owner deletes own avatar file', remove.status === 200, `HTTP ${remove.status}`);

// --- Sign out --------------------------------------------------------------------
const logout = await call('/auth/v1/logout?scope=local', { method: 'POST', token });
check('sign out', logout.status === 204, `HTTP ${logout.status}`);
const refresh = await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', ...jsonBody({ refresh_token: refreshToken }) });
check('refresh token revoked after sign out', refresh.status >= 400 && !refresh.body?.access_token, `HTTP ${refresh.status}`);

finish();
