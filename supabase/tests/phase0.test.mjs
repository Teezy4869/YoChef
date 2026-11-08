// Phase 0 database tests: migrations 0001_catalog and 0002_identity_rbac.
// Run: npm run test:db
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { admin, adminError, as, createDatabase } from './harness.mjs';

const INSUFFICIENT_PRIVILEGE = '42501';
const CHECK_VIOLATION = '23514';

let db;
let alice;
let bob;
let catId;
let ingId;
let publishedId;
let stagedId;

before(async () => {
  db = await createDatabase();

  [{ id: catId }] = await admin(db, `insert into public.categories (slug, name) values ('mon_chinh', 'Món chính') returning id`);
  [{ id: ingId }] = await admin(db, `insert into public.ingredients (slug, name) values ('toi', 'Tỏi') returning id`);
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
  for (const rid of [publishedId, stagedId]) {
    await admin(
      db,
      `insert into public.recipe_ingredients (recipe_id, ingredient_id, sort_order, quantity, unit, quantity_basis)
       values ($1, $2, 1, 10, 'g', 'book'), ($1, $2, 2, null, null, 'to_taste')`,
      [rid, ingId],
    );
    await admin(db, `insert into public.recipe_steps (recipe_id, step_number, instruction) values ($1, 1, 'Nấu')`, [rid]);
  }

  [{ id: alice }] = await admin(
    db,
    `insert into auth.users (email, raw_user_meta_data) values ('alice@example.test', '{"display_name":"  Alice  "}') returning id`,
  );
  [{ id: bob }] = await admin(db, `insert into auth.users (email) values ('bob@example.test') returning id`);
});

after(async () => {
  await db?.close();
});

