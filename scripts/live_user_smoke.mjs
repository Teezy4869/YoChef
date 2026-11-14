#!/usr/bin/env node
// Live user-features check (Phase 3, tier 3): two REAL users on v2, publishable
// key only. User A acts; user B and anon must not reach A's data.
//
//   npm run smoke:user
//
// Needs app/.env (URL + publishable key) and, in .env.smoke at the repo root
// (git-ignored): SMOKE_EMAIL / SMOKE_PASSWORD (user A, the smoke:auth user) and
// SMOKE_EMAIL_B / SMOKE_PASSWORD_B (user B). Use test accounts, never real staff.
// From step 3.6 also SMOKE_EMAIL_MOD / SMOKE_PASSWORD_MOD: user M, a test account
// whose only role is moderator; without it the moderation part fails.
//
// Every row the script creates belongs to A or B and is removed again, also
// leftovers from an earlier failed run. M only changes statuses of those rows;
// the moderation history it leaves behind is append-only by design. Never prints the key, a password or a
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
const credM = credentials('_MOD');
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

// --- 3.2 Shopping lists ---------------------------------------------------------
{
  const NAME = 'YoChef smoke list';
  const post = (path, token, body) =>
    call(path, { method: 'POST', token, headers: returning, body: JSON.stringify(body) });
  const patch = (path, token, body) =>
    call(path, { method: 'PATCH', token, headers: returning, body: JSON.stringify(body) });
  // Leftover from an earlier run (its items go with it).
  await call(`/rest/v1/shopping_lists?user_id=eq.${A.id}&name=eq.${encodeURIComponent(NAME)}`, { method: 'DELETE', token: A.token });

  const anonRead = await call('/rest/v1/shopping_lists?select=id');
  check('anon cannot read shopping lists', refused(anonRead), detail(anonRead));

  const created = await post('/rest/v1/shopping_lists', A.token, { user_id: A.id, name: NAME, source_recipe_id: recipe.id });
  const list = rows(created)[0];
  check('A creates a list from a published recipe', created.status === 201 && !!list?.id, detail(created));
  if (!list) finish();

  const plain = await post('/rest/v1/shopping_lists', A.token, { user_id: A.id });
  const plainList = rows(plain)[0];
  check('a list without a name gets the default name', plainList?.name === 'Danh sách mua sắm', detail(plain));

  const items = await post('/rest/v1/shopping_list_items', A.token, [
    // A bulk insert needs the same keys in every row (PostgREST PGRST102), as the app sends them.
    { shopping_list_id: list.id, label: 'Thịt bò', quantity: 500, unit: 'g', note: null, sort_order: 0 },
    { shopping_list_id: list.id, label: 'Muối', quantity: null, unit: null, note: 'vừa ăn', sort_order: 1 },
  ]);
  check('A adds items, NULL quantity allowed', items.status === 201 && rows(items).length === 2, detail(items));
  const item = rows(items)[0];

  const zero = await post('/rest/v1/shopping_list_items', A.token, { shopping_list_id: list.id, label: 'x', quantity: 0 });
  check('quantity 0 is rejected', codeOf(zero) === '23514', detail(zero));
  const blank = await post('/rest/v1/shopping_list_items', A.token, { shopping_list_id: list.id, label: '  ' });
  check('a blank label is rejected', codeOf(blank) === '23514', detail(blank));

  const tick = await patch(`/rest/v1/shopping_list_items?id=eq.${item?.id}`, A.token, { is_checked: true });
  check('A ticks an item', tick.status === 200 && rows(tick)[0]?.is_checked === true, detail(tick));

  if (plainList) {
    const move = await patch(`/rest/v1/shopping_list_items?id=eq.${item?.id}`, A.token, { shopping_list_id: plainList.id });
    check('an item cannot move to another list', refused(move), detail(move));
    await call(`/rest/v1/shopping_lists?id=eq.${plainList.id}`, { method: 'DELETE', token: A.token });
  }
  const give = await patch(`/rest/v1/shopping_lists?id=eq.${list.id}`, A.token, { user_id: B.id });
  check('a list cannot be given to another user', refused(give), detail(give));

  const bLists = await call(`/rest/v1/shopping_lists?select=id&id=eq.${list.id}`, { token: B.token });
  const bItems = await call(`/rest/v1/shopping_list_items?select=id&shopping_list_id=eq.${list.id}`, { token: B.token });
  check('B cannot see A list or its items', rows(bLists).length === 0 && rows(bItems).length === 0 && bItems.status === 200, detail(bItems));

  const bTick = await patch(`/rest/v1/shopping_list_items?shopping_list_id=eq.${list.id}`, B.token, { is_checked: false });
  check('B cannot edit A items', bTick.status === 200 && rows(bTick).length === 0, detail(bTick));
  const bAdd = await post('/rest/v1/shopping_list_items', B.token, { shopping_list_id: list.id, label: 'Lén' });
  check('B cannot add items to A list', refused(bAdd), detail(bAdd));
  const bDelete = await call(`/rest/v1/shopping_list_items?shopping_list_id=eq.${list.id}`, { method: 'DELETE', token: B.token, headers: returning });
  check('B cannot delete A items', bDelete.status === 200 && rows(bDelete).length === 0, detail(bDelete));
  const bForge = await post('/rest/v1/shopping_lists', B.token, { user_id: A.id, name: NAME });
  check('B cannot create a list as A', refused(bForge), detail(bForge));
  const anonAdd = await post('/rest/v1/shopping_lists', null, { user_id: A.id, name: NAME });
  check('anon cannot create lists', refused(anonAdd), detail(anonAdd));

  const del = await call(`/rest/v1/shopping_lists?id=eq.${list.id}`, { method: 'DELETE', token: A.token, headers: returning });
  const after = await call(`/rest/v1/shopping_list_items?select=id&shopping_list_id=eq.${list.id}`, { token: A.token });
  check('A deletes the list and its items go with it', rows(del).length === 1 && after.status === 200 && rows(after).length === 0, detail(del));
}

