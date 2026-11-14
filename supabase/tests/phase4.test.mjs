// Phase 4 database tests: admin and integrations, one describe per slice.
// Run: npm run test:db
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { admin, adminError, as, createDatabase } from './harness.mjs';

const INSUFFICIENT_PRIVILEGE = '42501';
const INVALID_PARAMETER = '22023';
const NO_DATA = 'P0002';

let db;
let sup; // super_admin
let sup2; // second super_admin, added in a test
let editor;
let moderator;
let user;

const user_ = (email) => admin(db, `insert into auth.users (email) values ($1) returning id`, [email]).then((r) => r[0].id);
const grant = (uid, role) => admin(db, `insert into public.user_roles (user_id, role) values ($1, $2)`, [uid, role]);
const rpc = (uid, sql, params = []) => as(db, uid ? 'authenticated' : 'anon', uid, sql, params);

before(async () => {
  db = await createDatabase();
  sup = await user_('sup@example.test');
  editor = await user_('editor@example.test');
  moderator = await user_('mod@example.test');
  user = await user_('user@example.test');
  await grant(sup, 'super_admin');
  await grant(moderator, 'moderator');
});

after(async () => {
  await db?.close();
});

describe('4.1 staff roles and audit log', () => {
  const manage = (uid, target, role, action, reason = 'Kiểm thử') =>
    rpc(uid, `select public.manage_user_role($1, $2, $3, $4) as changed`, [target, role, action, reason]);
  const rolesOf = (uid) =>
    admin(db, `select role from public.user_roles where user_id = $1 order by role`, [uid]).then((r) => r.map((x) => x.role));
  const audit = () => admin(db, `select actor_id, action, target_id, reason, details from public.admin_audit_logs order by created_at, id`);

  it('only a super admin manages roles; anon cannot even call the RPC', async () => {
    for (const uid of [editor, moderator, user]) {
      assert.equal((await manage(uid, user, 'editor', 'assign')).error?.code, INSUFFICIENT_PRIVILEGE);
    }
    assert.equal((await manage(null, user, 'editor', 'assign')).error?.code, INSUFFICIENT_PRIVILEGE);
    assert.deepEqual(await rolesOf(user), []);
  });

  it('assigns and revokes with a reason, logging each change once', async () => {
    assert.deepEqual((await manage(sup, editor, 'editor', 'assign', '  Biên tập viên mới  ')).rows, [{ changed: true }]);
    assert.deepEqual((await manage(sup, editor, 'editor', 'assign')).rows, [{ changed: false }]); // already held
    assert.deepEqual(await rolesOf(editor), ['editor']);
    const [{ granted_by }] = await admin(db, `select granted_by from public.user_roles where user_id = $1`, [editor]);
    assert.equal(granted_by, sup);
    assert.deepEqual((await manage(sup, user, 'moderator', 'assign')).rows, [{ changed: true }]);
    assert.deepEqual((await manage(sup, user, 'moderator', 'revoke')).rows, [{ changed: true }]);
    assert.deepEqual((await manage(sup, user, 'moderator', 'revoke')).rows, [{ changed: false }]);
    assert.deepEqual(await audit(), [
      { actor_id: sup, action: 'role.assign', target_id: editor, reason: 'Biên tập viên mới', details: { role: 'editor' } },
      { actor_id: sup, action: 'role.assign', target_id: user, reason: 'Kiểm thử', details: { role: 'moderator' } },
      { actor_id: sup, action: 'role.revoke', target_id: user, reason: 'Kiểm thử', details: { role: 'moderator' } },
    ]);
  });

  it('refuses a missing reason, action or user', async () => {
    for (const reason of [null, '   ']) {
      assert.equal((await manage(sup, user, 'editor', 'assign', reason)).error?.code, INVALID_PARAMETER);
    }
    assert.equal((await manage(sup, user, 'editor', 'promote')).error?.code, INVALID_PARAMETER);
    assert.equal((await manage(sup, '00000000-0000-0000-0000-000000000000', 'editor', 'assign')).error?.code, NO_DATA);
    assert.equal((await manage(sup, user, 'editor', 'assign', 'a'.repeat(501))).error?.code, '23514');
    assert.deepEqual(await rolesOf(user), []);
  });

  it('a super admin cannot revoke their own super admin role', async () => {
    assert.equal((await manage(sup, sup, 'super_admin', 'revoke')).error?.code, INSUFFICIENT_PRIVILEGE);
    assert.deepEqual(await rolesOf(sup), ['super_admin']);
  });

  it('the last active super admin cannot be removed, not even by deleting the account', async () => {
    assert.equal((await adminError(db, `delete from public.user_roles where user_id = $1`, [sup]))?.code, INSUFFICIENT_PRIVILEGE);
    assert.equal((await adminError(db, `delete from auth.users where id = $1`, [sup]))?.code, INSUFFICIENT_PRIVILEGE);
    sup2 = await user_('sup2@example.test');
    assert.deepEqual((await manage(sup, sup2, 'super_admin', 'assign')).rows, [{ changed: true }]);
    // A banned second super admin does not count as active.
    await admin(db, `update auth.users set banned_until = now() + interval '1 day' where id = $1`, [sup2]);
    assert.equal((await manage(sup2, sup, 'super_admin', 'revoke')).error?.code, INSUFFICIENT_PRIVILEGE); // sup2 is banned, sup is the last active
    await admin(db, `update auth.users set banned_until = null where id = $1`, [sup2]);
    assert.deepEqual((await manage(sup2, sup, 'super_admin', 'revoke')).rows, [{ changed: true }]);
    assert.equal((await manage(sup, sup2, 'super_admin', 'revoke')).error?.code, INSUFFICIENT_PRIVILEGE); // no longer a super admin
    assert.equal((await adminError(db, `delete from auth.users where id = $1`, [sup2]))?.code, INSUFFICIENT_PRIVILEGE);
    assert.deepEqual((await manage(sup2, sup, 'super_admin', 'assign')).rows, [{ changed: true }]);
  });

  it('staff listing, lookup by email and the audit log are for super admins only', async () => {
    const staff = await rpc(sup, `select email, roles::text[] as roles from public.list_staff()`);
    assert.deepEqual(staff.rows, [
      { email: 'editor@example.test', roles: ['editor'] },
      { email: 'mod@example.test', roles: ['moderator'] },
      { email: 'sup2@example.test', roles: ['super_admin'] },
      { email: 'sup@example.test', roles: ['super_admin'] },
    ]);
    const found = await rpc(sup, `select user_id, roles::text[] as roles from public.find_user_by_email($1)`, ['  USER@example.test ']);
    assert.deepEqual(found.rows, [{ user_id: user, roles: [] }]);
    assert.deepEqual((await rpc(sup, `select user_id from public.find_user_by_email('nobody@example.test')`)).rows, []);
    const logs = await rpc(sup, `select action, actor_id from public.list_admin_audit_logs(2)`);
    assert.equal(logs.rows.length, 2);
    assert.equal(logs.rows[0].action, 'role.assign');
    for (const uid of [editor, moderator, user, null]) {
      for (const sql of [
        `select * from public.list_staff()`,
        `select * from public.find_user_by_email('user@example.test')`,
        `select * from public.list_admin_audit_logs()`,
      ]) {
        assert.equal((await rpc(uid, sql)).error?.code, INSUFFICIENT_PRIVILEGE, `${uid} ${sql}`);
      }
    }
  });

  it('nobody writes user_roles or the audit log directly, and the log is append-only', async () => {
    const direct = await rpc(sup, `insert into public.user_roles (user_id, role) values ($1, 'editor')`, [user]);
    assert.equal(direct.error?.code, INSUFFICIENT_PRIVILEGE);
    for (const sql of [
      `select * from public.admin_audit_logs`,
      `insert into public.admin_audit_logs (action) values ('role.assign')`,
    ]) {
      assert.equal((await rpc(sup, sql)).error?.code, INSUFFICIENT_PRIVILEGE, sql);
    }
    for (const sql of [`update public.admin_audit_logs set reason = 'x'`, `delete from public.admin_audit_logs`]) {
      assert.equal((await adminError(db, sql))?.code, INSUFFICIENT_PRIVILEGE, `owner: ${sql}`);
    }
  });
});

