import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import App from '@/app/App';
import { moderate } from '@/features/moderation/moderationApi';

import { createFakeSupabase, fakeSession } from './helpers/fakeSupabase';

const ENV = { url: 'https://bdhphjwhagygbwtfhhxn.supabase.co', key: 'sb_publishable_test' };
const MOD = '77777777-7777-4777-8777-777777777777';
const AUTHOR = '66666666-6666-4666-8666-666666666666';
const RECIPE = { id: 'r1', slug: '001-thit-kho', name: 'Thịt lợn kho cốt dừa' };

function setup(userId = MOD, role: string | null = 'moderator') {
  const fake = createFakeSupabase(fakeSession({ id: userId }));
  fake.catalog.recipes = [RECIPE];
  fake.profileOf(AUTHOR).display_name = 'Bà Ba';
  if (role) fake.tables.user_roles = [{ id: 'ur1', user_id: userId, role }];
  fake.tables.comments = [
    { id: 'c1', user_id: AUTHOR, recipe_id: 'r1', content: 'Ngon quá', status: 'pending', created_at: '2020-01-01T00:00:02Z' },
    { id: 'c2', user_id: AUTHOR, recipe_id: 'r1', content: 'Đã duyệt', status: 'approved', created_at: '2020-01-01T00:00:01Z' },
  ];
  fake.tables.cooking_photos = [
    { id: 'p1', user_id: AUTHOR, recipe_id: 'r1', storage_path: `${AUTHOR}/p1.jpg`, caption: 'Lần đầu', status: 'pending', created_at: '2020-01-01T00:00:01Z' },
  ];
  return fake;
}

async function openAccount(fake: ReturnType<typeof createFakeSupabase>) {
  render(<App rawEnv={ENV} createClient={() => fake.client} />);
  fireEvent.press(await screen.findByRole('button', { name: /Tài khoản/ }));
  await screen.findByTestId('account-signed-in');
}
const items = () => screen.queryAllByTestId('pending-item');

describe('moderation', () => {
  it('hides the entry from users without a staff role', async () => {
    const fake = setup(AUTHOR, null);
    await openAccount(fake);
    await screen.findByText('Sửa hồ sơ');
    await waitFor(() => expect(fake.from).toHaveBeenCalledWith('user_roles'));
    expect(screen.queryByRole('button', { name: 'Duyệt nội dung' })).toBeNull();
  });

  it('lists pending comments and photos, oldest first, for a moderator', async () => {
    const fake = setup();
    await openAccount(fake);
    fireEvent.press(await screen.findByRole('button', { name: 'Duyệt nội dung' }));
    expect(await screen.findByText('2 mục chờ duyệt, cũ nhất trước.')).toBeTruthy();
    expect(items().length).toBe(2);
    expect(within(items()[0]).getByText('Ảnh')).toBeTruthy();
    expect(within(items()[0]).getByLabelText('Lần đầu').props.source.uri).toContain('/sign/cooking-photos/');
    expect(within(items()[1]).getByText('Ngon quá')).toBeTruthy();
    expect(within(items()[1]).getByText(/Thịt lợn kho cốt dừa · Bà Ba/)).toBeTruthy();
    expect(screen.queryByText('Đã duyệt')).toBeNull(); // approved items are not in the queue
  });

  it('approves and rejects with an optional reason through the RPC, then refreshes the queue', async () => {
    const fake = setup();
    await openAccount(fake);
    fireEvent.press(await screen.findByRole('button', { name: 'Duyệt nội dung' }));
    await screen.findByText('2 mục chờ duyệt, cũ nhất trước.');

    fireEvent.press(screen.getByRole('button', { name: 'Duyệt ảnh' }));
    expect(await screen.findByText('Đã duyệt ảnh.')).toBeTruthy();
    await waitFor(() => expect(items().length).toBe(1));

    fireEvent.changeText(within(items()[0]).getByLabelText('Lý do (không bắt buộc)'), '  Quảng cáo  ');
    fireEvent.press(screen.getByRole('button', { name: 'Từ chối bình luận' }));
    expect(await screen.findByText('Đã từ chối bình luận.')).toBeTruthy();
    expect(await screen.findByText('Không còn nội dung chờ duyệt.')).toBeTruthy();

    expect(fake.rpc).toHaveBeenCalledWith('moderate_community_content', { p_table: 'cooking_photos', p_id: 'p1', p_status: 'approved', p_reason: null });
    expect(fake.rpc).toHaveBeenCalledWith('moderate_community_content', { p_table: 'comments', p_id: 'c1', p_status: 'rejected', p_reason: 'Quảng cáo' });
    expect(fake.tables.moderation_actions?.map((a) => [a.target_id, a.from_status, a.to_status])).toEqual([
      ['p1', 'pending', 'approved'],
      ['c1', 'pending', 'rejected'],
    ]);
  });

  it('says so when the role is gone and the database refuses', async () => {
    const fake = setup();
    await openAccount(fake);
    fireEvent.press(await screen.findByRole('button', { name: 'Duyệt nội dung' }));
    await screen.findByText('2 mục chờ duyệt, cũ nhất trước.');
    fake.tables.user_roles = [];
    fireEvent.press(screen.getByRole('button', { name: 'Duyệt ảnh' }));
    expect(await screen.findByText('Bạn không có quyền duyệt nội dung.')).toBeTruthy();
    expect(fake.tables.cooking_photos?.[0].status).toBe('pending');
  });

  it('refuses a reason over 500 characters before calling the server', async () => {
    const fake = setup();
    await expect(moderate(fake.client, { table: 'comments', id: 'c1' }, 'rejected', 'a'.repeat(501))).rejects.toThrow(
      'Lý do tối đa 500 ký tự.',
    );
    expect(fake.rpc).not.toHaveBeenCalledWith('moderate_community_content', expect.anything());
  });
});