// --- 3.3 Ratings --------------------------------------------------------------
{
  const ratingOf = (u) => `/rest/v1/ratings?user_id=eq.${u.id}&recipe_id=eq.${recipe.id}`;
  const summaryPath = `/rest/v1/recipe_rating_summary?select=rating_count,avg_score&recipe_id=eq.${recipe.id}`;
  const rate = (u, owner, score, recipeId = recipe.id) =>
    call('/rest/v1/ratings', {
      method: 'POST',
      token: u?.token,
      headers: returning,
      body: JSON.stringify({ user_id: owner.id, recipe_id: recipeId, score }),
    });
  for (const u of [A, B]) await call(ratingOf(u), { method: 'DELETE', token: u.token }); // leftovers

  const before = await call(summaryPath);
  const base = rows(before)[0] ?? null;
  check('anon reads the rating summary', before.status === 200, detail(before));
  const anonRows = await call(`/rest/v1/ratings?select=score&recipe_id=eq.${recipe.id}`);
  check('anon reads ratings of a published recipe', anonRows.status === 200, detail(anonRows));

  const a = await rate(A, A, 4);
  check('A rates the recipe', a.status === 201 && rows(a)[0]?.score === 4, detail(a));
  const dup = await rate(A, A, 2);
  check('a second rating by A is rejected', codeOf(dup) === '23505', detail(dup));
  const change = await call(ratingOf(A), { method: 'PATCH', token: A.token, headers: returning, body: JSON.stringify({ score: 5 }) });
  check('A changes the score', change.status === 200 && rows(change)[0]?.score === 5, detail(change));
  const b = await rate(B, B, 3);
  check('B rates the recipe', b.status === 201, detail(b));

  const after = rows(await call(summaryPath))[0];
  const count0 = base?.rating_count ?? 0;
  check('the summary counts both ratings', after?.rating_count === count0 + 2, `count ${count0} -> ${after?.rating_count}`);
  if (count0 === 0) check('the average is 4.0 for scores 5 and 3', Number(after?.avg_score) === 4, `avg ${after?.avg_score}`);

  for (const bad of [0, 6]) {
    const r = await call(ratingOf(A), { method: 'PATCH', token: A.token, headers: JSON_HEADERS, body: JSON.stringify({ score: bad }) });
    check(`score ${bad} is rejected`, codeOf(r) === '23514', detail(r));
  }
  const bEdit = await call(ratingOf(A), { method: 'PATCH', token: B.token, headers: returning, body: JSON.stringify({ score: 1 }) });
  check('B cannot change A score', bEdit.status === 200 && rows(bEdit).length === 0, detail(bEdit));
  const bDel = await call(ratingOf(A), { method: 'DELETE', token: B.token, headers: returning });
  check('B cannot remove A score', bDel.status === 200 && rows(bDel).length === 0, detail(bDel));
  const forge = await rate(B, A, 1, MISSING_RECIPE);
  check('B cannot rate as A', refused(forge), detail(forge));
  const move = await call(ratingOf(A), { method: 'PATCH', token: A.token, headers: JSON_HEADERS, body: JSON.stringify({ recipe_id: MISSING_RECIPE }) });
  check('a rating cannot move to another recipe', refused(move), detail(move));
  const unknown = await rate(A, A, 3, MISSING_RECIPE);
  check('only a published recipe can be rated', refused(unknown), detail(unknown));
  const anonRate = await rate(null, A, 3);
  check('anon cannot rate', refused(anonRate), detail(anonRate));

  const delA = await call(ratingOf(A), { method: 'DELETE', token: A.token, headers: returning });
  const delB = await call(ratingOf(B), { method: 'DELETE', token: B.token, headers: returning });
  check('A and B remove their scores', rows(delA).length === 1 && rows(delB).length === 1, `${detail(delA)}; ${detail(delB)}`);
}