describe('4.2 content reports', () => {
  let recipeId;
  let approvedComment; // by user, approved
  let pendingComment; // by user, pending
  let ownComment; // by editor, approved
  let photoId; // by user, approved
  const report = (uid, table, target, reason = 'spam', details = null) =>
    rpc(uid, `insert into public.content_reports (reporter_id, target_table, target_id, reason, details) values ($1, $2, $3, $4, $5)`,
      [uid, table, target, reason, details]);
  const workflow = (uid, id, status, note = null) => rpc(uid, `select public.update_report_workflow($1, $2, $3) as status`, [id, status, note]);
  const comment = (uid, content, status) =>
    admin(db, `insert into public.comments (user_id, recipe_id, content, status) values ($1, $2, $3, $4) returning id`, [uid, recipeId, content, status])
      .then((r) => r[0].id);

  before(async () => {
    const [{ id: cat }] = await admin(db, `insert into public.categories (slug, name) values ('mon_chinh', 'Món chính') returning id`);
    [{ id: recipeId }] = await admin(db,
      `insert into public.recipes (slug, name, category_id, default_servings, status, published_at)
       values ('001-pub', 'Published', $1, 4, 'published', now()) returning id`, [cat]);
    approvedComment = await comment(user, 'Mua hàng giá rẻ tại…', 'approved');
    pendingComment = await comment(user, 'Chờ duyệt', 'pending');
    ownComment = await comment(editor, 'Của editor', 'approved');
    [{ id: photoId }] = await admin(db,
      `insert into public.cooking_photos (user_id, recipe_id, storage_path, status) values ($1, $2, $3, 'approved') returning id`,
      [user, recipeId, `${user}/r1.jpg`]);
  });

  it('a user reports a comment and a photo of someone else once, and cannot read the report back', async () => {
    assert.equal((await report(editor, 'comments', approvedComment)).error, null);
    assert.equal((await report(editor, 'cooking_photos', photoId, 'inappropriate_image')).error, null);
    assert.equal((await report(editor, 'comments', approvedComment, 'offensive')).error?.code, '23505');
    const back = await rpc(editor, `select id from public.content_reports`);
    assert.deepEqual(back.rows, []);
    const [{ status }] = await admin(db, `select status from public.content_reports where target_id = $1`, [approvedComment]);
    assert.equal(status, 'open');
  });

  it('nobody reports their own content, content they cannot see, or as someone else; anon cannot report', async () => {
    assert.equal((await report(editor, 'comments', ownComment)).error?.code, INSUFFICIENT_PRIVILEGE);
    assert.equal((await report(editor, 'comments', pendingComment)).error?.code, INSUFFICIENT_PRIVILEGE);
    assert.equal((await report(editor, 'comments', recipeId)).error?.code, INSUFFICIENT_PRIVILEGE); // no such comment
    const forged = await rpc(editor, `insert into public.content_reports (reporter_id, target_table, target_id, reason) values ($1, 'comments', $2, 'spam')`,
      [moderator, ownComment]);
    assert.equal(forged.error?.code, INSUFFICIENT_PRIVILEGE);
    assert.equal((await report(null, 'comments', approvedComment)).error?.code, INSUFFICIENT_PRIVILEGE);
  });

  it('a reporter never sets the workflow; "other" needs a description of at most 500 characters', async () => {
    const status = await rpc(moderator,
      `insert into public.content_reports (reporter_id, target_table, target_id, reason, status) values ($1, 'comments', $2, 'spam', 'resolved')`,
      [moderator, ownComment]);
    assert.equal(status.error?.code, INSUFFICIENT_PRIVILEGE);
    assert.equal((await report(moderator, 'comments', ownComment, 'other')).error?.code, '23514');
    assert.equal((await report(moderator, 'comments', ownComment, 'other', 'a'.repeat(501))).error?.code, '23514');
    assert.equal((await report(moderator, 'comments', ownComment, 'other', '  Sao chép từ trang khác  ')).error, null);
    const [{ details }] = await admin(db, `select details from public.content_reports where reporter_id = $1`, [moderator]);
    assert.equal(details, '  Sao chép từ trang khác  ');
  });

  it('moderators read every report and move it through the workflow, audited; nobody else can', async () => {
    const all = await rpc(moderator, `select reason from public.content_reports order by reason`);
    assert.deepEqual(all.rows.map((r) => r.reason), ['inappropriate_image', 'other', 'spam']);
    const [{ id }] = await admin(db, `select id from public.content_reports where target_id = $1`, [approvedComment]);
    assert.deepEqual((await workflow(moderator, id, 'reviewing')).rows, [{ status: 'reviewing' }]);
    assert.deepEqual((await workflow(moderator, id, 'resolved', '  Đã ẩn bình luận  ')).rows, [{ status: 'resolved' }]);
    const [row] = await admin(db, `select status, internal_note, handled_by, handled_at is not null as stamped from public.content_reports where id = $1`, [id]);
    assert.deepEqual(row, { status: 'resolved', internal_note: 'Đã ẩn bình luận', handled_by: moderator, stamped: true });
    const audit = await admin(db, `select actor_id, action, reason, details from public.admin_audit_logs where target_id = $1 order by created_at, id`, [id]);
    assert.deepEqual(audit, [
      { actor_id: moderator, action: 'report.reviewing', reason: null, details: { from: 'open', to: 'reviewing' } },
      { actor_id: moderator, action: 'report.resolved', reason: 'Đã ẩn bình luận', details: { from: 'reviewing', to: 'resolved' } },
    ]);
    for (const uid of [editor, user, null]) {
      assert.equal((await workflow(uid, id, 'dismissed')).error?.code, INSUFFICIENT_PRIVILEGE);
    }
    const direct = await rpc(moderator, `update public.content_reports set status = 'dismissed' where id = $1`, [id]);
    assert.equal(direct.error?.code, INSUFFICIENT_PRIVILEGE);
    assert.equal((await workflow(moderator, id, 'closed')).error?.code, INVALID_PARAMETER);
    assert.equal((await workflow(moderator, recipeId, 'resolved')).error?.code, NO_DATA);
  });

  it('editors and users do not see reports; super admins do', async () => {
    for (const uid of [editor, user]) {
      assert.deepEqual((await rpc(uid, `select id from public.content_reports`)).rows, []);
    }
    assert.equal((await rpc(null, `select id from public.content_reports`)).error?.code, INSUFFICIENT_PRIVILEGE);
    assert.equal((await rpc(sup, `select id from public.content_reports`)).rows.length, 3);
  });
});

