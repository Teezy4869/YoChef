// Phase 2 database tests: migration 20261113120000_recipe_search.
// Run: npm run test:db
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { admin, as, createDatabase } from './harness.mjs';

let db;
const ids = {};

async function recipe(slug, name, { category, difficulty = 'easy', prep = 10, cook = 20, status = 'published', num, ingredients = [] }) {
  const [{ id }] = await admin(
    db,
    `insert into public.recipes (slug, name, category_id, difficulty, default_servings, prep_time_minutes, cook_time_minutes,
       status, published_at, source_recipe_number)
     values ($1, $2, $3, $4, 4, $5, $6, $7, case when $7 = 'published' then now() end, $8) returning id`,
    [slug, name, ids[category], difficulty, prep, cook, status, num ?? null],
  );
  let n = 1;
  for (const ing of ingredients) {
    await admin(
      db,
      `insert into public.recipe_ingredients (recipe_id, ingredient_id, sort_order, quantity, unit, quantity_basis)
       values ($1, $2, $3, 1, 'g', 'book')`,
      [id, ids[ing], n++],
    );
  }
  return id;
}

const search = (role, args) =>
  as(
    db,
    role,
    null,
    `select * from public.search_recipes(p_query => $1, p_category_slug => $2, p_difficulty => $3,
       p_max_total_minutes => $4, p_limit => $5, p_offset => $6)`,
    [args.q ?? null, args.category ?? null, args.difficulty ?? null, args.max ?? null, args.limit ?? 20, args.offset ?? 0],
  );
const slugs = (res) => res.rows.map((r) => r.slug);

before(async () => {
  db = await createDatabase();
  for (const [slug, name] of [['mon_chinh', 'Món chính'], ['canh', 'Canh']]) {
    [{ id: ids[slug] }] = await admin(db, `insert into public.categories (slug, name) values ($1, $2) returning id`, [slug, name]);
  }
  for (const [slug, name, aliases] of [
    ['thit-lon', 'Thịt lợn', ['thịt heo']],
    ['dau-hu', 'Đậu hũ', []],
    ['ca-chua', 'Cà chua', []],
  ]) {
    [{ id: ids[slug] }] = await admin(
      db,
      `insert into public.ingredients (slug, name, aliases) values ($1, $2, $3) returning id`,
      [slug, name, aliases],
    );
  }
  await recipe('001-thit-kho', 'Thịt lợn kho cốt dừa', { category: 'mon_chinh', num: 1, difficulty: 'medium', prep: 15, cook: 60, ingredients: ['thit-lon'] });
  await recipe('002-dau-sot', 'Đậu hũ sốt cà chua', { category: 'mon_chinh', num: 2, ingredients: ['dau-hu', 'ca-chua'] });
  await recipe('003-canh-chua', 'Canh chua', { category: 'canh', num: 3, difficulty: 'hard', prep: 10, cook: 15, ingredients: ['ca-chua'] });
  await recipe('004-bo-kho', 'Bò kho', { category: 'mon_chinh', num: 4, prep: null, cook: null, ingredients: ['thit-lon'] });
  await recipe('005-nhap', 'Thịt nháp', { category: 'mon_chinh', num: 5, status: 'staged', ingredients: ['thit-lon'] });
});

after(async () => {
  await db?.close();
});

describe('fold_vi', () => {
  it('lower-cases, strips diacritics and maps đ to d', async () => {
    const [r] = await admin(db, `select public.fold_vi('Thịt Lợn Kho ĐẶC') as v`);
    assert.equal(r.v, 'thit lon kho dac');
  });

  it('handles decomposed (NFD) input and NULL', async () => {
    const [r] = await admin(db, `select public.fold_vi(U&'The\\0323\\0302t') as v, public.fold_vi(null) as n`);
    assert.equal(r.v, 'thet');
    assert.equal(r.n, '');
  });
});

