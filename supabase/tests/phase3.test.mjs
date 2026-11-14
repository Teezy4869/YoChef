// Phase 3 database tests: user features, one describe per step.
// Run: npm run test:db
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { admin, as, createDatabase } from './harness.mjs';

const INSUFFICIENT_PRIVILEGE = '42501';
const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';

let db;
let alice;
let bob;
let publishedId;
let stagedId;

before(async () => {
  db = await createDatabase();
  const [{ id: catId }] = await admin(db, `insert into public.categories (slug, name) values ('mon_chinh', 'Món chính') returning id`);
  [{ id: publishedId }] = await admin(
    db,
    `insert into public.recipes (slug, name, category_id, default_servings, status, published_at)
     values ('001-pub', 'Published', $1, 4, 'published', now()) returning id`,
    [catId],
  );
  [{ id: stagedId }] = await admin(
    db,
    `insert into public.recipes (slug, name, category_id, default_servings, status)
     values ('002-staged', 'Staged', $1, 4, 'staged') returning id`,
    [catId],
  );
  [{ id: alice }] = await admin(db, `insert into auth.users (email) values ('alice@example.test') returning id`);
  [{ id: bob }] = await admin(db, `insert into auth.users (email) values ('bob@example.test') returning id`);
});

after(async () => {
  await db?.close();
});

describe('3.1 favorites', () => {
  const add = (uid, owner, recipe) =>
    as(db, 'authenticated', uid, `insert into public.favorites (user_id, recipe_id) values ($1, $2) returning recipe_id`, [owner, recipe]);

  it('the owner adds, reads and removes a favorite', async () => {
    const ins = await add(alice, alice, publishedId);
    assert.equal(ins.error, null);
    const read = await as(db, 'authenticated', alice, `select recipe_id from public.favorites`);
    assert.deepEqual(read.rows, [{ recipe_id: publishedId }]);
    const dup = await add(alice, alice, publishedId);
    assert.equal(dup.error?.code, UNIQUE_VIOLATION);
  });

  it('another user sees, removes and adds nothing for the owner', async () => {
    const read = await as(db, 'authenticated', bob, `select recipe_id from public.favorites`);
    assert.deepEqual(read.rows, []);
    const del = await as(db, 'authenticated', bob, `delete from public.favorites where user_id = $1 returning recipe_id`, [alice]);
    assert.deepEqual(del.rows, []);
    const forge = await add(bob, alice, publishedId);
    assert.equal(forge.error?.code, INSUFFICIENT_PRIVILEGE);
    const [still] = await admin(db, `select count(*)::int n from public.favorites where user_id = $1`, [alice]);
    assert.equal(still.n, 1);
  });

  it('only a published recipe can be added', async () => {
    const staged = await add(bob, bob, stagedId);
    assert.equal(staged.error?.code, INSUFFICIENT_PRIVILEGE);
  });

  it('anon has no access, and nobody can update a favorite', async () => {
    const read = await as(db, 'anon', null, `select recipe_id from public.favorites`);
    assert.equal(read.error?.code, INSUFFICIENT_PRIVILEGE);
    const ins = await as(db, 'anon', null, `insert into public.favorites (user_id, recipe_id) values ($1, $2)`, [alice, publishedId]);
    assert.equal(ins.error?.code, INSUFFICIENT_PRIVILEGE);
    const upd = await as(db, 'authenticated', alice, `update public.favorites set created_at = now() where user_id = $1`, [alice]);
    assert.equal(upd.error?.code, INSUFFICIENT_PRIVILEGE);
  });

  it('goes away with its recipe and with its user', async () => {
    await add(bob, bob, publishedId);
    const [{ id: temp }] = await admin(
      db,
      `insert into public.recipes (slug, name, default_servings, status, published_at, category_id)
       select '003-temp', 'Temp', 2, 'published', now(), category_id from public.recipes where id = $1 returning id`,
      [publishedId],
    );
    await add(alice, alice, temp);
    await admin(db, `delete from public.recipes where id = $1`, [temp]);
    const [byRecipe] = await admin(db, `select count(*)::int n from public.favorites where recipe_id = $1`, [temp]);
    assert.equal(byRecipe.n, 0);

    await admin(db, `delete from auth.users where id = $1`, [bob]);
    const [byUser] = await admin(db, `select count(*)::int n from public.favorites where user_id = $1`, [bob]);
    assert.equal(byUser.n, 0);
    [{ id: bob }] = await admin(db, `insert into auth.users (email) values ('bob2@example.test') returning id`);
  });

  it('the owner removes their own favorite', async () => {
    const del = await as(db, 'authenticated', alice, `delete from public.favorites where recipe_id = $1 returning recipe_id`, [publishedId]);
    assert.deepEqual(del.rows, [{ recipe_id: publishedId }]);
  });
});

