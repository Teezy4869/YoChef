import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, within } from '@testing-library/react-native';

import App from '@/app/App';
import {
  addOrMergePantryItems,
  classifyIngredientGroup,
  convertPantryQty,
  deductPantryIngredients,
  fetchPantry,
  matchRecipesFromPantry,
} from '@/features/pantry/pantryApi';

import { createFakeSupabase, fakeSession } from './helpers/fakeSupabase';
import { detailRow } from './helpers/recipeFixtures';

const ENV = { url: 'https://bdhphjwhagygbwtfhhxn.supabase.co', key: 'sb_publishable_test' };
const USER = '44444444-4444-4444-8444-444444444444';

const ING_BEEF = 'ing-beef-1';
const ING_EGG = 'ing-egg-2';
const ING_SALT = 'ing-salt-3';

const CATALOG_INGREDIENTS = [
  { id: ING_BEEF, name: 'Thịt bò', slug: 'thit-bo', aliases: ['bò'], common_units: ['g', 'kg'] },
  { id: ING_EGG, name: 'Trứng gà', slug: 'trung-ga', aliases: ['trứng'], common_units: ['quả'] },
  { id: ING_SALT, name: 'Muối', slug: 'muoi', aliases: [], common_units: ['g', 'muỗng cà phê'] },
];

const RECIPE_SEARCH = {
  id: 'r1',
  slug: '001-bo-ne',
  name: 'Bò né',
  category_slug: 'mon_chinh',
  category_name: 'Món chính',
  difficulty: 'easy',
  default_servings: 2,
  prep_time_minutes: 10,
  cook_time_minutes: 15,
  cover_image_path: null,
  description: null,
};

function pantryRecipeDetail() {
  return detailRow({
    id: 'r1',
    slug: '001-bo-ne',
    name: 'Bò né',
    default_servings: 2,
    recipe_ingredients: [
      { sort_order: 1, quantity: 300, unit: 'g', quantity_basis: 'book', preparation_note: null, quantity_note: null, is_optional: false, ingredient: { id: ING_BEEF, name: 'Thịt bò' } },
      { sort_order: 2, quantity: 2, unit: 'quả', quantity_basis: 'book', preparation_note: null, quantity_note: null, is_optional: false, ingredient: { id: ING_EGG, name: 'Trứng gà' } },
      { sort_order: 3, quantity: null, unit: null, quantity_basis: 'to_taste', preparation_note: null, quantity_note: null, is_optional: true, ingredient: { id: ING_SALT, name: 'Muối' } },
    ],
    recipe_steps: [
      { step_number: 1, instruction: 'Áp chảo thịt bò và trứng.', timer_enabled: false, duration_seconds: null },
    ],
  });
}

function setup(pantrySeed: { ingredient_id: string; quantity: number; unit: string }[] = []) {
  const fake = createFakeSupabase(fakeSession({ id: USER }));
  fake.catalog.categories = [{ slug: 'mon_chinh', name: 'Món chính' }];
  fake.catalog.ingredients = CATALOG_INGREDIENTS;
  fake.catalog.recipes = [RECIPE_SEARCH];
  fake.catalog.details['001-bo-ne'] = pantryRecipeDetail();
  fake.tables.user_pantry = pantrySeed.map((p, idx) => ({
    id: `p-${idx + 1}`,
    user_id: USER,
    ingredient_id: p.ingredient_id,
    quantity: p.quantity,
    unit: p.unit,
    created_at: '2026-11-24T00:00:00Z',
    updated_at: '2026-11-24T00:00:00Z',
  }));
  render(<App rawEnv={ENV} createClient={() => fake.client} />);
  return fake;
}

describe('pantry domain helpers', () => {
  it('classifies Vietnamese ingredients into food groups', () => {
    expect(classifyIngredientGroup('Thịt bò thăn')).toBe('meat_seafood');
    expect(classifyIngredientGroup('Cà chua')).toBe('vegetables');
    expect(classifyIngredientGroup('Nước mắm')).toBe('spices');
    expect(classifyIngredientGroup('Bún khô')).toBe('dry_other');
  });

  it('converts compatible units and rejects incompatible ones', () => {
    expect(convertPantryQty(1.5, 'kg', 'g')).toBe(1500);
    expect(convertPantryQty(500, 'g', 'kg')).toBe(0.5);
    expect(convertPantryQty(2, 'lít', 'ml')).toBe(2000);
    expect(convertPantryQty(100, 'g', 'quả')).toBeNull();
  });
});

