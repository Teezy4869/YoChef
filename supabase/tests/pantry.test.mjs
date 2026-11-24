// Pantry database tests: user_pantry table, RLS, grants, merge, deduct, and recipe matching.
// Run: npm run test:db
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { admin, as, createDatabase } from './harness.mjs';

const INSUFFICIENT_PRIVILEGE = '42501';
const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';
const INVALID_PARAM = '22023';

let db;
let alice;
let bob;
let ingBeef;
let ingEgg;
let ingSalt;
let pubFull;
let pubPartial;
let stagedRecipe;

before(async () => {
  db = await createDatabase();
  const [{ id: catId }] = await admin(db, `insert into public.categories (slug, name) values ('mon_chinh', 'Món chính') returning id`);
  [{ id: ingBeef }] = await admin(db, `insert into public.ingredients (slug, name, common_units) values ('thit-bo', 'Thịt bò', array['g','kg']) returning id`);
  [{ id: ingEgg }] = await admin(db, `insert into public.ingredients (slug, name, common_units) values ('trung-ga', 'Trứng gà', array['quả']) returning id`);
  [{ id: ingSalt }] = await admin(db, `insert into public.ingredients (slug, name, common_units) values ('muoi', 'Muối', array['g','muỗng cà phê']) returning id`);

  [{ id: pubFull }] = await admin(
    db,
    `insert into public.recipes (slug, name, category_id, default_servings, status, published_at)
     values ('001-bo-ne', 'Bò né', $1, 2, 'published', now()) returning id`,
    [catId],
  );
  await admin(
    db,
    `insert into public.recipe_ingredients (recipe_id, ingredient_id, sort_order, quantity, unit, quantity_basis, is_optional)
     values ($1, $2, 1, 300, 'g', 'book', false), ($1, $3, 2, 2, 'quả', 'book', false), ($1, $4, 3, null, null, 'to_taste', true)`,
    [pubFull, ingBeef, ingEgg, ingSalt],
  );

  [{ id: pubPartial }] = await admin(
    db,
    `insert into public.recipes (slug, name, category_id, default_servings, status, published_at)
     values ('002-trung-chien', 'Trứng chiên muối', $1, 2, 'published', now()) returning id`,
    [catId],
  );
  await admin(
    db,
    `insert into public.recipe_ingredients (recipe_id, ingredient_id, sort_order, quantity, unit, quantity_basis, is_optional)
     values ($1, $2, 1, 3, 'quả', 'book', false), ($1, $3, 2, 5, 'g', 'book', false)`,
    [pubPartial, ingEgg, ingSalt],
  );

  [{ id: stagedRecipe }] = await admin(
    db,
    `insert into public.recipes (slug, name, category_id, default_servings, status)
     values ('003-staged', 'Món nháp', $1, 2, 'staged') returning id`,
    [catId],
  );
  await admin(
    db,
    `insert into public.recipe_ingredients (recipe_id, ingredient_id, sort_order, quantity, unit, quantity_basis, is_optional)
     values ($1, $2, 1, 100, 'g', 'book', false)`,
    [stagedRecipe, ingBeef],
  );

  [{ id: alice }] = await admin(db, `insert into auth.users (email) values ('alice@example.test') returning id`);
  [{ id: bob }] = await admin(db, `insert into auth.users (email) values ('bob@example.test') returning id`);
});

after(async () => {
  await db?.close();
});