describe('3.2 shopping lists', () => {
  let listA;
  const newList = (uid, owner, extra = {}) =>
    as(db, 'authenticated', uid,
      `insert into public.shopping_lists (user_id, source_recipe_id) values ($1, $2) returning id, name`,
      [owner, extra.source ?? null]);
  const addItem = (uid, list, fields = {}) =>
    as(db, 'authenticated', uid,
      `insert into public.shopping_list_items (shopping_list_id, label, quantity, unit, note)
       values ($1, $2, $3, $4, $5) returning id`,
      [list, fields.label ?? 'Thịt bò', fields.quantity ?? null, fields.unit ?? null, fields.note ?? null]);

  it('the owner creates a list with the default name and fills it', async () => {
    const { rows, error } = await newList(alice, alice);
    assert.equal(error, null);
    assert.equal(rows[0].name, 'Danh sách mua sắm');
    listA = rows[0].id;
    assert.equal((await addItem(alice, listA, { quantity: 500, unit: 'g' })).error, null);
    assert.equal((await addItem(alice, listA, { label: 'Muối', note: 'vừa ăn' })).error, null); // NULL quantity
    const read = await as(db, 'authenticated', alice,
      `select label, quantity, is_checked from public.shopping_list_items where shopping_list_id = $1 order by label`, [listA]);
    assert.deepEqual(read.rows, [
      { label: 'Muối', quantity: null, is_checked: false },
      { label: 'Thịt bò', quantity: '500', is_checked: false },
    ]);
    const tick = await as(db, 'authenticated', alice,
      `update public.shopping_list_items set is_checked = true where shopping_list_id = $1 and label = 'Muối' returning id`, [listA]);
    assert.equal(tick.rows.length, 1);
  });

  it('another user reads, edits, deletes and adds nothing on the owner list', async () => {
    const lists = await as(db, 'authenticated', bob, `select id from public.shopping_lists`);
    const items = await as(db, 'authenticated', bob, `select id from public.shopping_list_items`);
    assert.deepEqual([lists.rows, items.rows], [[], []]);
    const rename = await as(db, 'authenticated', bob, `update public.shopping_lists set name = 'x' where id = $1 returning id`, [listA]);
    const tick = await as(db, 'authenticated', bob, `update public.shopping_list_items set is_checked = true returning id`);
    const delItems = await as(db, 'authenticated', bob, `delete from public.shopping_list_items returning id`);
    const delList = await as(db, 'authenticated', bob, `delete from public.shopping_lists where id = $1 returning id`, [listA]);
    assert.deepEqual([rename.rows, tick.rows, delItems.rows, delList.rows], [[], [], [], []]);
    assert.equal((await addItem(bob, listA)).error?.code, INSUFFICIENT_PRIVILEGE);
    assert.equal((await newList(bob, alice)).error?.code, INSUFFICIENT_PRIVILEGE);
    const [n] = await admin(db, `select count(*)::int n from public.shopping_list_items where shopping_list_id = $1`, [listA]);
    assert.equal(n.n, 2);
  });

  it('an item cannot move to another list, and a list cannot change owner', async () => {
    const { rows: [{ id: listB }] } = await newList(bob, bob);
    const move = await as(db, 'authenticated', alice,
      `update public.shopping_list_items set shopping_list_id = $1 where shopping_list_id = $2`, [listB, listA]);
    assert.equal(move.error?.code, INSUFFICIENT_PRIVILEGE);
    const give = await as(db, 'authenticated', alice, `update public.shopping_lists set user_id = $1 where id = $2`, [bob, listA]);
    assert.equal(give.error?.code, INSUFFICIENT_PRIVILEGE);
  });

  it('rejects 0, blank labels and empty strings: unknown is NULL', async () => {
    assert.equal((await addItem(alice, listA, { quantity: 0 })).error?.code, CHECK_VIOLATION);
    assert.equal((await addItem(alice, listA, { label: '   ' })).error?.code, CHECK_VIOLATION);
    assert.equal((await addItem(alice, listA, { unit: '' })).error?.code, CHECK_VIOLATION);
    assert.equal((await addItem(alice, listA, { note: ' ' })).error?.code, CHECK_VIOLATION);
    assert.equal((await addItem(alice, listA, { label: 'x'.repeat(101) })).error?.code, CHECK_VIOLATION);
  });

  it('a list can come from a published recipe only', async () => {
    assert.equal((await newList(alice, alice, { source: stagedId })).error?.code, INSUFFICIENT_PRIVILEGE);
    const ok = await newList(alice, alice, { source: publishedId });
    assert.equal(ok.error, null);
  });

  it('anon has no access', async () => {
    const read = await as(db, 'anon', null, `select id from public.shopping_list_items`);
    assert.equal(read.error?.code, INSUFFICIENT_PRIVILEGE);
    const ins = await as(db, 'anon', null, `insert into public.shopping_lists (user_id) values ($1)`, [alice]);
    assert.equal(ins.error?.code, INSUFFICIENT_PRIVILEGE);
  });

  it('deleting a list removes its items', async () => {
    const del = await as(db, 'authenticated', alice, `delete from public.shopping_lists where id = $1 returning id`, [listA]);
    assert.equal(del.rows.length, 1);
    const [n] = await admin(db, `select count(*)::int n from public.shopping_list_items where shopping_list_id = $1`, [listA]);
    assert.equal(n.n, 0);
  });
});

