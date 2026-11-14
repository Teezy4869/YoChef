// Phase 3 database tests: user features, one describe per step.
// Run: npm run test:db
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { admin, adminError, as, createDatabase } from './harness.mjs';

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

describe('3.4 comments', () => {
  let commentId;
  const post = (uid, owner, recipe, content) =>
    as(db, 'authenticated', uid,
      `insert into public.comments (user_id, recipe_id, content) values ($1, $2, $3) returning id, status`, [owner, recipe, content]);
  const visible = (role, uid) =>
    as(db, role, uid, `select id from public.comments where id = $1`, [commentId]).then((r) => r.rows.length === 1);
  const setStatus = (status) => admin(db, `update public.comments set status = $1 where id = $2`, [status, commentId]);

  it('a new comment waits for review and only its author sees it', async () => {
    const ins = await post(alice, alice, publishedId, 'Ngon lắm!');
    assert.equal(ins.error, null);
    assert.equal(ins.rows[0].status, 'pending');
    commentId = ins.rows[0].id;
    assert.deepEqual(
      [await visible('authenticated', alice), await visible('authenticated', bob), await visible('anon', null)],
      [true, false, false],
    );
  });

  it('a client can neither choose nor change the status', async () => {
    const forged = await as(db, 'authenticated', alice,
      `insert into public.comments (user_id, recipe_id, content, status) values ($1, $2, 'x', 'approved')`, [alice, publishedId]);
    assert.equal(forged.error?.code, INSUFFICIENT_PRIVILEGE);
    const upd = await as(db, 'authenticated', alice, `update public.comments set status = 'approved' where id = $1`, [commentId]);
    assert.equal(upd.error?.code, INSUFFICIENT_PRIVILEGE);
  });

  it('content is 1 to 1000 characters and not only whitespace', async () => {
    for (const content of ['', '   ', '\n\t ', 'a'.repeat(1001)]) {
      assert.equal((await post(alice, alice, publishedId, content)).error?.code, CHECK_VIOLATION, JSON.stringify(content.slice(0, 5)));
    }
    const max = await post(alice, alice, publishedId, 'ă'.repeat(1000));
    assert.equal(max.error, null);
    await admin(db, `delete from public.comments where id = $1`, [max.rows[0].id]);
  });

  it('an approved comment is public; editing its content sends it back to review', async () => {
    await setStatus('approved');
    assert.deepEqual([await visible('anon', null), await visible('authenticated', bob)], [true, true]);
    const same = await as(db, 'authenticated', alice, `update public.comments set content = content where id = $1 returning status`, [commentId]);
    assert.deepEqual(same.rows, [{ status: 'approved' }]);
    const edit = await as(db, 'authenticated', alice,
      `update public.comments set content = 'Ngon, hơi mặn' where id = $1 returning status`, [commentId]);
    assert.deepEqual(edit.rows, [{ status: 'pending' }]);
    assert.deepEqual([await visible('anon', null), await visible('authenticated', bob)], [false, false]);
  });

  it('nobody else edits or removes a comment, or comments as someone else or on a staged recipe', async () => {
    const upd = await as(db, 'authenticated', bob, `update public.comments set content = 'hacked' where id = $1 returning id`, [commentId]);
    const del = await as(db, 'authenticated', bob, `delete from public.comments where id = $1 returning id`, [commentId]);
    assert.deepEqual([upd.rows, del.rows], [[], []]);
    assert.equal((await post(bob, alice, publishedId, 'giả')).error?.code, INSUFFICIENT_PRIVILEGE);
    assert.equal((await post(alice, alice, stagedId, 'chưa công bố')).error?.code, INSUFFICIENT_PRIVILEGE);
    const move = await as(db, 'authenticated', alice, `update public.comments set recipe_id = $1 where id = $2`, [stagedId, commentId]);
    assert.equal(move.error?.code, INSUFFICIENT_PRIVILEGE);
    const anon = await as(db, 'anon', null, `insert into public.comments (user_id, recipe_id, content) values ($1, $2, 'x')`, [alice, publishedId]);
    assert.equal(anon.error?.code, INSUFFICIENT_PRIVILEGE);
  });

  it('an approved comment on a staged recipe stays hidden', async () => {
    const [{ id }] = await admin(db,
      `insert into public.comments (user_id, recipe_id, content, status) values ($1, $2, 'x', 'approved') returning id`, [bob, stagedId]);
    const anon = await as(db, 'anon', null, `select id from public.comments where id = $1`, [id]);
    assert.deepEqual(anon.rows, []);
  });

  it('a rejected comment is hidden from its author, who can no longer edit or remove it', async () => {
    await setStatus('rejected');
    assert.equal(await visible('authenticated', alice), false);
    const upd = await as(db, 'authenticated', alice, `update public.comments set content = 'sửa lại' where id = $1 returning id`, [commentId]);
    const del = await as(db, 'authenticated', alice, `delete from public.comments where id = $1 returning id`, [commentId]);
    assert.deepEqual([upd.rows, del.rows], [[], []]);
  });

  it('a moderator reads every comment but cannot edit, remove or re-status it; a super admin may remove it', async () => {
    const [{ id: mod }] = await admin(db, `insert into auth.users (email) values ('mod@example.test') returning id`);
    const [{ id: sup }] = await admin(db, `insert into auth.users (email) values ('super@example.test') returning id`);
    await admin(db, `insert into public.user_roles (user_id, role) values ($1, 'moderator'), ($2, 'super_admin')`, [mod, sup]);
    const all = await as(db, 'authenticated', mod, `select status from public.comments order by status`);
    assert.deepEqual(all.rows.map((r) => r.status), ['approved', 'rejected']);
    const upd = await as(db, 'authenticated', mod, `update public.comments set content = 'x' where id = $1 returning id`, [commentId]);
    const del = await as(db, 'authenticated', mod, `delete from public.comments where id = $1 returning id`, [commentId]);
    assert.deepEqual([upd.rows, del.rows], [[], []]);
    const status = await as(db, 'authenticated', mod, `update public.comments set status = 'approved' where id = $1`, [commentId]);
    assert.equal(status.error?.code, INSUFFICIENT_PRIVILEGE);
    const gone = await as(db, 'authenticated', sup, `delete from public.comments where id = $1 returning id`, [commentId]);
    assert.equal(gone.rows.length, 1);
  });
});

