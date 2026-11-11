// Phase 1 database tests: migration 20261111120000_avatars_owner_profile.
// Run: npm run test:db
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { admin, as, createDatabase } from './harness.mjs';

let db;
let alice;
let bob;

before(async () => {
  db = await createDatabase();
  [{ id: alice }] = await admin(db, `insert into auth.users (email) values ('alice@example.test') returning id`);
  [{ id: bob }] = await admin(db, `insert into auth.users (email) values ('bob@example.test') returning id`);
  await admin(db, `update public.profiles set bio = 'Bio của Alice' where id = $1`, [alice]);
});

after(async () => {
  await db?.close();
});

describe('avatars bucket', () => {
  it('is public, 5 MB, images only', async () => {
    const [b] = await admin(db, `select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'avatars'`);
    assert.equal(b.public, true);
    assert.equal(b.file_size_limit, 5242880);
    assert.deepEqual(b.allowed_mime_types, ['image/jpeg', 'image/png', 'image/webp']);
  });

  it('a user uploads only inside their own folder', async () => {
    const own = await as(db, 'authenticated', alice,
      `insert into storage.objects (bucket_id, name, owner) values ('avatars', $1, $2) returning id`, [`${alice}/a.webp`, alice]);
    assert.equal(own.error, null);
    assert.equal(own.rows.length, 1);

    const other = await as(db, 'authenticated', alice,
      `insert into storage.objects (bucket_id, name, owner) values ('avatars', $1, $2) returning id`, [`${bob}/a.webp`, alice]);
    assert.ok(other.error || other.rows.length === 0, 'inserting into another user folder must fail');
  });

  it('anon cannot upload, and a user cannot overwrite or delete another user object', async () => {
    const anon = await as(db, 'anon', null,
      `insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${alice}/anon.webp`]);
    assert.ok(anon.error, 'anon insert must fail');

    await admin(db, `insert into storage.objects (bucket_id, name, owner) values ('avatars', $1, $2)`, [`${bob}/b.webp`, bob]);
    const upd = await as(db, 'authenticated', alice,
      `update storage.objects set name = name where bucket_id = 'avatars' and name = $1 returning id`, [`${bob}/b.webp`]);
    assert.equal(upd.rows.length, 0, 'update of another user object must touch nothing');
    const del = await as(db, 'authenticated', alice,
      `delete from storage.objects where bucket_id = 'avatars' and name = $1 returning id`, [`${bob}/b.webp`]);
    assert.equal(del.rows.length, 0, 'delete of another user object must touch nothing');
    const [still] = await admin(db, `select count(*)::int n from storage.objects where name = $1`, [`${bob}/b.webp`]);
    assert.equal(still.n, 1);
  });

  it('a user cannot list another user avatar objects', async () => {
    const { rows } = await as(db, 'authenticated', alice,
      `select name from storage.objects where bucket_id = 'avatars' and name like $1`, [`${bob}/%`]);
    assert.deepEqual(rows, []);
  });
});

describe('get_my_profile', () => {
  it('returns the caller row including bio', async () => {
    const { rows, error } = await as(db, 'authenticated', alice, `select id, bio from public.get_my_profile()`);
    assert.equal(error, null);
    assert.deepEqual(rows, [{ id: alice, bio: 'Bio của Alice' }]);
  });

  it('never returns another user row, and anon cannot call it', async () => {
    const bobView = await as(db, 'authenticated', bob, `select id from public.get_my_profile()`);
    assert.deepEqual(bobView.rows, [{ id: bob }]);
    const anon = await as(db, 'anon', null, `select id from public.get_my_profile()`);
    assert.ok(anon.error, 'anon must not execute get_my_profile');
  });

  it('bio is still hidden from the public profiles table', async () => {
    const anon = await as(db, 'anon', null, `select bio from public.profiles`);
    assert.ok(anon.error, 'anon has no SELECT on bio');
    const auth = await as(db, 'authenticated', bob, `select bio from public.profiles`);
    assert.ok(auth.error, 'authenticated has no SELECT on bio through profiles either');
  });
});