describe('user_pantry', () => {
  it('owner can insert, read, update, delete; enforces unique (user_id, ingredient_id) and positive qty', async () => {
    const ins = await as(
      db,
      'authenticated',
      alice,
      `insert into public.user_pantry (user_id, ingredient_id, quantity, unit) values ($1, $2, 500, 'g') returning id`,
      [alice, ingBeef],
    );
    assert.equal(ins.error, null);

    const dup = await as(
      db,
      'authenticated',
      alice,
      `insert into public.user_pantry (user_id, ingredient_id, quantity, unit) values ($1, $2, 200, 'g')`,
      [alice, ingBeef],
    );
    assert.equal(dup.error?.code, UNIQUE_VIOLATION);

    const zero = await as(
      db,
      'authenticated',
      alice,
      `insert into public.user_pantry (user_id, ingredient_id, quantity, unit) values ($1, $2, 0, 'quả')`,
      [alice, ingEgg],
    );
    assert.equal(zero.error?.code, CHECK_VIOLATION);

    const upd = await as(
      db,
      'authenticated',
      alice,
      `update public.user_pantry set quantity = 750 where user_id = $1 and ingredient_id = $2 returning quantity`,
      [alice, ingBeef],
    );
    assert.equal(upd.error, null);
    assert.equal(Number(upd.rows[0].quantity), 750);
  });

  it('isolates users via RLS and blocks anon completely', async () => {
    const bobRead = await as(db, 'authenticated', bob, `select id from public.user_pantry`);
    assert.deepEqual(bobRead.rows, []);

    const bobInsAlice = await as(
      db,
      'authenticated',
      bob,
      `insert into public.user_pantry (user_id, ingredient_id, quantity, unit) values ($1, $2, 1, 'quả')`,
      [alice, ingEgg],
    );
    assert.equal(bobInsAlice.error?.code, INSUFFICIENT_PRIVILEGE);

    const bobDel = await as(db, 'authenticated', bob, `delete from public.user_pantry where user_id = $1 returning id`, [alice]);
    assert.deepEqual(bobDel.rows, []);

    const anonRead = await as(db, 'anon', null, `select id from public.user_pantry`);
    assert.equal(anonRead.error?.code, INSUFFICIENT_PRIVILEGE);

    const anonRpc = await as(db, 'anon', null, `select public.deduct_pantry_ingredients('[]'::jsonb)`);
    assert.equal(anonRpc.error?.code, INSUFFICIENT_PRIVILEGE);
  });

  it('add_or_merge_pantry_items merges same/convertible units and removes moved shopping items atomically', async () => {
    const { rows: [{ id: listId }] } = await as(
      db,
      'authenticated',
      alice,
      `insert into public.shopping_lists (user_id) values ($1) returning id`,
      [alice],
    );
    const { rows: [{ id: itemId }] } = await as(
      db,
      'authenticated',
      alice,
      `insert into public.shopping_list_items (shopping_list_id, ingredient_id, label, quantity, unit, is_checked)
       values ($1, $2, 'Thịt bò', 1, 'kg', true) returning id`,
      [listId, ingBeef],
    );

    // Currently Alice has 750 g of beef. Merging 1 kg should yield 1750 g and delete the shopping item.
    const merge = await as(
      db,
      'authenticated',
      alice,
      `select public.add_or_merge_pantry_items($1::jsonb, $2::uuid[])`,
      [
        JSON.stringify([
          { ingredient_id: ingBeef, quantity: 1, unit: 'kg' },
          { ingredient_id: ingEgg, quantity: 4, unit: 'quả' },
        ]),
        [itemId],
      ],
    );
    assert.equal(merge.error, null);

    const pantry = await as(
      db,
      'authenticated',
      alice,
      `select ingredient_id, quantity, unit from public.user_pantry order by unit`,
    );
    assert.equal(pantry.rows.length, 2);
    const beef = pantry.rows.find((r) => r.ingredient_id === ingBeef);
    const egg = pantry.rows.find((r) => r.ingredient_id === ingEgg);
    assert.equal(Number(beef.quantity), 1750);
    assert.equal(beef.unit, 'g');
    assert.equal(Number(egg.quantity), 4);
    assert.equal(egg.unit, 'quả');

    const leftItems = await as(db, 'authenticated', alice, `select id from public.shopping_list_items where id = $1`, [itemId]);
    assert.deepEqual(leftItems.rows, []);
  });

  it('add_or_merge_pantry_items rolls back on invalid payload', async () => {
    const bad = await as(
      db,
      'authenticated',
      alice,
      `select public.add_or_merge_pantry_items($1::jsonb, null)`,
      [JSON.stringify([{ ingredient_id: ingSalt, quantity: 0, unit: 'g' }])],
    );
    assert.equal(bad.error?.code, INVALID_PARAM);
  });

  it('match_recipes_from_pantry ranks fully matched published recipes first and hides staged', async () => {
    // Alice has beef and eggs (100% required of pubFull, 50% required of pubPartial).
    const res = await as(db, 'authenticated', alice, `select slug, matched_count, required_count, missing_count from public.match_recipes_from_pantry(20, 0)`);
    assert.equal(res.error, null);
    assert.deepEqual(res.rows, [
      { slug: '001-bo-ne', matched_count: 2, required_count: 2, missing_count: 0 },
      { slug: '002-trung-chien', matched_count: 1, required_count: 2, missing_count: 1 },
    ]);
  });

  it('deduct_pantry_ingredients subtracts convertible units and deletes items depleted to 0 or below', async () => {
    // Alice has 1750 g beef and 4 quả egg. Deduct 1.25 kg beef (-> 500 g left) and 5 quả egg (-> deleted, never negative).
    const ded = await as(
      db,
      'authenticated',
      alice,
      `select public.deduct_pantry_ingredients($1::jsonb)`,
      [
        JSON.stringify([
          { ingredient_id: ingBeef, quantity: 1.25, unit: 'kg' },
          { ingredient_id: ingEgg, quantity: 5, unit: 'quả' },
        ]),
      ],
    );
    assert.equal(ded.error, null);

    const pantry = await as(db, 'authenticated', alice, `select ingredient_id, quantity, unit from public.user_pantry`);
    assert.equal(pantry.rows.length, 1);
    assert.equal(pantry.rows[0].ingredient_id, ingBeef);
    assert.equal(Number(pantry.rows[0].quantity), 500);
    assert.equal(pantry.rows[0].unit, 'g');
  });
});
