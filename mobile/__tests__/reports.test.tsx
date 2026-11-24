import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import App from '@/app/App';

import { createFakeSupabase, fakeSession } from './helpers/fakeSupabase';
import { detailRow } from './helpers/recipeFixtures';

const ENV = { url: 'https://bdhphjwhagygbwtfhhxn.supabase.co', key: 'sb_publishable_test' };
const USER = '55555555-5555-4555-8555-555555555555';
const OTHER = '66666666-6666-4666-8666-666666666666';
const SEARCH_ROW = {
  id: 'r1', slug: '001-thit-kho', name: 'Thịt lợn kho cốt dừa', category_slug: 'mon_chinh', category_name: 'Món chính',
  difficulty: 'medium', default_servings: 4, prep_time_minutes: 15, cook_time_minutes: 60, cover_image_path: null, description: null,
};

function setup(session: ReturnType<typeof fakeSession> | null = fakeSession({ id: USER })) {
  const fake = createFakeSupabase(session);
  fake.catalog.recipes = [SEARCH_ROW];
  fake.catalog.details['001-thit-kho'] = detailRow();
  fake.tables.comments = [
    { id: 'c1', user_id: OTHER, recipe_id: 'r1', content: 'Mua hàng giá rẻ', status: 'approved', created_at: '2020-01-01T00:00:02Z' },
    { id: 'c2', user_id: USER, recipe_id: 'r1', content: 'Của tôi', status: 'approved', created_at: '2020-01-01T00:00:01Z' },
  ];
  fake.tables.cooking_photos = [
    { id: 'p1', user_id: OTHER, recipe_id: 'r1', storage_path: `${OTHER}/p1.jpg`, caption: null, status: 'approved', created_at: '2020-01-01T00:00:01Z' },
  ];
  return fake;
}

async function openRecipe(fake: ReturnType<typeof createFakeSupabase>) {
  render(<App rawEnv={ENV} createClient={() => fake.client} />);
  fireEvent.press(await screen.findByRole('button', { name: /^Thịt lợn kho cốt dừa\./ }));
  await screen.findByText('Mua hàng giá rẻ');
}

describe('reports', () => {
  it('offers "Báo cáo" on other people\'s comments and photos only, and never to a guest', async () => {
    await openRecipe(setup());
    expect(screen.getAllByRole('button', { name: 'Báo cáo bình luận' }).length).toBe(1);
    expect(screen.getAllByRole('button', { name: 'Báo cáo ảnh' }).length).toBe(1);
  });

  it('shows no report button to a guest', async () => {
    await openRecipe(setup(null));
    expect(screen.queryByRole('button', { name: 'Báo cáo bình luận' })).toBeNull();
  });

  it('reports a comment once with a reason; a second report is explained', async () => {
    const fake = setup();
    await openRecipe(fake);
    fireEvent.press(screen.getByRole('button', { name: 'Báo cáo bình luận' }));
    const form = screen.getByTestId('report-form');
    expect(within(form).queryByRole('button', { name: 'Hình ảnh không phù hợp' })).toBeNull(); // photo-only reason
    expect(within(form).getByRole('button', { name: 'Gửi báo cáo' })).toBeDisabled();
    fireEvent.press(within(form).getByRole('button', { name: 'Spam / Quảng cáo' }));
    fireEvent.press(within(form).getByRole('button', { name: 'Gửi báo cáo' }));
    expect(await screen.findByText('Đã gửi báo cáo. Cảm ơn bạn.')).toBeTruthy();
    expect(fake.tables.content_reports).toEqual([
      expect.objectContaining({ reporter_id: USER, target_table: 'comments', target_id: 'c1', reason: 'spam', details: null }),
    ]);

    fake.failNext('content_reports', 'insert', { message: 'duplicate', code: '23505' });
    fireEvent.press(screen.getByRole('button', { name: 'Báo cáo ảnh' }));
    fireEvent.press(screen.getByRole('button', { name: 'Hình ảnh không phù hợp' }));
    fireEvent.press(screen.getByRole('button', { name: 'Gửi báo cáo' }));
    expect(await screen.findByText('Bạn đã báo cáo nội dung này rồi. Chúng tôi đang xử lý.')).toBeTruthy();
  });

  it('"Lý do khác" needs a description, which is trimmed', async () => {
    const fake = setup();
    await openRecipe(fake);
    fireEvent.press(screen.getByRole('button', { name: 'Báo cáo ảnh' }));
    fireEvent.press(screen.getByRole('button', { name: 'Lý do khác' }));
    expect(screen.getByRole('button', { name: 'Gửi báo cáo' })).toBeDisabled();
    fireEvent.changeText(screen.getByLabelText('Mô tả (bắt buộc)'), '  Ảnh lấy từ trang khác  ');
    fireEvent.press(screen.getByRole('button', { name: 'Gửi báo cáo' }));
    await waitFor(() => expect(fake.tables.content_reports?.[0]).toEqual(expect.objectContaining({ reason: 'other', details: 'Ảnh lấy từ trang khác' })));
  });
});
