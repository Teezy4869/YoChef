// Seed import tests: the generated seed.sql applied twice on PGlite.
// Needs the dataset zip (kept outside the repo, 55 MB). Path from
// YOCHEF_DATASET_ZIP, else the sibling YoChef_born_again package.
// Run: npm run test:db
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { EXPECTED, loadDataset } from '../seed/lib/dataset.mjs';
import { buildSeedSql } from '../seed/lib/seed_sql.mjs';
import { admin, as, createDatabase } from './harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const zipPath = resolve(
  process.env.YOCHEF_DATASET_ZIP ??
    join(here, '..', '..', '..', 'YoChef_born_again', '30_data', 'recipes_001_250_release_candidate.zip'),
);
const expectedSha = readFileSync(join(here, '..', 'seed', 'dataset.sha256'), 'utf8').trim().split(/\s+/)[0];
const skip = existsSync(zipPath) ? false : `dataset zip not found at ${zipPath} (set YOCHEF_DATASET_ZIP)`;

const TABLES = ['recipe_sources', 'categories', 'ingredients', 'recipes', 'recipe_ingredients', 'recipe_steps'];

/** Full content of every catalog table, ids and timestamps included. */
async function snapshot(db) {
  const out = {};
  for (const t of TABLES) {
    const [row] = await admin(
      db,
      `select count(*)::int as n, md5(coalesce(string_agg(x::text, '|' order by x::text), '')) as h from public.${t} x`,
    );
    out[t] = row;
  }
  return out;
}

describe('seed import', { skip }, () => {
  let db;
  let sql;
  let first;

  before(async () => {
    const { doc } = loadDataset(zipPath, expectedSha);
    sql = buildSeedSql(doc);
    db = await createDatabase();
    await db.exec(sql);
    first = await snapshot(db);
  });

  after(async () => {
    await db?.close();
  });

  it('loads the expected row counts', () => {
    assert.equal(first.recipe_sources.n, 1);
    assert.equal(first.categories.n, EXPECTED.categories);
    assert.equal(first.ingredients.n, EXPECTED.ingredients);
    assert.equal(first.recipes.n, EXPECTED.recipes);
    assert.equal(first.recipe_ingredients.n, EXPECTED.recipeIngredients);
    assert.equal(first.recipe_steps.n, EXPECTED.steps);
  });

  it('is idempotent: a second run leaves every row identical (ids and timestamps included)', async () => {
    await db.exec(sql);
    assert.deepEqual(await snapshot(db), first);
  });

  it('repairs drift: an edited child row and an extra step are restored on re-run', async () => {
    await admin(db, `update public.recipe_steps set instruction = 'drift' where step_number = 1`);
    const [{ id }] = await admin(db, `select id from public.recipes where slug = '001-thit-lon-kho-cot-dua'`);
    await admin(db, `insert into public.recipe_steps (recipe_id, step_number, instruction) values ($1, 99, 'extra')`, [id]);
    await db.exec(sql);
    const [{ n }] = await admin(db, `select count(*)::int as n from public.recipe_steps where instruction = 'drift' or step_number = 99`);
    assert.equal(n, 0);
  });

  it('stores "to taste" as NULL quantity and unit', async () => {
    const [r] = await admin(
      db,
      `select count(*) filter (where quantity is null)::int as q, count(*) filter (where unit is null and quantity is null)::int as u
       from public.recipe_ingredients`,
    );
    assert.deepEqual(r, { q: EXPECTED.toTaste, u: EXPECTED.toTaste });
  });

  it('quarantined covers have no image path; every other recipe points at <slug>/cover.webp', async () => {
    const [r] = await admin(
      db,
      `select count(*) filter (where cover_image_path is null)::int as missing,
              count(*) filter (where cover_image_path = slug || '/cover.webp')::int as ok
       from public.recipes`,
    );
    assert.deepEqual(r, { missing: 8, ok: EXPECTED.covers });
  });

  it('anon sees exactly the published recipes and their children', async () => {
    const recipes = await as(db, 'anon', null, `select count(*)::int as n from public.recipes`);
    assert.equal(recipes.rows[0].n, EXPECTED.published);
    const hidden = await as(
      db,
      'anon',
      null,
      `select count(*)::int as n from public.recipe_steps s
       where not exists (select 1 from public.recipes r where r.id = s.recipe_id)`,
    );
    assert.equal(hidden.rows[0].n, 0);
  });

  it('a count mismatch aborts the whole import', async () => {
    const before = await snapshot(db);
    const broken = sql.replace(`(${EXPECTED.recipes}, ${EXPECTED.published},`, `(${EXPECTED.recipes + 1}, ${EXPECTED.published},`);
    assert.notEqual(broken, sql);
    await assert.rejects(db.exec(broken), /count check failed/);
    await db.exec('rollback').catch(() => {});
    assert.deepEqual(await snapshot(db), before);
  });
});