describe('search_recipes', () => {
  it('returns only published recipes, to both anon and authenticated', async () => {
    for (const role of ['anon', 'authenticated']) {
      const res = await search(role, {});
      assert.equal(res.error, null, role);
      assert.deepEqual(slugs(res), ['001-thit-kho', '002-dau-sot', '003-canh-chua', '004-bo-kho']);
      assert.equal(Number(res.rows[0].total_count), 4);
    }
  });

  it('finds Vietnamese names without typing accents', async () => {
    assert.deepEqual(slugs(await search('anon', { q: 'thit kho' })), ['001-thit-kho', '004-bo-kho']); // 004: kho in name, thit via ingredient
    assert.deepEqual(slugs(await search('anon', { q: 'thit lon kho dua' })), ['001-thit-kho']);
    assert.deepEqual(slugs(await search('anon', { q: 'DAU HU' })), ['002-dau-sot']);
    assert.deepEqual(slugs(await search('anon', { q: 'đậu hũ' })), ['002-dau-sot']);
  });

  it('matches ingredient names and aliases, ranking name matches first', async () => {
    const res = await search('anon', { q: 'ca chua' });
    assert.deepEqual(slugs(res).sort(), ['002-dau-sot', '003-canh-chua']);
    const alias = await search('anon', { q: 'thit heo' });
    assert.deepEqual(slugs(alias), ['001-thit-kho', '004-bo-kho']);
  });

  it('puts a name match before an ingredient-only match', async () => {
    const res = await search('anon', { q: 'thit' });
    assert.equal(res.rows[0].slug, '001-thit-kho'); // in the name
    assert.equal(res.rows[1].slug, '004-bo-kho'); // only via ingredient
  });

  it('requires every term (AND), across name and ingredients', async () => {
    assert.deepEqual(slugs(await search('anon', { q: 'kho thit lon' })), ['001-thit-kho', '004-bo-kho']);
    assert.deepEqual(slugs(await search('anon', { q: 'dau hu thit' })), []);
  });

  it('never returns staged recipes, even when searched by name', async () => {
    assert.deepEqual(slugs(await search('anon', { q: 'nhap' })), []);
  });

  it('treats LIKE wildcards literally', async () => {
    assert.deepEqual(slugs(await search('anon', { q: '%' })), []);
    assert.deepEqual(slugs(await search('anon', { q: '_' })), []);
  });

  it('filters by category and difficulty', async () => {
    assert.deepEqual(slugs(await search('anon', { category: 'canh' })), ['003-canh-chua']);
    assert.deepEqual(slugs(await search('anon', { difficulty: 'hard' })), ['003-canh-chua']);
    assert.deepEqual(slugs(await search('anon', { category: 'canh', difficulty: 'easy' })), []);
  });

  it('filters by total time and excludes unknown times (NULL is not 0)', async () => {
    assert.deepEqual(slugs(await search('anon', { max: 30 })), ['002-dau-sot', '003-canh-chua']);
    assert.ok(!slugs(await search('anon', { max: 100000 })).includes('004-bo-kho'));
    assert.ok(slugs(await search('anon', {})).includes('004-bo-kho'));
  });

  it('paginates with a stable total_count and clamps limit/offset', async () => {
    const page1 = await search('anon', { limit: 2 });
    const page2 = await search('anon', { limit: 2, offset: 2 });
    assert.deepEqual(slugs(page1), ['001-thit-kho', '002-dau-sot']);
    assert.deepEqual(slugs(page2), ['003-canh-chua', '004-bo-kho']);
    assert.equal(Number(page1.rows[0].total_count), 4);
    assert.equal((await search('anon', { limit: 0 })).rows.length, 1);
    assert.equal((await search('anon', { limit: 100000 })).rows.length, 4);
    assert.equal((await search('anon', { offset: -5 })).rows.length, 4);
  });

  it('returns category fields and the cover path', async () => {
    const [r] = (await search('anon', { q: 'canh chua' })).rows;
    assert.equal(r.category_slug, 'canh');
    assert.equal(r.category_name, 'Canh');
    assert.equal(r.cover_image_path, null);
  });

  it('is read-only: anon still cannot write recipes', async () => {
    const res = await as(db, 'anon', null, `update public.recipes set name = 'x' returning id`);
    assert.ok(res.error || res.rows.length === 0);
  });
});
