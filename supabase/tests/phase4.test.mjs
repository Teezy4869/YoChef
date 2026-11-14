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