describe('3.5 cooking photos', () => {
  let mod;
  let sup;
  const upload = (uid, name) =>
    as(db, 'authenticated', uid, `insert into storage.objects (bucket_id, name) values ('cooking-photos', $1) returning name`, [name]);
  const addRow = (uid, owner, recipe, path, caption = null) =>
    as(db, 'authenticated', uid,
      `insert into public.cooking_photos (user_id, recipe_id, storage_path, caption) values ($1, $2, $3, $4) returning id, status`,
      [owner, recipe, path, caption]);
  const sees = (role, uid, name) =>
    as(db, role, uid, `select name from storage.objects where bucket_id = 'cooking-photos' and name = $1`, [name])
      .then((r) => r.rows.length === 1);
  const removeFile = (uid, name) =>
    as(db, 'authenticated', uid, `delete from storage.objects where bucket_id = 'cooking-photos' and name = $1 returning name`, [name]);
  const setStatus = (status, path) => admin(db, `update public.cooking_photos set status = $1 where storage_path = $2`, [status, path]);

  before(async () => {
    [{ id: mod }] = await admin(db, `insert into auth.users (email) values ('mod2@example.test') returning id`);
    [{ id: sup }] = await admin(db, `insert into auth.users (email) values ('super2@example.test') returning id`);
    await admin(db, `insert into public.user_roles (user_id, role) values ($1, 'moderator'), ($2, 'super_admin')`, [mod, sup]);
  });

  it('the bucket is private, at most 5 MB, images only', async () => {
    const [b] = await admin(db, `select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'cooking-photos'`);
    assert.deepEqual(
      { ...b, file_size_limit: Number(b.file_size_limit) },
      { public: false, file_size_limit: 5242880, allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'] },
    );
  });

  it('a new photo waits for review and only its author reads the file', async () => {
    const path = `${alice}/p1.jpg`;
    assert.equal((await upload(alice, path)).error, null);
    const row = await addRow(alice, alice, publishedId, path, 'Lần đầu nấu');
    assert.equal(row.error, null);
    assert.equal(row.rows[0].status, 'pending');
    assert.deepEqual(
      [await sees('authenticated', alice, path), await sees('authenticated', bob, path), await sees('anon', null, path)],
      [true, false, false],
    );
    const rowB = await as(db, 'authenticated', bob, `select id from public.cooking_photos where storage_path = $1`, [path]);
    assert.deepEqual(rowB.rows, []);
  });

  it('files and rows stay inside the author folder, with a safe file name', async () => {
    assert.equal((await upload(alice, `${bob}/x.jpg`)).error?.code, INSUFFICIENT_PRIVILEGE);
    for (const path of [`${bob}/x.jpg`, `${alice}/a/b.jpg`, `${alice}/x.gif`, `${alice}/../x.jpg`, `${alice}/`]) {
      assert.equal((await addRow(alice, alice, publishedId, path)).error?.code, CHECK_VIOLATION, path);
    }
    assert.equal((await addRow(bob, alice, publishedId, `${alice}/forged.jpg`)).error?.code, INSUFFICIENT_PRIVILEGE);
    assert.equal((await addRow(alice, alice, stagedId, `${alice}/staged.jpg`)).error?.code, INSUFFICIENT_PRIVILEGE);
    const anon = await as(db, 'anon', null, `insert into storage.objects (bucket_id, name) values ('cooking-photos', $1)`, [`${alice}/anon.jpg`]);
    assert.equal(anon.error?.code, INSUFFICIENT_PRIVILEGE);
  });

  it('captions are NULL or 1 to 250 characters; a client never writes status or the path', async () => {
    for (const caption of ['   ', 'a'.repeat(251)]) {
      assert.equal((await addRow(alice, alice, publishedId, `${alice}/c.jpg`, caption)).error?.code, CHECK_VIOLATION);
    }
    const forged = await as(db, 'authenticated', alice,
      `insert into public.cooking_photos (user_id, recipe_id, storage_path, status) values ($1, $2, $3, 'approved')`,
      [alice, publishedId, `${alice}/c.jpg`]);
    assert.equal(forged.error?.code, INSUFFICIENT_PRIVILEGE);
    const restatus = await as(db, 'authenticated', alice, `update public.cooking_photos set status = 'approved' where user_id = $1`, [alice]);
    assert.equal(restatus.error?.code, INSUFFICIENT_PRIVILEGE);
    const repath = await as(db, 'authenticated', alice,
      `update public.cooking_photos set storage_path = $1 where user_id = $2`, [`${alice}/z.jpg`, alice]);
    assert.equal(repath.error?.code, INSUFFICIENT_PRIVILEGE);
  });

  it('an approved photo is public; editing its caption sends it back to review', async () => {
    const path = `${alice}/p1.jpg`;
    await setStatus('approved', path);
    assert.deepEqual([await sees('anon', null, path), await sees('authenticated', bob, path)], [true, true]);
    const edit = await as(db, 'authenticated', alice,
      `update public.cooking_photos set caption = 'Lần hai' where storage_path = $1 returning status`, [path]);
    assert.deepEqual(edit.rows, [{ status: 'pending' }]);
    assert.deepEqual([await sees('anon', null, path), await sees('authenticated', bob, path)], [false, false]);
  });

  it('nobody overwrites a file, and nobody removes it while its row exists', async () => {
    const path = `${alice}/p1.jpg`;
    const swap = await as(db, 'authenticated', alice,
      `update storage.objects set name = $1 where bucket_id = 'cooking-photos' and name = $2 returning name`, [`${alice}/p9.jpg`, path]);
    assert.deepEqual(swap.rows, []);
    assert.deepEqual((await removeFile(alice, path)).rows, []);
    assert.deepEqual((await removeFile(bob, path)).rows, []);
  });

  it('an upload in flight is read and removed by its owner only', async () => {
    const path = `${alice}/inflight.jpg`;
    await upload(alice, path);
    assert.deepEqual([await sees('authenticated', alice, path), await sees('authenticated', bob, path)], [true, false]);
    assert.deepEqual((await removeFile(bob, path)).rows, []);
    assert.equal((await removeFile(alice, path)).rows.length, 1);
  });

  it('a rejected photo is hidden from its author, who cannot remove it; moderators read it, a super admin removes it', async () => {
    const path = `${alice}/p1.jpg`;
    await setStatus('rejected', path);
    assert.equal(await sees('authenticated', alice, path), false);
    const rowA = await as(db, 'authenticated', alice, `select id from public.cooking_photos where storage_path = $1`, [path]);
    const delRow = await as(db, 'authenticated', alice, `delete from public.cooking_photos where storage_path = $1 returning id`, [path]);
    assert.deepEqual([rowA.rows, delRow.rows, (await removeFile(alice, path)).rows], [[], [], []]);
    assert.equal(await sees('authenticated', mod, path), true);
    assert.deepEqual((await removeFile(mod, path)).rows, []);
    const gone = await as(db, 'authenticated', sup, `delete from public.cooking_photos where storage_path = $1 returning id`, [path]);
    assert.equal(gone.rows.length, 1);
    assert.equal((await removeFile(sup, path)).rows.length, 1);
  });

  it('the author removes a photo: the row first, then the file', async () => {
    const path = `${bob}/p2.webp`;
    await upload(bob, path);
    assert.equal((await addRow(bob, bob, publishedId, path)).error, null);
    const del = await as(db, 'authenticated', bob, `delete from public.cooking_photos where storage_path = $1 returning id`, [path]);
    assert.equal(del.rows.length, 1);
    assert.equal((await removeFile(bob, path)).rows.length, 1);
  });
});

describe('3.6 moderation', () => {
  let mod;
  let commentId;
  let photoId;
  const moderate = (role, uid, table, id, status, reason = null) =>
    as(db, role, uid, `select public.moderate_community_content($1, $2, $3, $4) as status`, [table, id, status, reason]);
  const visible = (role, uid, table, id) =>
    as(db, role, uid, `select id from public.${table} where id = $1`, [id]).then((r) => r.rows.length === 1);
  const history = (role, uid, id) =>
    as(db, role, uid, `select actor_id, from_status, to_status, reason from public.moderation_actions where target_id = $1 order by created_at, to_status`, [id]);

  before(async () => {
    [{ id: mod }] = await admin(db, `insert into auth.users (email) values ('mod3@example.test') returning id`);
    await admin(db, `insert into public.user_roles (user_id, role) values ($1, 'moderator')`, [mod]);
    [{ id: commentId }] = (await as(db, 'authenticated', alice,
      `insert into public.comments (user_id, recipe_id, content) values ($1, $2, 'Chờ duyệt') returning id`, [alice, publishedId])).rows;
    await admin(db, `insert into storage.objects (bucket_id, name) values ('cooking-photos', $1)`, [`${alice}/m1.jpg`]);
    [{ id: photoId }] = (await as(db, 'authenticated', alice,
      `insert into public.cooking_photos (user_id, recipe_id, storage_path) values ($1, $2, $3) returning id`,
      [alice, publishedId, `${alice}/m1.jpg`])).rows;
  });

  it('only a moderator may moderate; anon cannot even call the RPC', async () => {
    for (const uid of [alice, bob]) {
      assert.equal((await moderate('authenticated', uid, 'comments', commentId, 'approved')).error?.code, INSUFFICIENT_PRIVILEGE);
    }
    assert.equal((await moderate('anon', null, 'comments', commentId, 'approved')).error?.code, INSUFFICIENT_PRIVILEGE);
    const [{ status }] = await admin(db, `select status from public.comments where id = $1`, [commentId]);
    assert.equal(status, 'pending');
  });

  it('approving makes a comment and a photo public, with their file', async () => {
    assert.deepEqual((await moderate('authenticated', mod, 'comments', commentId, 'approved')).rows, [{ status: 'approved' }]);
    assert.deepEqual((await moderate('authenticated', mod, 'cooking_photos', photoId, 'approved', 'Ảnh rõ')).rows, [{ status: 'approved' }]);
    assert.deepEqual(
      [await visible('anon', null, 'comments', commentId), await visible('authenticated', bob, 'cooking_photos', photoId)],
      [true, true],
    );
    const file = await as(db, 'anon', null, `select name from storage.objects where name = $1`, [`${alice}/m1.jpg`]);
    assert.equal(file.rows.length, 1);
    const [row] = await admin(db, `select moderated_by, moderated_at is not null as stamped from public.comments where id = $1`, [commentId]);
    assert.deepEqual(row, { moderated_by: mod, stamped: true });
  });

  it('clients never read who moderated', async () => {
    for (const [role, uid] of [['anon', null], ['authenticated', alice], ['authenticated', mod]]) {
      for (const table of ['comments', 'cooking_photos']) {
        const r = await as(db, role, uid, `select moderated_by, moderated_at from public.${table}`);
        assert.equal(r.error?.code, INSUFFICIENT_PRIVILEGE, `${role} ${table}`);
      }
    }
  });

  it('rejecting hides the comment from its author, who can no longer edit it; restoring brings it back', async () => {
    assert.equal((await moderate('authenticated', mod, 'comments', commentId, 'rejected', '  Spam  ')).error, null);
    assert.deepEqual([await visible('anon', null, 'comments', commentId), await visible('authenticated', alice, 'comments', commentId)], [false, false]);
    const edit = await as(db, 'authenticated', alice, `update public.comments set content = 'x' where id = $1 returning id`, [commentId]);
    assert.deepEqual(edit.rows, []);
    assert.equal((await moderate('authenticated', mod, 'comments', commentId, 'approved')).error, null);
    assert.equal(await visible('anon', null, 'comments', commentId), true);
  });

  it('editing an approved comment after moderation sends it back to review', async () => {
    const edit = await as(db, 'authenticated', alice, `update public.comments set content = 'Đã sửa' where id = $1 returning status`, [commentId]);
    assert.deepEqual(edit.rows, [{ status: 'pending' }]);
    assert.equal(await visible('anon', null, 'comments', commentId), false);
  });

  it('every decision is recorded; only moderators read the history and nobody writes it', async () => {
    const { rows } = await history('authenticated', mod, commentId);
    assert.deepEqual(rows, [
      { actor_id: mod, from_status: 'pending', to_status: 'approved', reason: null },
      { actor_id: mod, from_status: 'approved', to_status: 'rejected', reason: 'Spam' },
      { actor_id: mod, from_status: 'rejected', to_status: 'approved', reason: null },
    ]);
    assert.deepEqual((await history('authenticated', alice, commentId)).rows, []);
    assert.equal((await history('anon', null, commentId)).error?.code, INSUFFICIENT_PRIVILEGE);
    const forge = await as(db, 'authenticated', mod,
      `insert into public.moderation_actions (actor_id, target_table, target_id, from_status, to_status) values ($1, 'comments', $2, 'pending', 'approved')`,
      [mod, commentId]);
    assert.equal(forge.error?.code, INSUFFICIENT_PRIVILEGE);
    for (const sql of [`update public.moderation_actions set reason = 'x'`, `delete from public.moderation_actions`]) {
      assert.equal((await as(db, 'authenticated', mod, sql)).error?.code, INSUFFICIENT_PRIVILEGE, sql);
      assert.equal(await adminError(db, sql).then((e) => e?.code), INSUFFICIENT_PRIVILEGE, `owner: ${sql}`);
    }
  });

  it('refuses an unknown status, table or item, and a reason over 500 characters, changing nothing', async () => {
    assert.equal((await moderate('authenticated', mod, 'comments', commentId, 'deleted')).error?.code, '22023');
    assert.equal((await moderate('authenticated', mod, 'comments', commentId, null)).error?.code, '22023');
    assert.equal((await moderate('authenticated', mod, 'recipes', publishedId, 'approved')).error?.code, '22023');
    assert.equal((await moderate('authenticated', mod, 'comments', publishedId, 'approved')).error?.code, 'P0002');
    const long = await moderate('authenticated', mod, 'cooking_photos', photoId, 'rejected', 'a'.repeat(501));
    assert.equal(long.error?.code, CHECK_VIOLATION);
    const [{ status }] = await admin(db, `select status from public.cooking_photos where id = $1`, [photoId]);
    assert.equal(status, 'approved');
  });
});
