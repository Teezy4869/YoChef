#!/usr/bin/env node
// Live staff-permission check (Phase 4, tier 3) on v2 with the publishable key only.
//
//   npm run smoke:admin
//
// Needs mobile/.env (URL + publishable key) and, in .env.smoke (git-ignored), test
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
    headers: { apikey: key, Authorization: `Bearer ${token ?? key}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
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

// --- 4.5 Recipe CMS ---------------------------------------------------------------------
// E works on a throw-away recipe; S hard-deletes it at the end (and any leftover).
{
  const PREFIX = 'zz-smoke-cms';
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const save = (u, id, recipe, ingredients, steps) =>
    rpc(u, 'save_recipe', { p_id: id, p_recipe: recipe, p_ingredients: ingredients, p_steps: steps, p_reason: 'smoke:admin' });
  const move = (u, id, to) => rpc(u, 'transition_recipe_status', { p_id: id, p_to: to, p_reason: 'smoke:admin' });
  const remove = (u, id, slug) => rpc(u, 'delete_recipe', { p_id: id, p_confirm_slug: slug, p_reason: 'smoke:admin dọn dữ liệu' });
  const upload = (u, path) =>
    fetch(`${url}/storage/v1/object/recipe-images/${path}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${u?.token ?? key}`, 'Content-Type': 'image/png', 'x-upsert': 'false' },
      body: PNG,
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  const anonSees = async (id) => rows(await call(`/rest/v1/recipes?select=id&id=eq.${id}`)).length === 1;

  const old = rows(await call(`/rest/v1/recipes?select=id,slug,status&slug=like.${PREFIX}*`, { token: E.token }));
  for (const r of old) {
    if (r.status === 'published' || r.status === 'staged') await move(E, r.id, 'archived');
    await remove(S, r.id, r.slug);
  }
  // Covers left by an earlier run that stopped before its own cleanup.
  const list = (prefix, search) => call('/storage/v1/object/list/recipe-images', { method: 'POST', token: S.token, body: { prefix, search, limit: 100 } });
  for (const dir of rows(await list('', PREFIX))) {
    for (const f of rows(await list(dir.name))) await call(`/storage/v1/object/recipe-images/${dir.name}/${f.name}`, { method: 'DELETE', token: S.token });
  }

  const cat = rows(await call('/rest/v1/categories?select=id&order=sort_order&limit=1'))[0]?.id;
  const ing = rows(await call('/rest/v1/ingredients?select=id&order=name&limit=2'));
  const slug = `${PREFIX}-${Date.now()}`;
  const recipe = { slug, name: 'YoChef smoke CMS', default_servings: 2 };
  const ingredients = [
    { ingredient_id: ing[0]?.id, quantity: 100, unit: 'g', quantity_basis: 'book' },
    { ingredient_id: ing[1]?.id, quantity: null, unit: null, quantity_basis: 'to_taste' },
  ];
  const steps = [{ instruction: 'Bước thử' }];

  for (const [who, u] of [['A', A], ['M', M]]) {
    const r = await save(u, null, recipe, ingredients, steps);
    check(`${who} cannot save a recipe`, refused(r), detail(r));
  }
  const created = await save(E, null, recipe, ingredients, steps);
  const id = created.body;
  check('E creates a draft', created.status === 200 && typeof id === 'string', detail(created));
  if (typeof id !== 'string') finish();
  const asE = await call(`/rest/v1/recipes?select=status&id=eq.${id}`, { token: E.token });
  check('E reads the draft; anon and A do not', rows(asE)[0]?.status === 'draft' && !(await anonSees(id)) &&
    rows(await call(`/rest/v1/recipes?select=id&id=eq.${id}`, { token: A.token })).length === 0, detail(asE));

  const skip = await move(E, id, 'published');
  check('draft cannot jump to published', codeOf(skip) === '22023', detail(skip));
  const noReason = await rpc(E, 'transition_recipe_status', { p_id: id, p_to: 'archived' });
  check('a status move needs a reason', codeOf(noReason) === '22023', detail(noReason));
  const notReady = await move(E, id, 'staged');
  check('staging needs a category (field message returned)', codeOf(notReady) === '22023' && /category_id/.test(notReady.body?.details ?? ''), detail(notReady));
  const fixed = await save(E, id, { ...recipe, category_id: cat }, ingredients, steps);
  check('E adds the category', fixed.status === 200, detail(fixed));
  const staged = await move(E, id, 'staged');
  const published = await move(E, id, 'published');
  check('E stages then publishes it; anon sees it', staged.body === 'staged' && published.body === 'published' && (await anonSees(id)), `${detail(staged)}; ${detail(published)}`);
  // --- 4.4 videos on the published throw-away recipe (deleted with it) ---
  {
    const yt = (u, body) =>
      fetch(`${url}/functions/v1/youtube-search`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${u?.token ?? key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
    const assign = (u, video) => rpc(u, 'assign_recipe_video', { p_recipe_id: id, p_video_id: video });
    const noReceipt = await assign(E, 'dQw4w9WgXcQ');
    check('assigning without a verification is refused', codeOf(noReceipt) === '22023', detail(noReceipt));
    const byA = await assign(A, 'dQw4w9WgXcQ');
    check('A cannot assign videos', refused(byA), detail(byA));
    const ytA = await yt(A, { action: 'search', query: 'thịt kho' });
    check('A cannot use youtube-search', ytA.status === 403, `HTTP ${ytA.status}, ${ytA.body?.error?.code ?? '-'}`);
    const found = await yt(E, { action: 'search', query: 'thịt kho tàu' });
    check('E finds candidates through youtube-search', found.status === 200 && Array.isArray(found.body?.items), `HTTP ${found.status}, ${found.body?.error?.code ?? `${found.body?.items?.length ?? '-'} items`}`);
    let verified = null;
    for (const c of (found.body?.items ?? []).slice(0, 3)) {
      const v = await yt(E, { action: 'verify', videoId: c.id });
      if (v.body?.item?.verificationStatus === 'verified') {
        verified = c.id;
        break;
      }
    }
    check('E verifies one candidate with videos.list', !!verified, verified ?? 'none of the first 3 candidates verified');
    if (verified) {
      const ok = await assign(E, verified);
      const pub = await call(`/rest/v1/recipe_videos?select=youtube_video_id&recipe_id=eq.${id}`);
      check('E assigns it and anon sees the primary video', ok.status === 200 && rows(pub)[0]?.youtube_video_id === verified, `${detail(ok)}; ${detail(pub)}`);
      const reuse = await assign(E, verified);
      check('a verification is used once', codeOf(reuse) === '22023', detail(reuse));
      const removed = await rpc(E, 'remove_recipe_video', { p_recipe_id: id, p_video_id: verified });
      check('E removes the video', removed.status === 200 && removed.body === true, detail(removed));
    }
  }

  const byM = await move(M, id, 'archived');
  check('M cannot change a recipe status', refused(byM), detail(byM));
  const archived = await move(E, id, 'archived');
  check('E archives it; anon no longer sees it', archived.body === 'archived' && !(await anonSees(id)), detail(archived));

  const coverPath = `${slug}/cover-${Date.now()}.png`;
  const up = await upload(E, coverPath);
  check('E uploads a new cover', up.status === 200, `HTTP ${up.status}`);
  const overwrite = await upload(E, `${slug}/cover.png`);
  check('a cover name outside cover-<time> is refused', overwrite.status >= 400, `HTTP ${overwrite.status}`);
  const byA = await upload(A, `${slug}/cover-1.png`);
  check('A cannot upload covers', byA.status >= 400, `HTTP ${byA.status}`);
  const delCover = await call(`/storage/v1/object/recipe-images/${coverPath}`, { method: 'DELETE', token: E.token });
  check('E deletes the unused cover', delCover.status === 200, detail(delCover));

  // --- 4.3 nutrition on the same throw-away recipe (its result goes with it) ---
  for (const [who, u] of [['A', A], ['M', M]]) {
    const r = await rpc(u, 'calculate_recipe_nutrition', { p_recipe_id: id });
    check(`${who} cannot calculate nutrition`, refused(r), detail(r));
  }
  const calc = await rpc(E, 'calculate_recipe_nutrition', { p_recipe_id: id });
  check(
    'E calculates it: unverified inputs give no number (totals NULL, with reasons)',
    calc.status === 200 && calc.body?.status !== 'CALCULATED' && calc.body?.totals?.energy_kcal === null && calc.body?.reason_codes?.length > 0,
    `${detail(calc)}; ${calc.body?.status}; ${(calc.body?.reason_codes ?? []).join(',')}`,
  );
  const unverified = await rpc(E, 'verify_recipe_nutrition', { p_recipe_id: id });
  check('an incomplete result cannot be verified', codeOf(unverified) === '22023', detail(unverified));
  const nutAnon = await call(`/rest/v1/recipe_nutrition?select=status&recipe_id=eq.${id}`);
  check('anon does not see an unverified result', nutAnon.status === 200 && rows(nutAnon).length === 0, detail(nutAnon));
  const mapE = await call('/rest/v1/ingredient_nutrition?select=ingredient_id&limit=1', { token: E.token });
  const mapA = await call('/rest/v1/ingredient_nutrition?select=ingredient_id&limit=1', { token: A.token });
  check('E reads mappings; A reads none', mapE.status === 200 && mapA.status === 200 && rows(mapA).length === 0, `${detail(mapE)}; ${detail(mapA)}`);
  const convA = await rpc(A, 'save_unit_conversion', { p_ingredient_id: null, p_unit: 'zz-smoke', p_grams: 1, p_source: 'x', p_method: 'x' });
  check('A cannot write unit conversions', refused(convA), detail(convA));

  const byE = await remove(E, id, slug);
  check('E cannot hard-delete', refused(byE), detail(byE));
  const wrong = await remove(S, id, `${slug}-x`);
  check('S must type the right slug', codeOf(wrong) === '22023', detail(wrong));
  const gone = await remove(S, id, slug);
  const after = await call(`/rest/v1/recipes?select=id&id=eq.${id}`, { token: E.token });
  check('S deletes the archived recipe', gone.status === 204 && rows(after).length === 0, `${detail(gone)}; ${detail(after)}`);
  const trail = rows(await rpc(S, 'list_admin_audit_logs', { p_limit: 20 })).filter((l) => l.target_id === id).map((l) => l.action);
  check('the audit log has create, status moves and delete', ['recipe.create', 'recipe.status', 'recipe.delete'].every((a) => trail.includes(a)), trail.join(','));
}

// --- 4.3 Edge Function nutrition-search (deployed, USDA_API_KEY set by the owner) -------
{
  const invoke = (u, body) =>
    fetch(`${url}/functions/v1/nutrition-search`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${u?.token ?? key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  const ok = await invoke(E, { action: 'search_usda', query: 'pork loin raw' });
  const first = ok.body?.items?.[0];
  check(
    'E searches USDA through the function (per 100 g, at most 10 results)',
    ok.status === 200 && Array.isArray(ok.body?.items) && ok.body.items.length <= 10 && first?.provider === 'usda',
    `HTTP ${ok.status}, ${ok.body?.error?.code ?? `${ok.body?.items?.length ?? '-'} items`}`,
  );
  const detailRes = first ? await invoke(E, { action: 'get_usda_food', fdcId: first.externalId }) : null;
  check('E reads one USDA food by id', detailRes?.status === 200 && detailRes.body?.item?.externalId === first?.externalId, `HTTP ${detailRes?.status ?? '-'}`);
  const byA = await invoke(A, { action: 'search_usda', query: 'pork' });
  check('A is refused (forbidden)', byA.status === 403 && byA.body?.error?.code === 'forbidden', `HTTP ${byA.status}, ${byA.body?.error?.code ?? byA.body?.code ?? '-'}`);
  const byAnon = await invoke(null, { action: 'search_usda', query: 'pork' });
  check('anon is refused', byAnon.status === 401, `HTTP ${byAnon.status}`);
  const bad = await invoke(E, { action: 'search_openfoodfacts', query: 'x' });
  check('an unknown action is refused', bad.status === 400 && bad.body?.error?.code === 'invalid_action', `HTTP ${bad.status}, ${bad.body?.error?.code ?? '-'}`);
}

// --- youtube-refresh: scheduler only ------------------------------------------------
// The real secret is the project owner's, so only the refusals are checked here. A 401 (not a
// 500 config_error) also shows YOUTUBE_REFRESH_SECRET is set on the server.
{
  const refresh = (headers) =>
    fetch(`${url}/functions/v1/youtube-refresh`, { method: 'POST', headers }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  const none = await refresh({ apikey: key, Authorization: `Bearer ${E.token}` });
  check('youtube-refresh refuses an editor without the secret', none.status === 401 && none.body?.error?.code === 'unauthorized', `HTTP ${none.status}, ${none.body?.error?.code ?? '-'}`);
  const wrong = await refresh({ 'x-refresh-secret': 'x'.repeat(40) });
  check('youtube-refresh refuses a wrong secret', wrong.status === 401 && wrong.body?.error?.code === 'unauthorized', `HTTP ${wrong.status}, ${wrong.body?.error?.code ?? '-'}`);
}

finish();
