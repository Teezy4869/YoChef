import { fireEvent, render, screen, within } from '@testing-library/react-native';

import App from '@/app/App';

import { createFakeSupabase } from './helpers/fakeSupabase';
import { detailRow } from './helpers/recipeFixtures';

const ENV = { url: 'https://bdhphjwhagygbwtfhhxn.supabase.co', key: 'sb_publishable_test' };
const SEARCH_ROW = {
  id: 'r1', slug: '001-thit-kho', name: 'Thịt lợn kho cốt dừa', category_slug: 'mon_chinh', category_name: 'Món chính',
  difficulty: 'medium', default_servings: 4, prep_time_minutes: 15, cook_time_minutes: 60, cover_image_path: null, description: null,
};

async function openRecipe(rows: Record<string, unknown>[]) {
  const fake = createFakeSupabase(null);
  fake.catalog.recipes = [SEARCH_ROW];
  fake.catalog.details['001-thit-kho'] = detailRow();
  fake.tables.recipe_nutrition = rows;
  render(<App rawEnv={ENV} createClient={() => fake.client} />);
  fireEvent.press(await screen.findByRole('button', { name: /^Thịt lợn kho cốt dừa\./ }));
  return screen.findByTestId('nutrition');
}

describe('nutrition', () => {
  it('shows verified values per serving, with a dash for unknown and 0 as 0', async () => {
    const box = await openRecipe([
      { recipe_id: 'r1', status: 'VERIFIED', per_serving: { energy_kcal: 611.3, protein_g: 69.2, fat_g: 35, carbs_g: 0, sodium_mg: 155, saturated_fat_g: 13, fiber_g: 0, sugar_g: null } },
    ]);
    expect(within(box).getByLabelText('Năng lượng: 611,3 kcal')).toBeTruthy();
    expect(within(box).getByLabelText('Tinh bột, đường: 0 g')).toBeTruthy();
    expect(within(box).getByLabelText('Đường: —')).toBeTruthy();
  });

  it('says "not available yet" when there is no public result', async () => {
    const box = await openRecipe([]);
    expect(within(box).getByText('Chưa có thông tin dinh dưỡng cho món này.')).toBeTruthy();
  });
});
