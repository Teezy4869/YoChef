#!/usr/bin/env node
// Live smoke test (K8, tier 3): calls the real v2 Data API and Storage as a
// guest, with the PUBLISHABLE key only. Read-only by construction: every write
// probe either targets a row that cannot exist or carries a value that fails a
// CHECK constraint, so even a broken permission setup cannot create data.
//
//   npm run smoke:live                       (loads app/.env)
//   node --env-file=<file> scripts/live_smoke.mjs [--log <path>]
//
// Never prints the key. Refuses to run with a secret or service_role key.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { log: { type: 'string' } } });

const url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY ?? '';

function refuse(msg) {
  console.error(`live_smoke: ${msg}`);
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

// Expected values, read from the v2 database as owner after the Phase 0 import.
const EXPECT = {
  publishedRecipes: 236,
  publishedRecipeIngredients: 2760,
  publishedSteps: 1094,
  publishedToTaste: 962,
  categories: 10,
  ingredients: 542,
  detailSlug: '001-thit-lon-kho-cot-dua',
  detailIngredients: 10,
  detailSteps: 6,
  stagedSlug: '102-ca-vien-tuyet-hoa',
  quarantinedCover: '112-ca-kho-rim/cover.webp',
};

const headers = { apikey: key, Authorization: `Bearer ${key}` };
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

async function rest(path, init = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...init.headers } });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body, range: res.headers.get('content-range') };
}

async function count(path) {
  const r = await rest(path, { headers: { Prefer: 'count=exact', Range: '0-0' } });
  const total = r.range?.split('/')[1];
  return { ...r, total: total === undefined ? null : Number(total) };
}

const denied = (r) => r.status >= 400 && r.body?.code === '42501';

log(`YoChef live smoke  ${new Date().toISOString()}  target ${new URL(url).host}  role anon`);

// --- Catalog reads -----------------------------------------------------------
const recipes = await count('recipes?select=id');
check('anon sees exactly the published recipes', recipes.total === EXPECT.publishedRecipes, `HTTP ${recipes.status}, total ${recipes.total}`);

const staged = await rest(`recipes?select=id&slug=eq.${EXPECT.stagedSlug}`);
check('a staged recipe is invisible', staged.status === 200 && Array.isArray(staged.body) && staged.body.length === 0, `HTTP ${staged.status}`);

for (const [name, path, want] of [
  ['recipe_ingredients of published recipes only', 'recipe_ingredients?select=id', EXPECT.publishedRecipeIngredients],
  ['recipe_steps of published recipes only', 'recipe_steps?select=id', EXPECT.publishedSteps],
  ['"to taste" stored as NULL', 'recipe_ingredients?select=id&quantity=is.null', EXPECT.publishedToTaste],
  ['no quantity is 0', 'recipe_ingredients?select=id&quantity=eq.0', 0],
  ['categories readable', 'categories?select=id', EXPECT.categories],
  ['ingredients readable', 'ingredients?select=id', EXPECT.ingredients],
]) {
  const r = await count(path);
  check(name, r.total === want, `HTTP ${r.status}, total ${r.total}, expected ${want}`);
}

const detailSelect =
  'id,slug,name,default_servings,cover_image_path,category:categories(slug,name),source:recipe_sources(title),' +
  'recipe_ingredients(sort_order,quantity,unit,quantity_basis,ingredient:ingredients(name)),recipe_steps(step_number,instruction,timer_enabled,duration_seconds)';
const bySlug = await rest(`recipes?select=${detailSelect}&slug=eq.${EXPECT.detailSlug}`);
const d = Array.isArray(bySlug.body) ? bySlug.body[0] : null;
check(
  'recipe detail by slug with category, source, ingredients, steps',
  bySlug.status === 200 &&
    d?.category?.slug === 'mon_chinh' &&
    typeof d?.source?.title === 'string' &&
    d?.recipe_ingredients?.length === EXPECT.detailIngredients &&
    d?.recipe_steps?.length === EXPECT.detailSteps &&
    d.recipe_ingredients.every((i) => typeof i.ingredient?.name === 'string'),
  `HTTP ${bySlug.status}, ingredients ${d?.recipe_ingredients?.length}, steps ${d?.recipe_steps?.length}`,
);
if (d) {
  const byId = await rest(`recipes?select=id,slug&id=eq.${d.id}`);
  check('recipe detail by id', byId.status === 200 && byId.body?.[0]?.slug === EXPECT.detailSlug, `HTTP ${byId.status}`);
}

// --- Write probes (cannot create data, see header) -----------------------------
const ins = await rest('categories', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
  body: JSON.stringify({ slug: 'INVALID SLUG!', name: 'smoke' }),
});
check('anon cannot insert', denied(ins), `HTTP ${ins.status}, code ${ins.body?.code}`);

const upd = await rest('recipes?id=eq.00000000-0000-0000-0000-000000000000', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
  body: JSON.stringify({ name: 'smoke' }),
});
check('anon cannot update', denied(upd), `HTTP ${upd.status}, code ${upd.body?.code}`);

const del = await rest('recipe_steps?id=eq.00000000-0000-0000-0000-000000000000', { method: 'DELETE' });
check('anon cannot delete', denied(del), `HTTP ${del.status}, code ${del.body?.code}`);

// --- Identity surface --------------------------------------------------------
const pub = await rest('profiles?select=id,display_name,avatar_path&limit=1');
check('profiles public columns readable', pub.status === 200, `HTTP ${pub.status}`);
const bio = await rest('profiles?select=bio&limit=1');
check('profiles.bio not public', denied(bio), `HTTP ${bio.status}, code ${bio.body?.code}`);
const roles = await rest('user_roles?select=role&limit=1');
check('user_roles not readable by anon', denied(roles), `HTTP ${roles.status}, code ${roles.body?.code}`);
const rpc = await rest('rpc/is_editor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
check('private helpers are not exposed', rpc.status === 404, `HTTP ${rpc.status}, code ${rpc.body?.code}`);

// --- Storage -----------------------------------------------------------------
if (d?.cover_image_path) {
  const img = await fetch(`${url}/storage/v1/object/public/recipe-images/${d.cover_image_path}`);
  await img.arrayBuffer();
  check('public cover image served', img.status === 200 && img.headers.get('content-type') === 'image/webp', `HTTP ${img.status} ${img.headers.get('content-type')}`);
} else {
  check('public cover image served', false, 'detail recipe has no cover path');
}
const q = await fetch(`${url}/storage/v1/object/public/recipe-images/${EXPECT.quarantinedCover}`);
await q.arrayBuffer();
check('quarantined cover is absent', q.status >= 400, `HTTP ${q.status}`);

log(`${failures === 0 ? 'ALL PASS' : `${failures} FAILED`}`);
if (values.log) {
  mkdirSync(dirname(values.log), { recursive: true });
  writeFileSync(values.log, lines.join('\n') + '\n');
}
process.exit(failures === 0 ? 0 : 1);