describe('global security invariants', () => {
  it('RLS is enabled on every table in public', async () => {
    const rows = await admin(
      db,
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    assert.deepEqual(rows, []);
  });

  it('anon has no write privilege on any table in public', async () => {
    const rows = await admin(
      db,
      `select c.relname, p.priv from pg_class c join pg_namespace n on n.oid = c.relnamespace
       cross join unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) as p(priv)
       where n.nspname = 'public' and c.relkind = 'r' and has_table_privilege('anon', c.oid, p.priv)`,
    );
    assert.deepEqual(rows, []);
  });

  it('authenticated has no INSERT/DELETE/TRUNCATE on any table in public', async () => {
    const rows = await admin(
      db,
      `select c.relname, p.priv from pg_class c join pg_namespace n on n.oid = c.relnamespace
       cross join unnest(array['INSERT','DELETE','TRUNCATE']) as p(priv)
       where n.nspname = 'public' and c.relkind = 'r' and has_table_privilege('authenticated', c.oid, p.priv)`,
    );
    assert.deepEqual(rows, []);
  });

  it('every SECURITY DEFINER function pins search_path to empty', async () => {
    const rows = await admin(
      db,
      `select p.oid::regprocedure::text as fn, p.proconfig from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'private') and p.prosecdef
         and not coalesce('search_path=""' = any(p.proconfig), false)`,
    );
    assert.deepEqual(rows, []);
  });

  it('no is_admin() helper exists', async () => {
    const rows = await admin(db, `select 1 from pg_proc where proname = 'is_admin'`);
    assert.equal(rows.length, 0);
  });

  it('a table created later is not opened to anon or authenticated (default privileges)', async () => {
    await admin(db, `create table public.zz_probe (id int)`);
    const [row] = await admin(
      db,
      `select has_table_privilege('anon', 'public.zz_probe', 'SELECT') as anon_select,
              has_table_privilege('authenticated', 'public.zz_probe', 'INSERT') as auth_insert`,
    );
    await admin(db, `drop table public.zz_probe`);
    assert.deepEqual(row, { anon_select: false, auth_insert: false });
  });
});

describe('0001_catalog', () => {
  it('anon reads published recipes only', async () => {
    const { rows, error } = await as(db, 'anon', null, `select slug from public.recipes order by slug`);
    assert.equal(error, null);
    assert.deepEqual(rows, [{ slug: '001-pub' }]);
  });

  it('children of a staged recipe are hidden from anon and authenticated', async () => {
    for (const [role, uid] of [['anon', null], ['authenticated', alice]]) {
      const ing = await as(db, role, uid, `select recipe_id from public.recipe_ingredients where recipe_id = $1`, [stagedId]);
      const steps = await as(db, role, uid, `select recipe_id from public.recipe_steps where recipe_id = $1`, [stagedId]);
      assert.equal(ing.rows.length, 0, role);
      assert.equal(steps.rows.length, 0, role);
    }
    const pub = await as(db, 'anon', null, `select count(*)::int as n from public.recipe_ingredients where recipe_id = $1`, [publishedId]);
    assert.equal(pub.rows[0].n, 2);
  });

  it('taxonomy is publicly readable', async () => {
    const { rows } = await as(db, 'anon', null, `select slug from public.categories`);
    assert.deepEqual(rows, [{ slug: 'mon_chinh' }]);
  });

  it('clients cannot write catalog tables', async () => {
    for (const [role, uid] of [['anon', null], ['authenticated', alice]]) {
      const ins = await as(db, role, uid, `insert into public.categories (slug, name) values ('x', 'X')`);
      assert.equal(ins.error?.code, INSUFFICIENT_PRIVILEGE, `${role} insert`);
      const upd = await as(db, role, uid, `update public.recipes set name = 'hacked'`);
      assert.equal(upd.error?.code, INSUFFICIENT_PRIVILEGE, `${role} update`);
    }
  });

  it('"to taste" must be NULL, never 0', async () => {
    const zero = await adminError(
      db,
      `insert into public.recipe_ingredients (recipe_id, ingredient_id, sort_order, quantity, quantity_basis)
       values ($1, $2, 9, 0, 'to_taste')`,
      [publishedId, ingId],
    );
    assert.equal(zero?.code, CHECK_VIOLATION);
    const missing = await adminError(
      db,
      `insert into public.recipe_ingredients (recipe_id, ingredient_id, sort_order, quantity, quantity_basis)
       values ($1, $2, 9, null, 'book')`,
      [publishedId, ingId],
    );
    assert.equal(missing?.code, CHECK_VIOLATION);
  });

  it('a timer needs a duration', async () => {
    const err = await adminError(
      db,
      `insert into public.recipe_steps (recipe_id, step_number, instruction, timer_enabled) values ($1, 9, 'x', true)`,
      [publishedId],
    );
    assert.equal(err?.code, CHECK_VIOLATION);
  });

  it('a published recipe must be complete', async () => {
    const err = await adminError(
      db,
      `insert into public.recipes (slug, name, status) values ('003-bad', 'Bad', 'published')`,
    );
    assert.equal(err?.code, CHECK_VIOLATION);
  });

  it('updated_at is maintained by trigger', async () => {
    await admin(db, `update public.recipes set updated_at = '2000-01-01' where id = $1`, [publishedId]);
    const [row] = await admin(db, `select updated_at > now() - interval '1 minute' as fresh from public.recipes where id = $1`, [publishedId]);
    assert.equal(row.fresh, true);
  });

  it('recipe-images bucket exists and is public with limits', async () => {
    const [b] = await admin(db, `select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'recipe-images'`);
    assert.deepEqual(b, { public: true, file_size_limit: 5242880, allowed_mime_types: ['image/webp', 'image/jpeg', 'image/png'] });
  });
});

describe('0002_identity_rbac', () => {
  it('sign-up creates a profile with a trimmed display name', async () => {
    const rows = await admin(db, `select id, display_name from public.profiles order by display_name`);
    assert.deepEqual(rows, [
      { id: alice, display_name: 'Alice' },
      { id: bob, display_name: 'bob' },
    ]);
  });

  it('sign-up never fails on bad metadata', async () => {
    const long = 'x'.repeat(80);
    const [{ id: u1 }] = await admin(db, `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [
      'long@example.test',
      JSON.stringify({ display_name: long }),
    ]);
    const [{ id: u2 }] = await admin(db, `insert into auth.users (email, raw_user_meta_data) values (null, '{"display_name":"   "}') returning id`);
    const [p1] = await admin(db, `select display_name from public.profiles where id = $1`, [u1]);
    const [p2] = await admin(db, `select display_name from public.profiles where id = $1`, [u2]);
    assert.equal(p1.display_name, 'x'.repeat(50));
    assert.equal(p2.display_name, null);
  });

  it('profiles has no role column', async () => {
    const rows = await admin(db, `select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='role'`);
    assert.equal(rows.length, 0);
  });

  it('public reads display fields but not bio', async () => {
    const ok = await as(db, 'anon', null, `select id, display_name, avatar_path from public.profiles`);
    assert.equal(ok.error, null);
    const bio = await as(db, 'anon', null, `select bio from public.profiles`);
    assert.equal(bio.error?.code, INSUFFICIENT_PRIVILEGE);
  });

  it('a user updates only their own profile', async () => {
    const own = await as(db, 'authenticated', alice, `update public.profiles set display_name = 'Alice B' where id = $1 returning id`, [alice]);
    assert.equal(own.error, null);
    assert.equal(own.rows.length, 1);
    const other = await as(db, 'authenticated', alice, `update public.profiles set display_name = 'pwned' where id = $1 returning id`, [bob]);
    assert.equal(other.rows.length, 0);
    const [b] = await admin(db, `select display_name from public.profiles where id = $1`, [bob]);
    assert.equal(b.display_name, 'bob');
  });

  it('a user cannot create profiles or change their id', async () => {
    const ins = await as(db, 'authenticated', alice, `insert into public.profiles (id) values (gen_random_uuid())`);
    assert.equal(ins.error?.code, INSUFFICIENT_PRIVILEGE);
    const id = await as(db, 'authenticated', alice, `update public.profiles set id = gen_random_uuid() where id = $1`, [alice]);
    assert.equal(id.error?.code, INSUFFICIENT_PRIVILEGE);
  });

  it('avatar_path must live in the owner folder', async () => {
    const bad = await as(db, 'authenticated', alice, `update public.profiles set avatar_path = $2 where id = $1`, [alice, `${bob}/a.webp`]);
    assert.equal(bad.error?.code, CHECK_VIOLATION);
    const good = await as(db, 'authenticated', alice, `update public.profiles set avatar_path = $2 where id = $1`, [alice, `${alice}/a.webp`]);
    assert.equal(good.error, null);
  });

  it('users cannot grant themselves a role', async () => {
    for (const [role, uid] of [['anon', null], ['authenticated', alice]]) {
      const res = await as(db, role, uid, `insert into public.user_roles (user_id, role) values ($1, 'super_admin')`, [alice]);
      assert.equal(res.error?.code, INSUFFICIENT_PRIVILEGE, role);
    }
  });

  it('users read only their own roles, and helpers reflect them', async () => {
    await admin(db, `insert into public.user_roles (user_id, role) values ($1, 'editor')`, [bob]);

    const bobRoles = await as(db, 'authenticated', bob, `select role from public.user_roles`);
    assert.deepEqual(bobRoles.rows, [{ role: 'editor' }]);
    const aliceSees = await as(db, 'authenticated', alice, `select role from public.user_roles`);
    assert.deepEqual(aliceSees.rows, []);

    const bobH = await as(db, 'authenticated', bob,
      `select private.is_editor() e, private.is_moderator() m, private.is_super_admin() s, private.has_role('editor') h`);
    assert.deepEqual(bobH.rows, [{ e: true, m: false, s: false, h: true }]);
    const aliceH = await as(db, 'authenticated', alice, `select private.is_editor() e`);
    assert.deepEqual(aliceH.rows, [{ e: false }]);
  });

  it('super_admin implies editor and moderator', async () => {
    await admin(db, `insert into public.user_roles (user_id, role) values ($1, 'super_admin')`, [alice]);
    const { rows } = await as(db, 'authenticated', alice, `select private.is_editor() e, private.is_moderator() m, private.is_super_admin() s`);
    assert.deepEqual(rows, [{ e: true, m: true, s: true }]);
    await admin(db, `delete from public.user_roles where user_id = $1`, [alice]);
  });

  it('anon cannot execute role helpers', async () => {
    const res = await as(db, 'anon', null, `select private.is_editor()`);
    assert.equal(res.error?.code, INSUFFICIENT_PRIVILEGE);
  });

  it('deleting the auth user cascades to profile and roles', async () => {
    await admin(db, `delete from auth.users where id = $1`, [bob]);
    const p = await admin(db, `select 1 from public.profiles where id = $1`, [bob]);
    const r = await admin(db, `select 1 from public.user_roles where user_id = $1`, [bob]);
    assert.equal(p.length + r.length, 0);
  });
});