// --- 3.4 Comments -------------------------------------------------------------
{
  const MARK = 'YoChef smoke'; // every comment the script posts starts with this
  // comments has column-level SELECT (3.6), so every read names its columns.
  const byId = (id) => `/rest/v1/comments?id=eq.${id}&select=id,status`;
  const post = (u, owner, content, extra = {}) =>
    call('/rest/v1/comments?select=id,status', {
      method: 'POST',
      token: u?.token,
      headers: returning,
      body: JSON.stringify({ user_id: owner.id, recipe_id: recipe.id, content, ...extra }),
    });
  const patch = (u, id, body) => call(byId(id), { method: 'PATCH', token: u?.token, headers: returning, body: JSON.stringify(body) });
  for (const u of [A, B]) {
    await call(`/rest/v1/comments?user_id=eq.${u.id}&content=like.${encodeURIComponent(MARK)}*`, { method: 'DELETE', token: u.token }); // leftovers
  }

  const created = await post(A, A, `${MARK}: ngon`);
  const c = rows(created)[0];
  check('A posts a comment and it waits for review', created.status === 201 && c?.status === 'pending', detail(created));
  if (!c) finish();
  const readA = await call(`/rest/v1/comments?id=eq.${c.id}&select=id,status,author:profiles!comments_user_id_fkey(display_name)`, { token: A.token });
  check('A reads it back with the author embed', readA.status === 200 && rows(readA).length === 1 && 'author' in (rows(readA)[0] ?? {}), detail(readA));
  const readB = await call(byId(c.id), { token: B.token });
  check('B does not see A pending comment', readB.status === 200 && rows(readB).length === 0, detail(readB));
  const readAnon = await call(byId(c.id));
  check('anon does not see A pending comment', readAnon.status === 200 && rows(readAnon).length === 0, detail(readAnon));

  const forged = await post(A, A, `${MARK}: tự duyệt`, { status: 'approved' });
  check('a new comment cannot choose its status', refused(forged), detail(forged));
  const restatus = await patch(A, c.id, { status: 'approved' });
  check('A cannot change the status', refused(restatus), detail(restatus));
  const edit = await patch(A, c.id, { content: `${MARK}: hơi mặn` });
  check('A edits the content, still pending', edit.status === 200 && rows(edit)[0]?.status === 'pending', detail(edit));

  const bEdit = await patch(B, c.id, { content: `${MARK}: B sửa` });
  check('B cannot edit A comment', bEdit.status === 200 && rows(bEdit).length === 0, detail(bEdit));
  const bDel = await call(byId(c.id), { method: 'DELETE', token: B.token, headers: returning });
  check('B cannot remove A comment', bDel.status === 200 && rows(bDel).length === 0, detail(bDel));
  const asA = await post(B, A, `${MARK}: giả danh`);
  check('B cannot comment as A', refused(asA), detail(asA));
  const anonPost = await post(null, A, `${MARK}: khách`);
  check('anon cannot comment', refused(anonPost), detail(anonPost));
  const unknown = await post(A, A, `${MARK}: không có món`, { recipe_id: MISSING_RECIPE });
  check('only a published recipe can be commented on', refused(unknown), detail(unknown));
  for (const [name, content] of [['a blank comment', '   '], ['a comment over 1000 characters', `${MARK}: ${'a'.repeat(1000)}`]]) {
    const r = await post(A, A, content);
    check(`${name} is rejected`, codeOf(r) === '23514', detail(r));
  }

  const del = await call(byId(c.id), { method: 'DELETE', token: A.token, headers: returning });
  check('A removes the comment', rows(del).length === 1, detail(del));
}

