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
