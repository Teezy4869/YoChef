#!/usr/bin/env node
// Live recipe check (Phase 2, tier 3): the Phase 2 read paths on the real v2
// project, as a GUEST with the publishable key. Read-only by construction
// (GET and RPC reads only); creates and changes nothing.
//
//   npm run smoke:recipes                    (loads app/.env)
//   node --env-file=<file> scripts/live_recipes_smoke.mjs [--log <path>]
//
// Needs migration 20261113120000_recipe_search to be applied on v2 first.
// Assertions are relative to the data (totals agree with each other), except
// the Phase 0 numbers that live_smoke.mjs already pins (236 published).
// Never prints the key. Refuses a secret or service_role key.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { log: { type: 'string' } } });

const url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

function refuse(msg) {
  console.error(`live_recipes_smoke: ${msg}`);
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

const PUBLISHED = 236; // pinned by live_smoke.mjs (Phase 0)
const STAGED_SLUG = '102-ca-vien-tuyet-hoa'; // staged in Phase 0: must never appear

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

const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

async function call(path, init = {}) {
  const res = await fetch(`${url}${path}`, { ...init, headers: { ...headers, ...init.headers } });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

const search = (args) => call('/rest/v1/rpc/search_recipes', { method: 'POST', body: JSON.stringify(args) });
const rows = (r) => (Array.isArray(r.body) ? r.body : []);
const total = (r) => (rows(r)[0] ? Number(rows(r)[0].total_count) : 0);

log(`YoChef live recipe smoke  ${new Date().toISOString()}  target ${new URL(url).host}  role anon`);

// --- RPC present and shaped ---------------------------------------------------------
const all = await search({ p_limit: 100 });
if (all.status === 404) {
  check('search_recipes exists on v2', false, 'HTTP 404: apply migration 20261113120000_recipe_search first');
  log('INFO  remaining checks skipped');
  finish();
}
check('search_recipes callable by anon', all.status === 200 && Array.isArray(all.body), `HTTP ${all.status}`);
check('empty search counts exactly the published recipes', total(all) === PUBLISHED, `total ${total(all)}, expected ${PUBLISHED}`);
check('limit is clamped to 100', rows(all).length === 100, `rows ${rows(all).length}`);
check('first row has the fields the app reads', (() => {
  const r = rows(all)[0] ?? {};
  return ['id', 'slug', 'name', 'category_slug', 'category_name', 'default_servings', 'total_count'].every((k) => k in r);
})());
check('no staged recipe is ever returned', !rows(all).some((r) => r.slug === STAGED_SLUG));

// --- Pagination ---------------------------------------------------------------------------
const p1 = await search({ p_limit: 20, p_offset: 0 });
const p2 = await search({ p_limit: 20, p_offset: 20 });
const ids1 = new Set(rows(p1).map((r) => r.id));
check('pages are disjoint and totals stable', rows(p2).length === 20 && rows(p2).every((r) => !ids1.has(r.id)) && total(p1) === total(p2), `p1 ${rows(p1).length}, p2 ${rows(p2).length}`);
const past = await search({ p_limit: 20, p_offset: 100000 });
check('offset past the end returns no rows', past.status === 200 && rows(past).length === 0, `HTTP ${past.status}`);

// --- Accent-insensitive search --------------------------------------------------------
const withAccent = await search({ p_query: 'thịt', p_limit: 100 });
const noAccent = await search({ p_query: 'thit', p_limit: 100 });
const upper = await search({ p_query: 'THỊT', p_limit: 100 });
check('"thịt" finds recipes', total(withAccent) > 0, `total ${total(withAccent)}`);
check('"thit" (no accents) finds the same recipes', total(noAccent) === total(withAccent), `${total(noAccent)} vs ${total(withAccent)}`);
check('upper case gives the same result', total(upper) === total(withAccent), `${total(upper)} vs ${total(withAccent)}`);
const dStroke = await search({ p_query: 'đậu', p_limit: 100 });
const dPlain = await search({ p_query: 'dau', p_limit: 100 });
check('"đậu" is covered by "dau" (đ folds to d)', total(dStroke) > 0 && rows(dStroke).every((r) => rows(dPlain).some((q) => q.id === r.id)), `đậu ${total(dStroke)}, dau ${total(dPlain)}`);
const narrowed = await search({ p_query: 'thit kho', p_limit: 100 });
check('more terms narrow the result (AND)', total(narrowed) <= total(noAccent), `${total(narrowed)} <= ${total(noAccent)}`);
const nothing = await search({ p_query: 'zzzqqq' });
check('a nonsense query returns nothing', nothing.status === 200 && rows(nothing).length === 0);
const wildcard = await search({ p_query: '%' });
check('"%" is a literal, not a wildcard', wildcard.status === 200 && rows(wildcard).length === 0);

// --- Filters ---------------------------------------------------------------------------------
const cats = await call('/rest/v1/categories?select=slug,name&order=sort_order');
check('categories readable', cats.status === 200 && Array.isArray(cats.body) && cats.body.length > 0, `HTTP ${cats.status}, ${cats.body?.length} rows`);
let sum = 0;
for (const c of cats.body ?? []) sum += total(await search({ p_category_slug: c.slug, p_limit: 1 }));
check('category totals add up to all published recipes', sum === PUBLISHED, `sum ${sum}`);

let difficultySum = 0;
for (const d of ['easy', 'medium', 'hard']) difficultySum += total(await search({ p_difficulty: d, p_limit: 1 }));
check('difficulty totals never exceed the published count', difficultySum <= PUBLISHED, `sum ${difficultySum}`);

const t30 = await search({ p_max_total_minutes: 30, p_limit: 100 });
const t60 = await search({ p_max_total_minutes: 60, p_limit: 100 });
check('time filter is monotonic', total(t30) <= total(t60) && total(t60) <= PUBLISHED, `30: ${total(t30)}, 60: ${total(t60)}`);
check('time-filtered rows really are within the limit', rows(t30).every((r) => r.prep_time_minutes !== null && r.cook_time_minutes !== null && r.prep_time_minutes + r.cook_time_minutes <= 30));

// --- Recipe detail in one embedded request -------------------------------------------------
const first = rows(all)[0];
const DETAIL =
  'id,slug,name,default_servings,serving_basis,category:categories(slug,name),source:recipe_sources(title,usage_note),' +
  'recipe_ingredients(sort_order,quantity,unit,quantity_basis,is_optional,ingredient:ingredients(name)),' +
  'recipe_steps(step_number,instruction,timer_enabled,duration_seconds)';
const detail = await call(`/rest/v1/recipes?select=${encodeURIComponent(DETAIL)}&slug=eq.${first.slug}`, { headers: { Accept: 'application/vnd.pgrst.object+json' } });
const d = detail.body;
check('detail loads with a single object request', detail.status === 200 && d?.slug === first.slug, `HTTP ${detail.status}`);
check('detail has ingredients with names, and steps', d?.recipe_ingredients?.length > 0 && d.recipe_ingredients.every((i) => typeof i.ingredient?.name === 'string') && d?.recipe_steps?.length > 0);
check('detail credits its source', typeof d?.source?.title === 'string' && d.source.title.length > 0);

// Rules the app relies on, checked over the whole published catalogue.
const toTaste = await call('/rest/v1/recipe_ingredients?select=quantity&quantity_basis=eq.to_taste&quantity=not.is.null&limit=1');
check('no "to taste" line carries a quantity', toTaste.status === 200 && toTaste.body?.length === 0, `HTTP ${toTaste.status}`);
const badTimer = await call('/rest/v1/recipe_steps?select=id&timer_enabled=eq.true&duration_seconds=is.null&limit=1');
check('no step has a timer without a duration', badTimer.status === 200 && badTimer.body?.length === 0, `HTTP ${badTimer.status}`);
const unknownServings = await call('/rest/v1/recipes?select=id&default_servings=is.null&limit=1');
check('every published recipe has default servings (stepper always available)', unknownServings.status === 200 && unknownServings.body?.length === 0, `HTTP ${unknownServings.status}`);

const missing = await call(`/rest/v1/recipes?select=id&slug=eq.${STAGED_SLUG}`);
check('a staged recipe is not readable by slug', missing.status === 200 && missing.body?.length === 0, `HTTP ${missing.status}`);

finish();

function finish() {
  log(`${failures === 0 ? 'ALL PASS' : `${failures} FAILED`}`);
  if (values.log) {
    mkdirSync(dirname(values.log), { recursive: true });
    writeFileSync(values.log, lines.join('\n') + '\n');
  }
  process.exit(failures === 0 ? 0 : 1);
}