describe('4.5 recipe CMS', () => {
  let cat;
  let salt;
  let pork;
  let draftId;
  const save = (uid, id, recipe, ingredients, steps, reason = null) =>
    rpc(uid, `select public.save_recipe($1, $2::jsonb, $3::jsonb, $4::jsonb, $5) as id`,
      [id, JSON.stringify(recipe), JSON.stringify(ingredients), JSON.stringify(steps), reason]);
  const move = (uid, id, to) => rpc(uid, `select public.transition_recipe_status($1, $2) as status`, [id, to]);
  const base = (over = {}) => ({ slug: '900-ga-nuong', name: 'Gà nướng', default_servings: 4, ...over });
  const ING = () => [
    { ingredient_id: pork, quantity: 500, unit: 'g', quantity_basis: 'book', preparation_note: ' cắt miếng ' },
    { ingredient_id: salt, quantity: null, unit: null, quantity_basis: 'to_taste' },
  ];
  const STEPS = [{ instruction: ' Ướp thịt ' }, { instruction: 'Nướng', duration_seconds: 1200, timer_enabled: true }];
  const detailOf = (res) => JSON.parse(res.error?.detail ?? '{}');

  before(async () => {
    [{ id: cat }] = await admin(db, `select id from public.categories where slug = 'mon_chinh'`);
    [{ id: salt }] = await admin(db, `insert into public.ingredients (slug, name) values ('muoi', 'Muối') returning id`);
    [{ id: pork }] = await admin(db, `insert into public.ingredients (slug, name) values ('thit-lon', 'Thịt lợn') returning id`);
  });

  it('only editors save; a new recipe is a draft with its children in the given order, audited', async () => {
    for (const uid of [user, moderator, null]) {
      assert.equal((await save(uid, null, base(), ING(), STEPS)).error?.code, INSUFFICIENT_PRIVILEGE);
    }
    const res = await save(editor, null, base({ description: '  ', serving_note: '' }), ING(), STEPS, 'Món mới');
    assert.equal(res.error, null);
    draftId = res.rows[0].id;
    const [r] = await admin(db, `select status, description, serving_note, category_id from public.recipes where id = $1`, [draftId]);
    assert.deepEqual(r, { status: 'draft', description: null, serving_note: null, category_id: null });
    const ing = await admin(db,
      `select sort_order, quantity, quantity_basis, preparation_note from public.recipe_ingredients where recipe_id = $1 order by sort_order`, [draftId]);
    assert.deepEqual(ing, [
      { sort_order: 1, quantity: '500.000', quantity_basis: 'book', preparation_note: 'cắt miếng' },
      { sort_order: 2, quantity: null, quantity_basis: 'to_taste', preparation_note: null },
    ]);
    const steps = await admin(db, `select step_number, instruction, timer_enabled from public.recipe_steps where recipe_id = $1 order by step_number`, [draftId]);
    assert.deepEqual(steps, [
      { step_number: 1, instruction: 'Ướp thịt', timer_enabled: false },
      { step_number: 2, instruction: 'Nướng', timer_enabled: true },
    ]);
    const [a] = await admin(db, `select actor_id, action, reason from public.admin_audit_logs where target_id = $1`, [draftId]);
    assert.deepEqual(a, { actor_id: editor, action: 'recipe.create', reason: 'Món mới' });
    assert.equal((await save(editor, null, base(), ING(), STEPS)).error?.code, '23505'); // slug taken
    const zero = await save(editor, null, base({ slug: 'x-1' }), [{ ingredient_id: salt, quantity: 0, quantity_basis: 'book' }], STEPS);
    assert.equal(zero.error?.code, '23514');
  });

  it('editors read every status; the app search still lists published recipes only', async () => {
    const r = await rpc(editor, `select status from public.recipes where id = $1`, [draftId]);
    assert.deepEqual(r.rows, [{ status: 'draft' }]);
    for (const uid of [user, moderator, null]) {
      assert.deepEqual((await rpc(uid, `select id from public.recipes where id = $1`, [draftId])).rows, [], String(uid));
      assert.deepEqual((await rpc(uid, `select id from public.recipe_steps where recipe_id = $1`, [draftId])).rows, []);
    }
    assert.deepEqual((await rpc(editor, `select slug from public.search_recipes('gà nướng')`)).rows, []);
  });

  it('follows the lifecycle; staging and publishing need a ready recipe', async () => {
    assert.equal((await move(editor, draftId, 'published')).error?.code, INVALID_PARAMETER); // draft -> published
    assert.equal((await move(editor, draftId, null)).error?.code, INVALID_PARAMETER);
    const notReady = await move(editor, draftId, 'staged');
    assert.equal(notReady.error?.code, INVALID_PARAMETER);
    assert.deepEqual(detailOf(notReady), { category_id: 'Chọn danh mục.' });
    assert.equal((await save(editor, draftId, base({ category_id: cat }), ING(), STEPS)).error, null);
    assert.deepEqual((await move(editor, draftId, 'staged')).rows, [{ status: 'staged' }]);
    assert.equal((await move(moderator, draftId, 'published')).error?.code, INSUFFICIENT_PRIVILEGE);
    assert.deepEqual((await move(editor, draftId, 'published')).rows, [{ status: 'published' }]);
    const [{ published_at }] = await admin(db, `select published_at from public.recipes where id = $1`, [draftId]);
    assert.ok(published_at);
    assert.deepEqual((await rpc(null, `select slug from public.search_recipes('gà nướng')`)).rows, [{ slug: '900-ga-nuong' }]);
    assert.deepEqual((await move(editor, draftId, 'archived')).rows, [{ status: 'archived' }]);
    assert.equal((await move(editor, draftId, 'published')).error?.code, INVALID_PARAMETER); // archived -> published
    assert.deepEqual((await move(editor, draftId, 'draft')).rows, [{ status: 'draft' }]);
    const moves = await admin(db,
      `select details from public.admin_audit_logs where target_id = $1 and action = 'recipe.status' order by created_at, id`, [draftId]);
    assert.deepEqual(moves.map((m) => `${m.details.from}>${m.details.to}`), ['draft>staged', 'staged>published', 'published>archived', 'archived>draft']);
  });

  it('a staged recipe stays ready when edited; a set cover must exist in storage', async () => {
    await move(editor, draftId, 'staged');
    const empty = await save(editor, draftId, base({ category_id: cat }), [], STEPS);
    assert.equal(empty.error?.code, INVALID_PARAMETER);
    assert.deepEqual(detailOf(empty), { ingredients: 'Cần ít nhất một nguyên liệu.' });
    const dup = await save(editor, draftId, base({ category_id: cat }),
      [...ING(), { ingredient_id: pork, quantity: 1, unit: 'kg', quantity_basis: 'book' }], STEPS);
    assert.deepEqual(detailOf(dup), { ingredients: 'Có nguyên liệu bị lặp.' });
    const cover = '900-ga-nuong/cover-1.webp';
    const missing = await save(editor, draftId, base({ category_id: cat, cover_image_path: cover }), ING(), STEPS);
    assert.deepEqual(detailOf(missing), { cover_image_path: 'Ảnh bìa không có trong kho ảnh.' });
    const [{ n }] = await admin(db, `select count(*)::int n from public.recipe_ingredients where recipe_id = $1`, [draftId]);
    assert.equal(n, 2); // the failed saves rolled back
    await rpc(editor, `insert into storage.objects (bucket_id, name) values ('recipe-images', $1)`, [cover]);
    assert.equal((await save(editor, draftId, base({ category_id: cat, cover_image_path: cover }), ING(), STEPS)).error, null);
  });

  it('nobody writes recipes or their children directly, not even an editor', async () => {
    for (const sql of [
      `update public.recipes set status = 'published' where id = $1`,
      `delete from public.recipe_steps where recipe_id = $1`,
      `insert into public.recipe_diets (recipe_id, diet_id) select $1, gen_random_uuid()`,
    ]) {
      assert.equal((await rpc(editor, sql, [draftId])).error?.code, INSUFFICIENT_PRIVILEGE, sql);
    }
  });

  it('creates an ingredient once per name, with a folded slug', async () => {
    const first = await rpc(editor, `select public.create_ingredient('  Lá chanh Đà Lạt ') as id`);
    const again = await rpc(editor, `select public.create_ingredient('lá chanh đà lạt') as id`);
    assert.equal(first.rows[0].id, again.rows[0].id);
    const [row] = await admin(db, `select slug, name from public.ingredients where id = $1`, [first.rows[0].id]);
    assert.deepEqual(row, { slug: 'la-chanh-da-lat', name: 'Lá chanh Đà Lạt' });
    assert.equal((await rpc(user, `select public.create_ingredient('Muối hồng')`)).error?.code, INSUFFICIENT_PRIVILEGE);
    assert.equal((await rpc(editor, `select public.create_ingredient('   ')`)).error?.code, INVALID_PARAMETER);
  });

  it('editors upload new covers only and delete a cover no recipe uses; super admins delete any', async () => {
    const up = (uid, name) => rpc(uid, `insert into storage.objects (bucket_id, name) values ('recipe-images', $1) returning name`, [name]);
    const del = (uid, name) => rpc(uid, `delete from storage.objects where bucket_id = 'recipe-images' and name = $1 returning name`, [name]);
    assert.equal((await up(editor, '900-ga-nuong/cover-2.webp')).error, null);
    for (const name of ['900-ga-nuong/cover.webp', '900-ga-nuong/anh.webp', 'covers/x.gif', '../cover-3.webp']) {
      assert.equal((await up(editor, name)).error?.code, INSUFFICIENT_PRIVILEGE, name);
    }
    assert.equal((await up(user, '900-ga-nuong/cover-4.webp')).error?.code, INSUFFICIENT_PRIVILEGE);
    assert.deepEqual((await del(editor, '900-ga-nuong/cover-1.webp')).rows, []); // in use
    assert.equal((await del(editor, '900-ga-nuong/cover-2.webp')).rows.length, 1);
    assert.deepEqual((await del(user, '900-ga-nuong/cover-1.webp')).rows, []);
    assert.equal((await del(sup, '900-ga-nuong/cover-1.webp')).rows.length, 1);
  });

  it('only a super admin hard-deletes, slug typed, never a published recipe or one with user activity', async () => {
    const del = (uid, id, slug, reason = 'Trùng') => rpc(uid, `select public.delete_recipe($1, $2, $3)`, [id, slug, reason]);
    await admin(db, `update public.recipes set cover_image_path = null where id = $1`, [draftId]);
    assert.equal((await del(editor, draftId, '900-ga-nuong')).error?.code, INSUFFICIENT_PRIVILEGE);
    assert.equal((await del(sup, draftId, '900-ga')).error?.code, INVALID_PARAMETER);
    assert.equal((await del(sup, draftId, '900-ga-nuong', ' ')).error?.code, INVALID_PARAMETER);
    assert.equal((await move(editor, draftId, 'published')).error, null);
    assert.equal((await del(sup, draftId, '900-ga-nuong')).error?.code, INVALID_PARAMETER);
    await move(editor, draftId, 'archived');
    await admin(db, `insert into public.favorites (user_id, recipe_id) values ($1, $2)`, [user, draftId]);
    assert.equal((await del(sup, draftId, '900-ga-nuong')).error?.code, INVALID_PARAMETER);
    await admin(db, `delete from public.favorites where recipe_id = $1`, [draftId]);
    assert.equal((await del(sup, draftId, '900-ga-nuong')).error, null);
    assert.deepEqual(await admin(db, `select id from public.recipe_steps where recipe_id = $1`, [draftId]), []);
    const [a] = await admin(db, `select details from public.admin_audit_logs where target_id = $1 and action = 'recipe.delete'`, [draftId]);
    assert.deepEqual(a.details, { slug: '900-ga-nuong', name: 'Gà nướng' });
  });
});

