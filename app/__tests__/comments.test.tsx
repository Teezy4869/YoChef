import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import App from '@/app/App';
import { commentLength, formatCommentDate, postComment } from '@/features/community/commentsApi';

import { createFakeSupabase, fakeSession } from './helpers/fakeSupabase';
import { detailRow } from './helpers/recipeFixtures';

const ENV = { url: 'https://bdhphjwhagygbwtfhhxn.supabase.co', key: 'sb_publishable_test' };
const USER = '55555555-5555-4555-8555-555555555555';
const OTHER = '66666666-6666-4666-8666-666666666666';
const SEARCH_ROW = {
  id: 'r1', slug: '001-thit-kho', name: 'Thịt lợn kho cốt dừa', category_slug: 'mon_chinh', category_name: 'Món chính',
  difficulty: 'medium', default_servings: 4, prep_time_minutes: 15, cook_time_minutes: 60, cover_image_path: null, description: null,
};
const comment = (id: string, over: Record<string, unknown> = {}) => ({
  id, user_id: OTHER, recipe_id: 'r1', content: `Bình luận ${id}`, status: 'approved', created_at: `2020-01-01T00:00:${id.slice(1).padStart(2, '0')}Z`,
  ...over,
});

function setup(session: ReturnType<typeof fakeSession> | null = fakeSession({ id: USER })) {
  const fake = createFakeSupabase(session);
  fake.catalog.recipes = [SEARCH_ROW];
  fake.catalog.details['001-thit-kho'] = detailRow();
  fake.profileOf(OTHER).display_name = 'Bà Ba';
  return fake;
}

async function openRecipe(fake: ReturnType<typeof createFakeSupabase>) {
  render(<App rawEnv={ENV} createClient={() => fake.client} />);
  fireEvent.press(await screen.findByRole('button', { name: /^Thịt lợn kho cốt dừa\./ }));
  const section = await screen.findByTestId('comments');
  await waitFor(() => expect(within(section).queryByLabelText('Đang tải bình luận')).toBeNull());
  return section;
}
const rows = () => screen.queryAllByTestId('comment-row');
const stored = (fake: ReturnType<typeof createFakeSupabase>) =>
  (fake.tables.comments ?? []).map((c) => [c.user_id, c.content, c.status]);

