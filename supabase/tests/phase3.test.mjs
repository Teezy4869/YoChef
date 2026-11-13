// Phase 3 database tests: user features, one describe per step.
// Run: npm run test:db
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { admin, as, createDatabase } from './harness.mjs';

const INSUFFICIENT_PRIVILEGE = '42501';
const UNIQUE_VIOLATION = '23505';

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
