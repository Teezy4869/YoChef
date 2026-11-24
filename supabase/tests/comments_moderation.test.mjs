import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { admin, as, createDatabase } from './harness.mjs';

const INSUFFICIENT_PRIVILEGE = '42501';

let db;
let alice;
let bob;
let mod;
let publishedId;

before(async () => {
  db = await createDatabase();
  [{ id: alice }] = await admin(db, `insert into auth.users (email) values ('alice_mod@example.test') returning id`);
  [{ id: bob }] = await admin(db, `insert into auth.users (email) values ('bob_mod@example.test') returning id`);
  [{ id: mod }] = await admin(db, `insert into auth.users (email) values ('mod_kw@example.test') returning id`);
  await admin(db, `insert into public.user_roles (user_id, role) values ($1, 'moderator')`, [mod]);
  const [{ id: catId }] = await admin(db, `insert into public.categories (slug, name) values ('mon_chinh_kw', 'Món chính') returning id`);
  [{ id: publishedId }] = await admin(
    db,
    `insert into public.recipes (slug, name, category_id, default_servings, status, published_at)
     values ('pho-bo-kw', 'Phở bò', $1, 4, 'published', now()) returning id`,
    [catId],
  );
});

after(() => db?.close());

const post = (uid, content) =>
  as(
    db,
    'authenticated',
    uid,
    `insert into public.comments (user_id, recipe_id, content) values ($1, $2, $3) returning id, status`,
    [uid, publishedId, content],
  );

describe('comments keyword auto-moderation', () => {
  it('auto-approves normal cooking comments, including words with harmless substrings', async () => {
    const normalComments = [
      'Món này ngon quá, mình cho thêm 100 ml nước mắm đậm đà lắm!',
      'Thịt lợn kho ăn với cơm nóng rất hợp.',
      'Cho một cục đường phèn vào nước dùng sẽ thanh hơn.',
      'Đã làm thử, cả nhà đều khen ngon.',
    ];

    for (const content of normalComments) {
      const res = await post(alice, content);
      assert.equal(res.error, null, content);
      assert.equal(res.rows[0].status, 'approved', content);
      const seenByAnon = await as(db, 'anon', null, `select id from public.comments where id = $1`, [res.rows[0].id]);
      assert.equal(seenByAnon.rows.length, 1, content);
    }
  });

  it('holds sensitive, profane, link, or phone-number comments as pending for moderation', async () => {
    const sensitiveComments = [
      'Nấu như cái lồn',
      'Đồ ngu vcl luôn',
      'DM công thức dở tệ',
      'This tastes like shit',
      'Xem clip ở https://evil.example.com/123',
      'Nhắn zalo 0912.345.678 để mua gia vị nhé',
      'Chơi tài xỉu kiếm tiền online đi',
      'Vào shop.xyz mua ngay',
    ];

    for (const content of sensitiveComments) {
      const res = await post(alice, content);
      assert.equal(res.error, null, content);
      assert.equal(res.rows[0].status, 'pending', content);
      const id = res.rows[0].id;
      const seenByBob = await as(db, 'authenticated', bob, `select id from public.comments where id = $1`, [id]);
      const seenByMod = await as(db, 'authenticated', mod, `select id from public.comments where id = $1`, [id]);
      assert.equal(seenByBob.rows.length, 0, content);
      assert.equal(seenByMod.rows.length, 1, content);
    }
  });

  it('re-evaluates on edit: clean -> sensitive becomes pending; pending -> clean becomes approved', async () => {
    const ins = await post(alice, 'Bình luận ban đầu rất ổn.');
    assert.equal(ins.rows[0].status, 'approved');
    const id = ins.rows[0].id;

    const toSensitive = await as(
      db,
      'authenticated',
      alice,
      `update public.comments set content = 'Sửa lại thành dm spam' where id = $1 returning status`,
      [id],
    );
    assert.equal(toSensitive.rows[0].status, 'pending');

    const toClean = await as(
      db,
      'authenticated',
      alice,
      `update public.comments set content = 'Sửa lại cho lịch sự hơn' where id = $1 returning status`,
      [id],
    );
    assert.equal(toClean.rows[0].status, 'approved');
  });

  it('never lets clients read the keyword rules or call internal moderation helpers', async () => {
    for (const [role, uid] of [
      ['anon', null],
      ['authenticated', alice],
      ['authenticated', mod],
    ]) {
      const tbl = await as(db, role, uid, `select pattern from private.comment_review_rules`);
      assert.equal(tbl.error?.code, INSUFFICIENT_PRIVILEGE);
      const fn = await as(db, role, uid, `select private.comment_needs_review('hello')`);
      assert.equal(fn.error?.code, INSUFFICIENT_PRIVILEGE);
    }
  });
});