describe('comments', () => {
  it('counts code points, formats dates, and refuses a blank comment before calling the server', async () => {
    expect(commentLength('  😀ă  ')).toBe(2);
    expect(formatCommentDate('2026-11-04T08:00:00')).toBe('04/11/2026');
    const fake = setup();
    await expect(postComment(fake.client, USER, 'r1', ' \n ')).rejects.toThrow('Bình luận không được để trống.');
    await expect(postComment(fake.client, USER, 'r1', 'a'.repeat(1001))).rejects.toThrow('Bình luận tối đa 1000 ký tự.');
    expect(fake.tables.comments ?? []).toEqual([]);
  });

  it('shows a guest the approved comments only, and sends them to sign in', async () => {
    const fake = setup(null);
    fake.tables.comments = [
      comment('c1'),
      comment('c2', { status: 'pending', content: 'Đang chờ' }),
      comment('c3', { status: 'rejected', content: 'Bị từ chối' }),
    ];
    await openRecipe(fake);
    expect(rows().length).toBe(1);
    expect(screen.getByText('Bình luận c1')).toBeTruthy();
    expect(screen.getByText('Bà Ba')).toBeTruthy();
    expect(screen.queryByLabelText('Sửa bình luận')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Đăng nhập để bình luận' }));
    expect(await screen.findByRole('button', { name: 'Đăng nhập' })).toBeTruthy();
  });

  it('says so when there are no comments yet', async () => {
    await openRecipe(setup());
    expect(screen.getByText('Chưa có bình luận nào.')).toBeTruthy();
  });

  it('posts a comment that waits for review, newest first, without ever sending a status', async () => {
    const fake = setup();
    fake.tables.comments = [comment('c1')];
    await openRecipe(fake);
    fireEvent.changeText(screen.getByLabelText('Viết bình luận'), '  Ngon, hơi mặn  ');
    expect(screen.getByText('13/1000')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Gửi bình luận' }));
    expect(await screen.findByText('Đã gửi. Bình luận sẽ hiện công khai sau khi được duyệt.')).toBeTruthy();
    expect(stored(fake)).toEqual([[OTHER, 'Bình luận c1', 'approved'], [USER, 'Ngon, hơi mặn', 'pending']]);
    await waitFor(() => expect(rows().length).toBe(2));
    expect(within(rows()[0]).getByText('Ngon, hơi mặn')).toBeTruthy();
    expect(within(rows()[0]).getByText('Đang chờ duyệt')).toBeTruthy();
    expect(within(rows()[1]).queryByText('Đang chờ duyệt')).toBeNull();
    expect(screen.getByLabelText('Viết bình luận').props.value).toBe('');
  });

  it('blocks sending a blank or too long comment', async () => {
    await openRecipe(setup());
    const send = () => screen.getByRole('button', { name: 'Gửi bình luận' });
    fireEvent.changeText(screen.getByLabelText('Viết bình luận'), '   ');
    expect(send()).toBeDisabled();
    fireEvent.changeText(screen.getByLabelText('Viết bình luận'), 'a'.repeat(1001));
    expect(screen.getByText('Bình luận tối đa 1000 ký tự.')).toBeTruthy();
    expect(send()).toBeDisabled();
  });

  it('keeps the draft and says why when posting fails', async () => {
    const fake = setup();
    await openRecipe(fake);
    fake.failNext('comments', 'insert');
    fireEvent.changeText(screen.getByLabelText('Viết bình luận'), 'Ngon');
    fireEvent.press(screen.getByRole('button', { name: 'Gửi bình luận' }));
    expect(await screen.findByText('Không gửi được bình luận.')).toBeTruthy();
    expect(screen.getByLabelText('Viết bình luận').props.value).toBe('Ngon');
    expect(fake.tables.comments ?? []).toEqual([]);
  });

  it('editing my approved comment sends it back to review', async () => {
    const fake = setup();
    fake.tables.comments = [comment('c1', { user_id: USER }), comment('c2')];
    await openRecipe(fake);
    expect(screen.getAllByLabelText('Sửa bình luận')).toHaveLength(1); // only my own
    fireEvent.press(screen.getByLabelText('Sửa bình luận'));
    expect(screen.getByText('Sau khi sửa, bình luận sẽ chờ duyệt lại.')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Sửa bình luận'), 'Đã sửa');
    fireEvent.press(screen.getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByText('Đã sửa')).toBeTruthy();
    expect(stored(fake)).toEqual([[USER, 'Đã sửa', 'pending'], [OTHER, 'Bình luận c2', 'approved']]);
    expect(screen.getByText('Đang chờ duyệt')).toBeTruthy();
  });

  it('asks before removing my comment', async () => {
    const fake = setup();
    fake.tables.comments = [comment('c1', { user_id: USER, status: 'pending' })];
    await openRecipe(fake);
    fireEvent.press(screen.getByLabelText('Xóa bình luận'));
    expect(screen.getByText('Xóa bình luận này?')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Không xóa' }));
    expect(stored(fake)).toHaveLength(1);
    fireEvent.press(screen.getByLabelText('Xóa bình luận'));
    fireEvent.press(screen.getByRole('button', { name: 'Xóa' }));
    expect(await screen.findByText('Chưa có bình luận nào.')).toBeTruthy();
    expect(stored(fake)).toEqual([]);
  });

  it('shows 20 comments at a time', async () => {
    const fake = setup(null);
    fake.tables.comments = Array.from({ length: 25 }, (_, i) => comment(`c${i + 1}`));
    await openRecipe(fake);
    expect(rows().length).toBe(20);
    expect(within(rows()[0]).getByText('Bình luận c25')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Xem thêm bình luận' }));
    await waitFor(() => expect(rows().length).toBe(25));
    expect(screen.queryByRole('button', { name: 'Xem thêm bình luận' })).toBeNull();
  });
});