describe('4.3 nutrition', () => {
  let recipeId;
  let pork;
  let sauce;
  let leaf;
  const food = (externalId, nutrients, over = {}) => ({
    provider: 'usda', externalId, description: `USDA ${externalId}`, dataType: 'SR Legacy', basis: 'per_100g',
    sourceVersion: '2019-04-01', retrievedAt: '2026-11-14T00:00:00Z', nutrients, ...over,
  });
  const PORK = { energyKcal: 242, proteinG: 27.3, fatG: 14, carbsG: 0, sodiumMg: 62, saturatedFatG: 5.2, fiberG: 0, sugarG: null };
  const SAUCE = { energyKcal: 35, proteinG: 5.1, fatG: 0, carbsG: 3.6, sodiumMg: 7851, saturatedFatG: 0, fiberG: 0, sugarG: 3.6 };
  const mapping = (uid, ing, f, status = 'CANDIDATE') =>
    rpc(uid, `select public.save_ingredient_nutrition($1, $2::jsonb, $3) as s`, [ing, f === null ? null : JSON.stringify(f), status]);
  const verifyMapping = (uid, ing) => rpc(uid, `select public.verify_ingredient_nutrition($1) as s`, [ing]);
  const calc = (uid) => rpc(uid, `select public.calculate_recipe_nutrition($1) as r`, [recipeId]);
  const verify = (uid) => rpc(uid, `select public.verify_recipe_nutrition($1) as s`, [recipeId]);
  const stored = () => admin(db, `select status, totals, per_serving, completeness::float as completeness, reason_codes from public.recipe_nutrition where recipe_id = $1`, [recipeId]).then((r) => r[0]);

  before(async () => {
    const [{ id: cat }] = await admin(db, `select id from public.categories where slug = 'mon_chinh'`);
    [{ id: recipeId }] = await admin(db,
      `insert into public.recipes (slug, name, category_id, default_servings, status, published_at)
       values ('950-thit-luoc', 'Thịt luộc', $1, 2, 'published', now()) returning id`, [cat]);
    [{ id: pork }] = await admin(db, `select id from public.ingredients where slug = 'thit-lon'`);
    [{ id: sauce }] = await admin(db, `insert into public.ingredients (slug, name) values ('nuoc-mam', 'Nước mắm') returning id`);
    [{ id: leaf }] = await admin(db, `insert into public.ingredients (slug, name) values ('la-chanh', 'Lá chanh') returning id`);
    await admin(db,
      `insert into public.recipe_ingredients (recipe_id, ingredient_id, sort_order, quantity, unit, quantity_basis, is_optional) values
       ($1, $2, 1, 500, 'g', 'book', false), ($1, $3, 2, 2, 'Muỗng canh', 'book', false), ($1, $4, 3, null, null, 'to_taste', true)`,
      [recipeId, pork, sauce, leaf]);
  });

  it('only editors manage nutrition; the public reads nothing that is not verified', async () => {
    for (const uid of [user, moderator, null]) {
      assert.equal((await mapping(uid, pork, food('167812', PORK))).error?.code, INSUFFICIENT_PRIVILEGE);
      assert.equal((await calc(uid)).error?.code, INSUFFICIENT_PRIVILEGE);
    }
    assert.equal((await rpc(user, `select * from public.ingredient_nutrition`)).rows.length, 0);
    assert.equal((await rpc(null, `select * from public.ingredient_nutrition`)).error?.code, INSUFFICIENT_PRIVILEGE);
    assert.equal((await rpc(user, `insert into public.recipe_nutrition (recipe_id, calculation_version, status, totals, completeness)
      values ($1, '2.0.0', 'VERIFIED', '{}', 1)`, [recipeId])).error?.code, INSUFFICIENT_PRIVILEGE);
    const seeded = await rpc(editor, `select unit, grams_per_unit::float as g from public.nutrition_unit_conversions where verified_at is not null order by unit`);
    assert.deepEqual(seeded.rows, [{ unit: 'g', g: 1 }, { unit: 'gram', g: 1 }, { unit: 'kg', g: 1000 }, { unit: 'mg', g: 0.001 }]);
  });

  it('unverified inputs never produce a number: totals stay NULL, with the reasons', async () => {
    assert.equal((await mapping(editor, pork, food('167812', PORK))).error, null);
    const r = (await calc(editor)).rows[0].r;
    assert.equal(r.status, 'NOT_CALCULATED'); // nothing usable yet
    assert.deepEqual(r.reason_codes, ['no_verified_conversion', 'unmapped_nutrition', 'unverified_mapping']);
    assert.deepEqual(Object.values(r.totals), Array(8).fill(null));
    assert.deepEqual(r.excluded_optional, [leaf]);
    assert.equal((await verifyMapping(editor, pork)).error, null);
    const partly = (await calc(editor)).rows[0].r;
    assert.equal(partly.status, 'INCOMPLETE'); // the sauce still blocks every total
    assert.deepEqual(Object.values(partly.totals), Array(8).fill(null));
    assert.equal((await verify(editor)).error?.code, INVALID_PARAMETER);
  });

  it('a unit counts once a verified rule exists; an ingredient rule wins over a global one', async () => {
    const save = (ing, unit, grams, source = 'Đo thực tế', method = 'cân 10 lần') =>
      rpc(editor, `select public.save_unit_conversion($1, $2, $3, $4, $5) as id`, [ing, unit, grams, source, method]);
    const global = (await save(null, ' Muỗng canh ', 15)).rows[0].id;
    const [{ unit }] = await admin(db, `select unit from public.nutrition_unit_conversions where id = $1`, [global]);
    assert.equal(unit, 'muỗng canh');
    assert.ok((await calc(editor)).rows[0].r.reason_codes.includes('unverified_conversion'));
    const noSource = (await save(null, 'chén', 200, null, null)).rows[0].id;
    assert.equal((await rpc(editor, `select public.verify_unit_conversion($1)`, [noSource])).error?.code, INVALID_PARAMETER);
    assert.equal((await rpc(editor, `select public.verify_unit_conversion($1)`, [global])).error, null);
    const specific = (await save(sauce, 'muỗng canh', 18)).rows[0].id;
    await rpc(editor, `select public.verify_unit_conversion($1)`, [specific]);
    await mapping(editor, sauce, food('174531', SAUCE));
    await verifyMapping(editor, sauce);
    const r = (await calc(editor)).rows[0].r;
    assert.equal(r.status, 'CALCULATED');
    assert.deepEqual(r.breakdown.map((b) => [b.name, Number(b.grams)]), [['Thịt lợn', 500], ['Nước mắm', 36]]);
  });

  it('computes totals from verified inputs; per serving comes from the unrounded total; 0 stays 0, unknown stays NULL', async () => {
    const s = await stored();
    // pork 500 g + sauce 2 x 18 g = 36 g
    assert.deepEqual(s.totals, {
      energy_kcal: 1222.6, protein_g: 138.3, fat_g: 70, carbs_g: 1.3, sodium_mg: 3136.4,
      saturated_fat_g: 26, fiber_g: 0, sugar_g: null,
    });
    assert.equal(s.per_serving.protein_g, 69.2); // 138.336 / 2 = 69.168
    assert.equal(s.per_serving.sugar_g, null);
    assert.equal(s.completeness, 0.9375); // 15 known values of 2 x 8
    assert.equal(s.status, 'CALCULATED');
    assert.deepEqual((await rpc(null, `select status from public.recipe_nutrition where recipe_id = $1`, [recipeId])).rows, []);
  });

  it('verification recomputes; then the public reads the result of a published recipe', async () => {
    assert.equal((await verify(moderator)).error?.code, INSUFFICIENT_PRIVILEGE);
    assert.deepEqual((await verify(editor)).rows, [{ s: 'VERIFIED' }]);
    const pub = await rpc(null, `select status, per_serving from public.recipe_nutrition where recipe_id = $1`, [recipeId]);
    assert.equal(pub.rows[0].status, 'VERIFIED');
    assert.equal(pub.rows[0].per_serving.energy_kcal, 611.3);
    await admin(db, `update public.recipes set status = 'staged' where id = $1`, [recipeId]);
    assert.deepEqual((await rpc(null, `select status from public.recipe_nutrition where recipe_id = $1`, [recipeId])).rows, []);
    await admin(db, `update public.recipes set status = 'published' where id = $1`, [recipeId]);
  });

  it('any input change marks the result STALE until recalculated and verified again', async () => {
    const check = async (change) => {
      await calc(editor);
      await verify(editor);
      await change();
      assert.equal((await stored()).status, 'STALE');
      assert.equal((await rpc(null, `select status from public.recipe_nutrition where recipe_id = $1`, [recipeId])).rows.length, 0);
    };
    await check(() => admin(db, `update public.recipes set default_servings = 3 where id = $1`, [recipeId]));
    await check(() => admin(db, `update public.recipe_ingredients set quantity = 400 where recipe_id = $1 and sort_order = 1`, [recipeId]));
    await check(() => mapping(editor, sauce, food('174531', { ...SAUCE, sodiumMg: 7000 })));
    await verifyMapping(editor, sauce);
    await check(() => rpc(editor, `select public.save_unit_conversion($1, 'muỗng canh', 17, 'Đo', 'cân')`, [sauce]));
    assert.equal((await verify(editor)).error?.code, INVALID_PARAMETER); // STALE cannot be verified
  });

  it('saving a mapping clears its verification; a branded food or a missing USDA id cannot be verified', async () => {
    const [before] = await admin(db, `select mapping_status from public.ingredient_nutrition where ingredient_id = $1`, [sauce]);
    assert.equal(before.mapping_status, 'VERIFIED');
    await mapping(editor, sauce, food('174531', SAUCE, { dataType: 'Branded', basis: null }));
    const [after] = await admin(db, `select mapping_status, basis, energy_kcal, verified_at from public.ingredient_nutrition where ingredient_id = $1`, [sauce]);
    assert.deepEqual(after, { mapping_status: 'CANDIDATE', basis: null, energy_kcal: null, verified_at: null });
    assert.equal((await verifyMapping(editor, sauce)).error?.code, INVALID_PARAMETER);
    assert.equal((await mapping(editor, sauce, food('', SAUCE))).error?.code, INVALID_PARAMETER);
    assert.equal((await mapping(editor, sauce, null, 'UNAVAILABLE')).error, null);
    const audit = await admin(db, `select count(*)::int n from public.admin_audit_logs where action like 'nutrition.%'`);
    assert.ok(audit[0].n >= 8);
  });
});