describe('3.3 ratings', () => {
  const rate = (uid, owner, recipe, score) =>
    as(db, 'authenticated', uid,
      `insert into public.ratings (user_id, recipe_id, score) values ($1, $2, $3) returning id`, [owner, recipe, score]);
  const summary = (role, uid, recipe) =>
    as(db, role, uid, `select rating_count, avg_score from public.recipe_rating_summary where recipe_id = $1`, [recipe]);

  it('a recipe without ratings has no summary row (unknown, not 0)', async () => {
    const { rows, error } = await summary('anon', null, publishedId);
    assert.equal(error, null);
    assert.deepEqual(rows, []);
  });

  it('users rate once, change their own score, and the average follows', async () => {
    assert.equal((await rate(alice, alice, publishedId, 5)).error, null);
    assert.equal((await rate(bob, bob, publishedId, 2)).error, null);
    assert.equal((await rate(alice, alice, publishedId, 4)).error?.code, UNIQUE_VIOLATION);
    const upd = await as(db, 'authenticated', alice,
      `update public.ratings set score = 4 where user_id = $1 and recipe_id = $2 returning score`, [alice, publishedId]);
    assert.deepEqual(upd.rows, [{ score: 4 }]);
    for (const [role, uid] of [['anon', null], ['authenticated', bob]]) {
      const { rows } = await summary(role, uid, publishedId);
      assert.deepEqual(rows, [{ rating_count: 2, avg_score: '3.0' }], role);
    }
    const anonRows = await as(db, 'anon', null, `select score from public.ratings where recipe_id = $1 order by score`, [publishedId]);
    assert.deepEqual(anonRows.rows, [{ score: 2 }, { score: 4 }]);
  });

  it('scores are 1 to 5', async () => {
    const [{ id: other }] = await admin(db,
      `insert into public.recipes (slug, name, default_servings, status, published_at, category_id)
       select '004-rate', 'Rate', 2, 'published', now(), category_id from public.recipes where id = $1 returning id`, [publishedId]);
    assert.equal((await rate(alice, alice, other, 6)).error?.code, CHECK_VIOLATION);
    assert.equal((await rate(alice, alice, other, 0)).error?.code, CHECK_VIOLATION);
  });

  it('nobody changes or removes another user score, or rates as someone else', async () => {
    const upd = await as(db, 'authenticated', bob, `update public.ratings set score = 1 where user_id = $1 returning id`, [alice]);
    const del = await as(db, 'authenticated', bob, `delete from public.ratings where user_id = $1 returning id`, [alice]);
    assert.deepEqual([upd.rows, del.rows], [[], []]);
    const other = await admin(db, `select id from public.recipes where slug = '004-rate'`);
    assert.equal((await rate(bob, alice, other[0].id, 3)).error?.code, INSUFFICIENT_PRIVILEGE);
    const move = await as(db, 'authenticated', alice, `update public.ratings set recipe_id = $1 where user_id = $2`, [other[0].id, alice]);
    assert.equal(move.error?.code, INSUFFICIENT_PRIVILEGE);
  });

  it('staged recipes cannot be rated and their ratings stay hidden', async () => {
    assert.equal((await rate(alice, alice, stagedId, 3)).error?.code, INSUFFICIENT_PRIVILEGE);
    await admin(db, `insert into public.ratings (user_id, recipe_id, score) values ($1, $2, 3)`, [bob, stagedId]);
    const anon = await as(db, 'anon', null, `select id from public.ratings where recipe_id = $1`, [stagedId]);
    const sum = await summary('anon', null, stagedId);
    assert.deepEqual([anon.rows, sum.rows], [[], []]);
  });

  it('anon cannot write; a super admin may remove a score', async () => {
    const ins = await as(db, 'anon', null, `insert into public.ratings (user_id, recipe_id, score) values ($1, $2, 3)`, [alice, publishedId]);
    assert.equal(ins.error?.code, INSUFFICIENT_PRIVILEGE);
    const [{ id: admUser }] = await admin(db, `insert into auth.users (email) values ('admin@example.test') returning id`);
    await admin(db, `insert into public.user_roles (user_id, role) values ($1, 'super_admin')`, [admUser]);
    const del = await as(db, 'authenticated', admUser, `delete from public.ratings where user_id = $1 and recipe_id = $2 returning id`, [bob, publishedId]);
    assert.equal(del.rows.length, 1);
    const { rows } = await summary('anon', null, publishedId);
    assert.deepEqual(rows, [{ rating_count: 1, avg_score: '4.0' }]);
  });
});