describe('pantry tab & shopping transfer', () => {
  it('adds canonical ingredient with common unit, groups it, edits and deletes via modal', async () => {
    const fake = setup();
    fireEvent.press(await screen.findByRole('button', { name: /^Đi chợ/ }));
    fireEvent.press(await screen.findByTestId('segment-pantry'));
    expect(await screen.findByTestId('pantry-empty')).toBeTruthy();

    fireEvent.press(screen.getByTestId('open-pantry-add-btn'));
    expect(await screen.findByTestId('pantry-add-modal')).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText('Chọn nguyên liệu chuẩn'), 'thit bo');
    fireEvent.press(await screen.findByRole('button', { name: 'Chọn Thịt bò' }));

    fireEvent.changeText(screen.getByLabelText('Số lượng trong tủ'), '500');
    fireEvent.press(screen.getByRole('button', { name: 'g' }));
    fireEvent.press(screen.getByRole('button', { name: 'Thêm vào tủ lạnh' }));

    expect(await screen.findByTestId('pantry-group-meat_seafood')).toBeTruthy();
    expect(screen.getByText('500 g')).toBeTruthy();
    expect(fake.tables.user_pantry).toHaveLength(1);

    // Open detail modal to edit quantity
    fireEvent.press(screen.getByRole('button', { name: 'Thịt bò, 500 g' }));
    expect(await screen.findByTestId('pantry-edit-modal')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Số lượng hiện có'), '800');
    fireEvent.press(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    expect(await screen.findByText('800 g')).toBeTruthy();
    expect(screen.queryByTestId('pantry-edit-modal')).toBeNull();

    // Reopen and delete
    fireEvent.press(screen.getByRole('button', { name: 'Thịt bò, 800 g' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Xóa khỏi tủ lạnh' }));
    expect(await screen.findByTestId('pantry-empty')).toBeTruthy();
  });

  it('moves checked shopping items into pantry atomically', async () => {
    const fake = setup([{ ingredient_id: ING_BEEF, quantity: 200, unit: 'g' }]);
    fake.tables.shopping_lists = [{ id: 'l1', user_id: USER, name: 'Danh sách mua sắm', created_at: '2026-11-24T00:00:00Z' }];
    fake.tables.shopping_list_items = [
      { id: 's1', shopping_list_id: 'l1', ingredient_id: ING_BEEF, label: 'Thịt bò', quantity: 1, unit: 'kg', note: null, is_checked: true, sort_order: 0 },
      { id: 's2', shopping_list_id: 'l1', ingredient_id: ING_EGG, label: 'Trứng gà', quantity: 4, unit: 'quả', note: null, is_checked: true, sort_order: 1 },
    ];

    fireEvent.press(await screen.findByRole('button', { name: /^Đi chợ/ }));
    expect(await screen.findByTestId('move-to-pantry-btn')).toBeTruthy();

    // Uncheck Trứng gà from moving, only move Thịt bò
    fireEvent.press(screen.getByRole('checkbox', { name: 'Chọn cất Trứng gà vào tủ lạnh' }));
    fireEvent.press(screen.getByRole('button', { name: 'Cất vào tủ lạnh (1)' }));
    const moveModal = await screen.findByTestId('move-to-pantry-modal');
    expect(moveModal).toBeTruthy();
    await within(moveModal).findByText('Thịt bò');
    fireEvent.press(screen.getByTestId('confirm-move-pantry-btn'));

    expect(await screen.findByText('Đã cất 1 món vào tủ lạnh.')).toBeTruthy();
    expect(screen.queryByTestId('move-to-pantry-modal')).toBeNull();
    // Beef merged: 200g + 1kg = 1200g; s1 removed, s2 stayed
    expect(fake.tables.user_pantry.find((p) => p.ingredient_id === ING_BEEF)?.quantity).toBe(1200);
    expect(fake.tables.shopping_list_items.map((i) => i.id)).toEqual(['s2']);
  });
});

describe('recipe availability, warning modal, home matching & cooking deduction', () => {
  it('shows availability badges, warns when missing ingredients, and deducts pantry on finish', async () => {
    // User has 500 g beef (enough for 300 g), but NO eggs
    const fake = setup([{ ingredient_id: ING_BEEF, quantity: 500, unit: 'g' }]);

    // Home screen: filter "Nấu từ tủ lạnh"
    await screen.findByText('Bò né');
    fireEvent.press(screen.getByRole('button', { name: 'Nấu từ tủ lạnh' }));
    expect(await screen.findByText('Có 1/2 · Thiếu 1 món')).toBeTruthy();

    // Open recipe detail
    fireEvent.press(screen.getByRole('button', { name: /^Bò né\./ }));
    await screen.findByTestId('recipe-detail');
    expect(await screen.findByText('Đã có trong tủ (500 g)')).toBeTruthy();
    expect(screen.getByText('Thiếu')).toBeTruthy();

    // Press "Bắt đầu nấu" -> warns about missing eggs
    fireEvent.press(screen.getByRole('button', { name: 'Bắt đầu nấu' }));
    expect(await screen.findByTestId('missing-ingredients-modal')).toBeTruthy();
    expect(within(screen.getByTestId('missing-ingredients-modal')).getByText('• Trứng gà')).toBeTruthy();

    // Continue anyway -> enters Cooking Mode
    fireEvent.press(screen.getByTestId('continue-cook-btn'));
    await screen.findByTestId('cooking-mode');

    // Finish step -> opens DeductPantryModal for beef (300 g default)
    fireEvent.press(screen.getByRole('button', { name: 'Hoàn thành' }));
    const modal = await screen.findByTestId('deduct-pantry-modal');
    expect(modal).toBeTruthy();
    expect(within(modal).getByLabelText('Số lượng trừ Thịt bò').props.value).toBe('300');

    // Edit to 250 g and confirm
    fireEvent.changeText(within(modal).getByLabelText('Số lượng trừ Thịt bò'), '250');
    fireEvent.press(screen.getByTestId('confirm-deduct-btn'));

    await screen.findByTestId('recipe-detail');
    expect(fake.tables.user_pantry.find((p) => p.ingredient_id === ING_BEEF)?.quantity).toBe(250);
  });

  it('prevents negative deduction and handles network errors safely', async () => {
    const fake = setup([{ ingredient_id: ING_BEEF, quantity: 500, unit: 'g' }]);
    fireEvent.press(await screen.findByRole('button', { name: /^Bò né\./ }));
    await screen.findByTestId('recipe-detail');
    await screen.findByText('Đã có trong tủ (500 g)');
    fireEvent.press(screen.getByRole('button', { name: 'Bắt đầu nấu' }));
    fireEvent.press(await screen.findByTestId('continue-cook-btn'));
    await screen.findByTestId('cooking-mode');
    fireEvent.press(screen.getByRole('button', { name: 'Hoàn thành' }));
    const modal = await screen.findByTestId('deduct-pantry-modal');

    // Try deducting more than available (600 > 500) -> blocked client-side
    fireEvent.changeText(within(modal).getByLabelText('Số lượng trừ Thịt bò'), '600');
    fireEvent.press(screen.getByTestId('confirm-deduct-btn'));
    expect(await screen.findByTestId('deduct-pantry-error')).toHaveTextContent(/Không thể trừ âm/);

    // Valid deduction but network fails -> friendly error & Retry/Skip
    fireEvent.changeText(within(modal).getByLabelText('Số lượng trừ Thịt bò'), '500');
    fake.rpc.mockResolvedValueOnce({ data: null, error: { message: 'TypeError: Network request failed' } });
    fireEvent.press(screen.getByTestId('confirm-deduct-btn'));
    expect(await screen.findByTestId('deduct-pantry-error')).toHaveTextContent(/Mất kết nối mạng/);
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeTruthy();

    // Retry succeeds -> depletes beef to 0 and removes it from pantry
    fireEvent.press(screen.getByTestId('confirm-deduct-btn'));
    await screen.findByTestId('recipe-detail');
    expect(fake.tables.user_pantry).toHaveLength(0);
  });
});

describe('AsyncStorage fallback when remote pantry migration is missing', () => {
  it('supports add/merge, fetch, recipe matching, and deduction locally on PGRST205/PGRST202', async () => {
    await AsyncStorage.clear();
    const fake = createFakeSupabase(fakeSession({ id: USER }));
    fake.catalog.ingredients = CATALOG_INGREDIENTS;
    fake.catalog.details['001-bo-ne'] = pantryRecipeDetail();
    fake.tables.shopping_lists = [{ id: 'l1', user_id: USER, name: 'Danh sách mua sắm', created_at: '2026-11-24T00:00:00Z' }];
    fake.tables.shopping_list_items = [
      { id: 's1', shopping_list_id: 'l1', ingredient_id: ING_BEEF, label: 'Thịt bò', quantity: 500, unit: 'g', note: null, is_checked: true, sort_order: 0 },
    ];

    // Simulate missing user_pantry table & RPCs on remote server
    const missingTable = { code: 'PGRST205', message: "Could not find the table 'public.user_pantry' in the schema cache" };
    const missingRpc = { code: 'PGRST202', message: 'Could not find the function in the schema cache' };
    fake.rpc.mockImplementation(async () => ({ data: null, error: missingRpc }));

    // Add + merge via fallback and clear shopping item
    await addOrMergePantryItems(fake.client, [{ ingredientId: ING_BEEF, quantity: 500, unit: 'g' }], ['s1'], USER);
    await addOrMergePantryItems(fake.client, [{ ingredientId: ING_BEEF, quantity: 0.5, unit: 'kg' }], undefined, USER);

    fake.failNext('user_pantry', 'select', missingTable);
    const localItems = await fetchPantry(fake.client, USER);
    expect(localItems).toHaveLength(1);
    expect(localItems[0].name).toBe('Thịt bò');
    expect(localItems[0].quantity).toBe(1000);
    expect(fake.tables.shopping_list_items).toHaveLength(0);

    // Match recipes locally
    const matched = await matchRecipesFromPantry(fake.client, { limit: 20, offset: 0 }, USER);
    expect(matched.items).toHaveLength(1);
    expect(matched.items[0].recipe.slug).toBe('001-bo-ne');
    expect(matched.items[0].missingCount).toBe(1);

    // Deduct locally and ensure depletion removes row
    await deductPantryIngredients(fake.client, [{ ingredientId: ING_BEEF, quantity: 1, unit: 'kg' }], USER);
    fake.failNext('user_pantry', 'select', missingTable);
    expect(await fetchPantry(fake.client, USER)).toEqual([]);
  });
});
