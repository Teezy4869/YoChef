import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import App from '@/app/App';

import { createFakeSupabase, fakeSession } from './helpers/fakeSupabase';
import { detailRow } from './helpers/recipeFixtures';

const ENV = { url: 'https://bdhphjwhagygbwtfhhxn.supabase.co', key: 'sb_publishable_test' };
const USER = '22222222-2222-4222-8222-222222222222';
const SEARCH_ROW = {
  id: 'r1', slug: '001-thit-kho', name: 'Thịt lợn kho cốt dừa', category_slug: 'mon_chinh', category_name: 'Món chính',
  difficulty: 'medium', default_servings: 4, prep_time_minutes: 15, cook_time_minutes: 60, cover_image_path: null, description: null,
};

/** A catalog with one recipe; favorites embed it like `recipe:recipes(...)` does. */
function setup(session = fakeSession({ id: USER })) {
  const fake = createFakeSupabase(session);
  fake.catalog.recipes = [SEARCH_ROW];
  fake.catalog.details['001-thit-kho'] = detailRow();
  fake.decorate.favorites = (row) => ({
    ...row,
    recipe: row.recipe_id === 'r1' ? { ...SEARCH_ROW, category: { slug: 'mon_chinh', name: 'Món chính' } } : null,
  });
  render(<App rawEnv={ENV} createClient={() => fake.client} />);
  return fake;
}

async function openRecipe() {
  fireEvent.press(await screen.findByRole('button', { name: /^Thịt lợn kho cốt dừa\./ }));
  await screen.findByTestId('recipe-detail');
}

const openFavoritesTab = async () => fireEvent.press(await screen.findByRole('button', { name: /Yêu thích/ }));

describe('favorites', () => {
  it('asks a guest to sign in, from the tab and from the heart', async () => {
    setup(null as never);
    await openFavoritesTab();
    expect(await screen.findByTestId('favorites-guest')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: /Khám phá/ }));
    await openRecipe();
    fireEvent.press(screen.getByRole('button', { name: 'Lưu vào yêu thích' }));
    expect(await screen.findByRole('button', { name: 'Đăng nhập' })).toBeTruthy(); // sign-in modal
  });

  it('saves a recipe, shows it on the tab, and removes it', async () => {
    const fake = setup();
    await openRecipe();
    fireEvent.press(screen.getByRole('button', { name: 'Lưu vào yêu thích' }));
    expect(await screen.findByRole('button', { name: 'Bỏ khỏi yêu thích' })).toBeTruthy();
    expect(fake.tables.favorites).toEqual([expect.objectContaining({ user_id: USER, recipe_id: 'r1' })]);

    fireEvent.press(screen.getByRole('button', { name: 'Bỏ khỏi yêu thích' }));
    expect(await screen.findByRole('button', { name: 'Lưu vào yêu thích' })).toBeTruthy();
    expect(fake.tables.favorites).toEqual([]);
  });

  it('lists saved recipes newest first and opens one', async () => {
    const fake = setup();
    fake.tables.favorites = [{ user_id: USER, recipe_id: 'r1', created_at: '2026-11-14T00:00:00Z' }];
    act(() => fake.setSession(fakeSession({ id: USER }), 'TOKEN_REFRESHED'));
    await openFavoritesTab();
    const list = await screen.findByTestId('favorites');
    expect(within(list).getByRole('button', { name: 'Bỏ Thịt lợn kho cốt dừa khỏi yêu thích' })).toBeTruthy();
    fireEvent.press(within(list).getByRole('button', { name: /^Thịt lợn kho cốt dừa\./ }));
    expect(await screen.findByRole('button', { name: 'Bỏ khỏi yêu thích' })).toBeTruthy();
  });

  it('shows an empty tab with a hint', async () => {
    setup();
    await openFavoritesTab();
    expect(await screen.findByTestId('favorites-empty')).toBeTruthy();
  });

  it('flips the heart back and says why when saving fails', async () => {
    const fake = setup();
    await openRecipe();
    fake.failNext('favorites', 'insert');
    fireEvent.press(screen.getByRole('button', { name: 'Lưu vào yêu thích' }));
    expect(await screen.findByText('Không lưu được món yêu thích.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Lưu vào yêu thích' })).toBeTruthy();
    expect(fake.tables.favorites ?? []).toEqual([]);
  });

  it('never shows one user favorites to the next user', async () => {
    const fake = setup();
    fake.tables.favorites = [{ user_id: USER, recipe_id: 'r1', created_at: '2026-11-14T00:00:00Z' }];
    act(() => fake.setSession(fakeSession({ id: USER }), 'TOKEN_REFRESHED'));
    await openFavoritesTab();
    await screen.findByTestId('favorites');

    act(() => fake.setSession(fakeSession({ id: '33333333-3333-4333-8333-333333333333' }), 'SIGNED_IN'));
    expect(await screen.findByTestId('favorites-empty')).toBeTruthy();
  });
});