// --- 3.5 Cooking photos ---------------------------------------------------------
{
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );
  const BUCKET = '/storage/v1/object/cooking-photos';
  const upload = (u, path, type = 'image/png', body = PNG) =>
    call(`${BUCKET}/${path}`, { method: 'POST', token: u?.token, headers: { 'Content-Type': type, 'x-upsert': 'false' }, body });
  const sign = (u, path) =>
    call(`/storage/v1/object/sign/cooking-photos/${path}`, {
      method: 'POST',
      token: u?.token,
      headers: JSON_HEADERS,
      body: JSON.stringify({ expiresIn: 60 }),
    });
  const rowOf = (path) => `/rest/v1/cooking_photos?storage_path=eq.${encodeURIComponent(path)}&select=id,status`;
  const addRow = (u, owner, path, extra = {}) =>
    call('/rest/v1/cooking_photos?select=id,status', {
      method: 'POST',
      token: u?.token,
      headers: returning,
      body: JSON.stringify({ user_id: owner.id, recipe_id: recipe.id, storage_path: path, ...extra }),
    });
  // Leftovers of an earlier run: rows first, then files.
  await call(`/rest/v1/cooking_photos?user_id=eq.${A.id}&storage_path=like.${encodeURIComponent(`${A.id}/smoke-`)}*`, {
    method: 'DELETE',
    token: A.token,
  });
  const old = await call('/storage/v1/object/list/cooking-photos', {
    method: 'POST',
    token: A.token,
    headers: JSON_HEADERS,
    body: JSON.stringify({ prefix: `${A.id}/`, search: 'smoke-' }),
  });
  const leftovers = rows(old).map((o) => `${A.id}/${o.name}`);
  if (leftovers.length) {
    await call(BUCKET, { method: 'DELETE', token: A.token, headers: JSON_HEADERS, body: JSON.stringify({ prefixes: leftovers }) });
  }

  const path = `${A.id}/smoke-${Date.now()}.png`;
  const up = await upload(A, path);
  check('A uploads a photo into own folder', up.status === 200, detail(up));
  const foreign = await upload(A, `${B.id}/smoke-${Date.now()}.png`);
  check('A cannot upload into B folder', foreign.status >= 400, detail(foreign));
  const anonUp = await upload(null, `${A.id}/smoke-anon.png`);
  check('anon cannot upload a photo', anonUp.status >= 400, detail(anonUp));
  const text = await upload(A, `${A.id}/smoke-${Date.now()}.txt`, 'text/plain', 'not an image');
  check('the bucket rejects a non-image file', text.status >= 400, detail(text));

  const row = await addRow(A, A, path);
  check('A adds the photo row and it waits for review', row.status === 201 && rows(row)[0]?.status === 'pending', detail(row));
  const signedA = await sign(A, path);
  const file = signedA.body?.signedURL ? await fetch(`${url}/storage/v1${signedA.body.signedURL}`) : null;
  if (file) await file.arrayBuffer();
  check(
    'A gets a signed URL that serves the file',
    signedA.status === 200 && file?.status === 200 && file.headers.get('content-type') === 'image/png',
    `sign HTTP ${signedA.status}, file HTTP ${file?.status} ${file?.headers.get('content-type')}`,
  );
  const signedB = await sign(B, path);
  check('B cannot sign A pending photo', signedB.status >= 400 && !signedB.body?.signedURL, detail(signedB));
  const signedAnon = await sign(null, path);
  check('anon cannot sign A pending photo', signedAnon.status >= 400 && !signedAnon.body?.signedURL, detail(signedAnon));
  const readB = await call(rowOf(path), { token: B.token });
  check('B does not see A pending photo row', readB.status === 200 && rows(readB).length === 0, detail(readB));

  const outside = await addRow(A, A, `${B.id}/smoke-x.png`);
  check('a row pointing outside own folder is rejected', codeOf(outside) === '23514', detail(outside));
  const forged = await addRow(A, A, `${A.id}/smoke-forged.png`, { status: 'approved' });
  check('a new photo cannot choose its status', refused(forged), detail(forged));
  const restatus = await call(rowOf(path), { method: 'PATCH', token: A.token, headers: returning, body: JSON.stringify({ status: 'approved' }) });
  check('A cannot change the status', refused(restatus), detail(restatus));

  const early = await call(`${BUCKET}/${path}`, { method: 'DELETE', token: A.token });
  const stillThere = await sign(A, path);
  check('A cannot remove the file while its row exists', early.status >= 400 && stillThere.status === 200, `${detail(early)}; sign HTTP ${stillThere.status}`);
  const bDel = await call(rowOf(path), { method: 'DELETE', token: B.token, headers: returning });
  check('B cannot remove A photo row', bDel.status === 200 && rows(bDel).length === 0, detail(bDel));

  const delRow = await call(rowOf(path), { method: 'DELETE', token: A.token, headers: returning });
  check('A removes the row first', rows(delRow).length === 1, detail(delRow));
  const delFile = await call(`${BUCKET}/${path}`, { method: 'DELETE', token: A.token });
  const gone = await sign(A, path);
  check('then the file, which is gone', delFile.status === 200 && gone.status >= 400, `${detail(delFile)}; sign HTTP ${gone.status}`);
}

