import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import App from '@/app/App';
import { formatAverage, saveScore } from '@/features/ratings/ratingsApi';

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
  return fake;
}

async function openRecipe(fake: ReturnType<typeof createFakeSupabase>) {
  render(<App rawEnv={ENV} createClient={() => fake.client} />);
  fireEvent.press(await screen.findByRole('button', { name: /^Thịt lợn kho cốt dừa\./ }));
  return screen.findByTestId('ratings');
}
const star = (n: number) => screen.getByRole('radio', { name: `${n} sao` });
const scores = (fake: ReturnType<typeof createFakeSupabase>) => (fake.tables.ratings ?? []).map((r) => [r.user_id, r.score]);

describe('ratings', () => {
  it('formats the average with a comma', () => {
    expect(formatAverage(4)).toBe('4,0');
    expect(formatAverage(4.25)).toBe('4,3');
  });

  it('refuses a score outside 1 to 5 before calling the server', async () => {
    const fake = setup();
    await expect(saveScore(fake.client, USER, 'r1', 6)).rejects.toThrow('Điểm đánh giá phải từ 1 đến 5.');
    await expect(saveScore(fake.client, USER, 'r1', 2.5)).rejects.toThrow();
    expect(fake.tables.ratings ?? []).toEqual([]);
  });

  it('shows "no ratings yet" rather than 0, and sends a guest to sign in', async () => {
    const fake = setup(null);
    await openRecipe(fake);
    expect(await screen.findByText('Chưa có đánh giá')).toBeTruthy();
    fireEvent.press(star(4));
    expect(await screen.findByRole('button', { name: 'Đăng nhập' })).toBeTruthy();
    expect(fake.tables.ratings ?? []).toEqual([]);
  });

  it('shows the public average to a guest', async () => {
    const fake = setup(null);
    fake.tables.ratings = [
      { id: 'x1', user_id: OTHER, recipe_id: 'r1', score: 5 },
      { id: 'x2', user_id: USER, recipe_id: 'r1', score: 4 },
    ];
    await openRecipe(fake);
    expect(await screen.findByText('★ 4,5 · 2 lượt đánh giá')).toBeTruthy();
  });

  it('rates, changes the score, and removes it; the average follows', async () => {
    const fake = setup();
    fake.tables.ratings = [{ id: 'x1', user_id: OTHER, recipe_id: 'r1', score: 2 }];
    const section = await openRecipe(fake);
    expect(await within(section).findByText('★ 2,0 · 1 lượt đánh giá')).toBeTruthy();

    fireEvent.press(star(4));
    expect(await screen.findByText('★ 3,0 · 2 lượt đánh giá')).toBeTruthy();
    expect(star(4)).toBeChecked();
    expect(scores(fake)).toEqual([[OTHER, 2], [USER, 4]]);

    fireEvent.press(star(5));
    expect(await screen.findByText('★ 3,5 · 2 lượt đánh giá')).toBeTruthy();
    expect(scores(fake)).toEqual([[OTHER, 2], [USER, 5]]); // changed, not a second row

    fireEvent.press(screen.getByRole('button', { name: 'Xóa đánh giá của tôi' }));
    expect(await screen.findByText('★ 2,0 · 1 lượt đánh giá')).toBeTruthy();
    expect(scores(fake)).toEqual([[OTHER, 2]]);
    expect(screen.queryByRole('button', { name: 'Xóa đánh giá của tôi' })).toBeNull();
  });

  it('shows my saved score on opening', async () => {
    const fake = setup();
    fake.tables.ratings = [{ id: 'x1', user_id: USER, recipe_id: 'r1', score: 3 }];
    await openRecipe(fake);
    expect(await screen.findByText('Bạn chấm 3 sao')).toBeTruthy();
    expect(star(3)).toBeChecked();
  });

  it('rolls the stars back and says why when saving fails', async () => {
    const fake = setup();
    await openRecipe(fake);
    await screen.findByText('Chưa có đánh giá');
    fake.failNext('ratings', 'update');
    fireEvent.press(star(4));
    expect(await screen.findByText('Không lưu được đánh giá.')).toBeTruthy();
    await waitFor(() => expect(star(4)).not.toBeChecked());
    expect(fake.tables.ratings ?? []).toEqual([]);
  });
});
