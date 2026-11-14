#!/usr/bin/env node
// Live user-features check (Phase 3, tier 3): two REAL users on v2, publishable
// key only. User A acts; user B and anon must not reach A's data.
//
//   npm run smoke:user
//
// Needs app/.env (URL + publishable key) and, in .env.smoke at the repo root
// (git-ignored): SMOKE_EMAIL / SMOKE_PASSWORD (user A, the smoke:auth user) and
// SMOKE_EMAIL_B / SMOKE_PASSWORD_B (user B). Use test accounts, never staff.
//
// Every row the script creates belongs to A or B and is removed again, also
// leftovers from an earlier failed run. Never prints the key, a password or a
// full email.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

import { OLD_REF, V2_URL } from './lib/v2.mjs';

const { values } = parseArgs({ options: { log: { type: 'string' } } });

const url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

function refuse(msg) {
  console.error(`live_user_smoke: ${msg}`);
  process.exit(2);
}
if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url)) refuse('EXPO_PUBLIC_SUPABASE_URL missing or not https://<ref>.supabase.co');
if (url.includes(OLD_REF)) refuse(`URL points to the old project ${OLD_REF} (read-only reference); YoChef v2 is ${V2_URL}`);
if (url !== V2_URL) refuse(`URL must be the YoChef v2 project ${V2_URL}`);
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

const credentials = (suffix) => ({
  email: (process.env[`SMOKE_EMAIL${suffix}`] ?? '').trim().toLowerCase(),
  password: process.env[`SMOKE_PASSWORD${suffix}`] ?? '',
});
const credA = credentials('');
const credB = credentials('_B');
if (!credA.email || !credA.password) refuse('SMOKE_EMAIL and SMOKE_PASSWORD (user A) are required in .env.smoke');
if (!credB.email || !credB.password) refuse('SMOKE_EMAIL_B and SMOKE_PASSWORD_B (user B) are required in .env.smoke');
if (credA.email === credB.email) refuse('user A and user B must be different accounts');

const mask = (email) => email.replace(/^(.)[^@]*(@.*)$/, '$1***$2');
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
  log(failures === 0 ? 'ALL PASS' : `${failures} FAILED`);
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
  return { status: res.status, body: json };
}
const JSON_HEADERS = { 'Content-Type': 'application/json' };
const returning = { ...JSON_HEADERS, Prefer: 'return=representation' };
const codeOf = (r) => r.body?.code ?? '-';
const detail = (r) => `HTTP ${r.status}, code ${codeOf(r)}`;
const rows = (r) => (Array.isArray(r.body) ? r.body : []);
/** A write the database refused: RLS / grant (42501), or a PostgREST 401/403. */
const refused = (r) => r.status === 401 || r.status === 403 || codeOf(r) === '42501';

async function signIn({ email, password }) {
  const r = await call('/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ email, password }),
  });
  return { status: r.status, token: r.body?.access_token, id: r.body?.user?.id };
}

log(`YoChef live user smoke  ${new Date().toISOString()}  target ${new URL(url).host}  A ${mask(credA.email)}  B ${mask(credB.email)}`);

// --- Accounts ---------------------------------------------------------------------
const A = await signIn(credA);
const B = await signIn(credB);
check('user A signs in', A.status === 200 && !!A.token, `HTTP ${A.status}`);
check('user B signs in', B.status === 200 && !!B.token, `HTTP ${B.status}`);
if (!A.token || !B.token) finish();
check('A and B are different users', A.id !== B.id, `A ${short(A.id)}, B ${short(B.id)}`);

const pub = await call('/rest/v1/recipes?select=id,slug&status=eq.published&order=slug&limit=1');
const recipe = rows(pub)[0];
check('a published recipe to work with', pub.status === 200 && !!recipe?.id, `HTTP ${pub.status}`);
if (!recipe) finish();
log(`INFO  recipe ${recipe.slug}`);
const MISSING_RECIPE = '00000000-0000-0000-0000-000000000000';

// --- 3.1 Favorites ----------------------------------------------------------------
{
  const mine = `/rest/v1/favorites?user_id=eq.${A.id}&recipe_id=eq.${recipe.id}`;
  await call(mine, { method: 'DELETE', token: A.token }); // leftover from an earlier run

  const anonRead = await call('/rest/v1/favorites?select=recipe_id');
  check('anon cannot read favorites', refused(anonRead), detail(anonRead));

  const add = await call('/rest/v1/favorites', {
    method: 'POST',
    token: A.token,
    headers: returning,
    body: JSON.stringify({ user_id: A.id, recipe_id: recipe.id }),
  });
  check('A adds a favorite', add.status === 201 && rows(add).length === 1, detail(add));

  const list = await call(`/rest/v1/favorites?select=recipe_id,recipe:recipes(slug)&user_id=eq.${A.id}`, { token: A.token });
  check(
    'A lists it with the recipe embedded',
    list.status === 200 && rows(list).some((f) => f.recipe?.slug === recipe.slug),
    detail(list),
  );

  const again = await call('/rest/v1/favorites', {
    method: 'POST',
    token: A.token,
    headers: JSON_HEADERS,
    body: JSON.stringify({ user_id: A.id, recipe_id: recipe.id }),
  });
  check('a duplicate favorite is rejected', codeOf(again) === '23505', detail(again));

  const bRead = await call(`/rest/v1/favorites?select=recipe_id&user_id=eq.${A.id}`, { token: B.token });
  check('B cannot see A favorites', bRead.status === 200 && rows(bRead).length === 0, detail(bRead));

  const bDelete = await call(mine, { method: 'DELETE', token: B.token, headers: returning });
  check('B cannot delete A favorite', bDelete.status === 200 && rows(bDelete).length === 0, detail(bDelete));

  const bInsert = await call('/rest/v1/favorites', {
    method: 'POST',
    token: B.token,
    headers: JSON_HEADERS,
    body: JSON.stringify({ user_id: A.id, recipe_id: recipe.id }),
  });
  check('B cannot add a favorite as A', refused(bInsert), detail(bInsert));

  const unknown = await call('/rest/v1/favorites', {
    method: 'POST',
    token: A.token,
    headers: JSON_HEADERS,
    body: JSON.stringify({ user_id: A.id, recipe_id: MISSING_RECIPE }),
  });
  check('only a published recipe can be a favorite', refused(unknown), detail(unknown));

  const anonInsert = await call('/rest/v1/favorites', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ user_id: A.id, recipe_id: recipe.id }),
  });
  check('anon cannot add favorites', refused(anonInsert), detail(anonInsert));

  const remove = await call(mine, { method: 'DELETE', token: A.token, headers: returning });
  check('A removes the favorite', remove.status === 200 && rows(remove).length === 1, detail(remove));
}

finish();