// --- 3.6 Moderation ------------------------------------------------------------
{
  const M = credM.email && credM.password ? await signIn(credM) : null;
  check('moderator M is configured and signs in', M?.status === 200 && !!M?.token, M ? `HTTP ${M.status}` : 'SMOKE_EMAIL_MOD / SMOKE_PASSWORD_MOD missing');
  if (!M?.token) finish();
  check('M is neither A nor B', M.id !== A.id && M.id !== B.id, `M ${short(M.id)}`);
  const roles = await call(`/rest/v1/user_roles?select=role&user_id=eq.${M.id}`, { token: M.token });
  check('M has the moderator role', rows(roles).some((r) => r.role === 'moderator'), detail(roles));

  const MARK = 'YoChef smoke moderation';
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );
  const moderate = (u, table, id, status, reason = null) =>
    call('/rest/v1/rpc/moderate_community_content', {
      method: 'POST',
      token: u?.token,
      headers: JSON_HEADERS,
      body: JSON.stringify({ p_table: table, p_id: id, p_status: status, p_reason: reason }),
    });
  const commentPath = (id) => `/rest/v1/comments?id=eq.${id}&select=id,status`;
  const photoPath = (id) => `/rest/v1/cooking_photos?id=eq.${id}&select=id,status`;
  const filePath = (path) => `/storage/v1/object/cooking-photos/${path}`;
  const sign = (u, path) =>
    call(`/storage/v1/object/sign/cooking-photos/${path}`, {
      method: 'POST',
      token: u?.token,
      headers: JSON_HEADERS,
      body: JSON.stringify({ expiresIn: 60 }),
    });

  // Leftovers of an earlier failed run: M reopens rejected ones so A can remove them.
  const like = encodeURIComponent(MARK);
  const oldC = await call(`/rest/v1/comments?select=id,status&user_id=eq.${A.id}&content=like.${like}*`, { token: M.token });
  for (const c of rows(oldC)) {
    if (c.status === 'rejected') await moderate(M, 'comments', c.id, 'pending');
    await call(`/rest/v1/comments?id=eq.${c.id}`, { method: 'DELETE', token: A.token });
  }
  const oldP = await call(`/rest/v1/cooking_photos?select=id,status,storage_path&user_id=eq.${A.id}&caption=like.${like}*`, { token: M.token });
  for (const p of rows(oldP)) {
    if (p.status === 'rejected') await moderate(M, 'cooking_photos', p.id, 'pending');
    await call(`/rest/v1/cooking_photos?id=eq.${p.id}`, { method: 'DELETE', token: A.token });
    await call(filePath(p.storage_path), { method: 'DELETE', token: A.token });
  }

  // A posts one comment and one photo; both wait for review.
  const posted = await call('/rest/v1/comments?select=id,status', {
    method: 'POST',
    token: A.token,
    headers: returning,
    body: JSON.stringify({ user_id: A.id, recipe_id: recipe.id, content: `${MARK}: ngon` }),
  });
  const comment = rows(posted)[0];
  const path = `${A.id}/smoke-mod-${Date.now()}.png`;
  const up = await call(filePath(path), { method: 'POST', token: A.token, headers: { 'Content-Type': 'image/png', 'x-upsert': 'false' }, body: PNG });
  const added = await call('/rest/v1/cooking_photos?select=id,status', {
    method: 'POST',
    token: A.token,
    headers: returning,
    body: JSON.stringify({ user_id: A.id, recipe_id: recipe.id, storage_path: path, caption: `${MARK}: ảnh` }),
  });
  const photo = rows(added)[0];
  check(
    'A posts a comment and a photo for review',
    comment?.status === 'pending' && up.status === 200 && photo?.status === 'pending',
    `${detail(posted)}; upload HTTP ${up.status}; ${detail(added)}`,
  );
  if (!comment || !photo) finish();

  const queue = await call(`/rest/v1/comments?select=id&status=eq.pending&id=eq.${comment.id}`, { token: M.token });
  check('M sees the pending comment in the queue', rows(queue).length === 1, detail(queue));
  const byA = await moderate(A, 'comments', comment.id, 'approved');
  check('A cannot moderate', refused(byA), detail(byA));
  const byAnon = await moderate(null, 'comments', comment.id, 'approved');
  check('anon cannot moderate', refused(byAnon), detail(byAnon));
  const bad = await moderate(M, 'comments', comment.id, 'deleted');
  check('an unknown status is rejected', codeOf(bad) === '22023', detail(bad));

  const okC = await moderate(M, 'comments', comment.id, 'approved');
  const okP = await moderate(M, 'cooking_photos', photo.id, 'approved', 'Ảnh rõ, đúng món');
  check('M approves the comment and the photo', okC.status === 200 && okC.body === 'approved' && okP.status === 200, `${detail(okC)}; ${detail(okP)}`);
  const anonC = await call(commentPath(comment.id));
  const bC = await call(commentPath(comment.id), { token: B.token });
  check('anon and B now see the comment', rows(anonC).length === 1 && rows(bC).length === 1, `${detail(anonC)}; ${detail(bC)}`);
  const anonSign = await sign(null, path);
  const bSign = await sign(B, path);
  check('anon and B can now sign the photo', anonSign.status === 200 && bSign.status === 200, `anon HTTP ${anonSign.status}, B HTTP ${bSign.status}`);
  const hidden = await call(`/rest/v1/comments?select=moderated_by&id=eq.${comment.id}`);
  check('nobody reads who moderated', refused(hidden), detail(hidden));

  const rejC = await moderate(M, 'comments', comment.id, 'rejected', 'Thử từ chối');
  const rejP = await moderate(M, 'cooking_photos', photo.id, 'rejected');
  check('M rejects both', rejC.status === 200 && rejP.status === 200, `${detail(rejC)}; ${detail(rejP)}`);
  const aC = await call(commentPath(comment.id), { token: A.token });
  const anonC2 = await call(commentPath(comment.id));
  check('A and anon no longer see the rejected comment', rows(aC).length === 0 && rows(anonC2).length === 0, `${detail(aC)}; ${detail(anonC2)}`);
  const aEdit = await call(commentPath(comment.id), { method: 'PATCH', token: A.token, headers: returning, body: JSON.stringify({ content: `${MARK}: sửa` }) });
  const aDel = await call(commentPath(comment.id), { method: 'DELETE', token: A.token, headers: returning });
  check('A can neither edit nor remove it', rows(aEdit).length === 0 && rows(aDel).length === 0, `${detail(aEdit)}; ${detail(aDel)}`);
  const aSign = await sign(A, path);
  const aFile = await call(filePath(path), { method: 'DELETE', token: A.token });
  check('A can neither open nor remove the rejected photo file', aSign.status >= 400 && aFile.status >= 400, `sign HTTP ${aSign.status}; delete HTTP ${aFile.status}`);

  const historyM = await call(
    `/rest/v1/moderation_actions?select=actor_id,from_status,to_status&target_id=eq.${comment.id}&order=created_at`,
    { token: M.token },
  );
  const steps = rows(historyM).map((h) => `${h.from_status}>${h.to_status}`).join(',');
  check(
    'every decision on the comment is recorded, by M',
    steps === 'pending>approved,approved>rejected' && rows(historyM).every((h) => h.actor_id === M.id),
    `${detail(historyM)}; ${steps}`,
  );
  const historyA = await call(`/rest/v1/moderation_actions?select=id&target_id=eq.${comment.id}`, { token: A.token });
  check('A reads no moderation history', historyA.status === 200 && rows(historyA).length === 0, detail(historyA));
  const forge = await call('/rest/v1/moderation_actions', {
    method: 'POST',
    token: M.token,
    headers: JSON_HEADERS,
    body: JSON.stringify({ actor_id: M.id, target_table: 'comments', target_id: comment.id, from_status: 'rejected', to_status: 'approved' }),
  });
  check('nobody writes the history directly, not even M', refused(forge), detail(forge));

  const back = await moderate(M, 'comments', comment.id, 'approved');
  const backP = await moderate(M, 'cooking_photos', photo.id, 'approved');
  const aBack = await call(commentPath(comment.id), { token: A.token });
  check('M restores both, and A sees the comment again', back.status === 200 && backP.status === 200 && rows(aBack).length === 1, `${detail(back)}; ${detail(aBack)}`);
  const edited = await call(commentPath(comment.id), { method: 'PATCH', token: A.token, headers: returning, body: JSON.stringify({ content: `${MARK}: sửa lại` }) });
  check('A edits the approved comment and it waits for review again', rows(edited)[0]?.status === 'pending', detail(edited));

  const cleanC = await call(commentPath(comment.id), { method: 'DELETE', token: A.token, headers: returning });
  const cleanP = await call(photoPath(photo.id), { method: 'DELETE', token: A.token, headers: returning });
  const cleanF = await call(filePath(path), { method: 'DELETE', token: A.token });
  check(
    'A removes the comment, the photo row and its file',
    rows(cleanC).length === 1 && rows(cleanP).length === 1 && cleanF.status === 200,
    `${detail(cleanC)}; ${detail(cleanP)}; file HTTP ${cleanF.status}`,
  );
}

// --- 4.2 Reports -------------------------------------------------------------------
// Report rows stay after the run: reporters cannot delete them and nobody else may,
// so each run leaves one resolved report pointing at a deleted comment.
{
  const M = await signIn(credM);
  const MARK = 'YoChef smoke report';
  const moderate = (u, id, status) =>
    call('/rest/v1/rpc/moderate_community_content', {
      method: 'POST',
      token: u?.token,
      headers: JSON_HEADERS,
      body: JSON.stringify({ p_table: 'comments', p_id: id, p_status: status, p_reason: null }),
    });
  const report = (u, body) =>
    call('/rest/v1/content_reports', { method: 'POST', token: u?.token, headers: JSON_HEADERS, body: JSON.stringify(body) });
  const workflow = (u, id, status, note) =>
    call('/rest/v1/rpc/update_report_workflow', {
      method: 'POST',
      token: u?.token,
      headers: JSON_HEADERS,
      body: JSON.stringify({ p_id: id, p_status: status, p_note: note }),
    });
  await call(`/rest/v1/comments?user_id=eq.${A.id}&content=like.${encodeURIComponent(MARK)}*`, { method: 'DELETE', token: A.token }); // leftovers

  const posted = await call('/rest/v1/comments?select=id', {
    method: 'POST',
    token: A.token,
    headers: returning,
    body: JSON.stringify({ user_id: A.id, recipe_id: recipe.id, content: `${MARK}: mua hàng giá rẻ tại…` }),
  });
  const c = rows(posted)[0];
  const approved = c ? await moderate(M, c.id, 'approved') : null;
  check('A posts a comment and M approves it', !!c && approved?.status === 200, `${detail(posted)}; ${approved ? detail(approved) : '-'}`);
  if (!c) finish();

  const target = { target_table: 'comments', target_id: c.id };
  const first = await report(B, { reporter_id: B.id, ...target, reason: 'spam', details: 'Quảng cáo' });
  check('B reports the comment', first.status === 201, detail(first));
  const again = await report(B, { reporter_id: B.id, ...target, reason: 'offensive' });
  check('a second report by B is rejected', codeOf(again) === '23505', detail(again));
  const readBack = await call(`/rest/v1/content_reports?select=id&target_id=eq.${c.id}`, { token: B.token });
  check('B cannot read the report back', readBack.status === 200 && rows(readBack).length === 0, detail(readBack));
  const own = await report(A, { reporter_id: A.id, ...target, reason: 'spam' });
  check('A cannot report their own comment', refused(own), detail(own));
  const anonReport = await report(null, { reporter_id: A.id, ...target, reason: 'spam' });
  check('anon cannot report', refused(anonReport), detail(anonReport));
  const forged = await report(M, { reporter_id: M.id, ...target, reason: 'spam', status: 'resolved' });
  check('a reporter cannot set the workflow status', refused(forged), detail(forged));
  const noDetails = await report(M, { reporter_id: M.id, ...target, reason: 'other' });
  check('"other" needs a description', codeOf(noDetails) === '23514', detail(noDetails));

  const seen = await call(`/rest/v1/content_reports?select=id,status,reason&target_id=eq.${c.id}`, { token: M.token });
  const r = rows(seen)[0];
  check('M reads the open report', r?.status === 'open' && r?.reason === 'spam', detail(seen));
  if (!r) finish();
  const byB = await workflow(B, r.id, 'dismissed', null);
  check('B cannot work on reports', refused(byB), detail(byB));
  const direct = await call(`/rest/v1/content_reports?id=eq.${r.id}`, { method: 'PATCH', token: M.token, headers: JSON_HEADERS, body: JSON.stringify({ status: 'dismissed' }) });
  check('nobody updates a report directly, not even M', refused(direct), detail(direct));
  const done = await workflow(M, r.id, 'resolved', 'smoke: đã xử lý');
  const after = await call(`/rest/v1/content_reports?select=status,internal_note,handled_by&id=eq.${r.id}`, { token: M.token });
  const a = rows(after)[0];
  check(
    'M resolves it with a note, stamped as handler',
    done.status === 200 && a?.status === 'resolved' && a?.internal_note === 'smoke: đã xử lý' && a?.handled_by === M.id,
    `${detail(done)}; ${detail(after)}`,
  );

  const del = await call(`/rest/v1/comments?id=eq.${c.id}&select=id`, { method: 'DELETE', token: A.token, headers: returning });
  check('A removes the comment', rows(del).length === 1, detail(del));
}

finish();
