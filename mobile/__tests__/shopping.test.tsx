import { cleanupAsync, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import App from '@/app/App';
import { itemsFromRecipe, parseManual } from '@/features/shopping/shoppingApi';
import { parseRecipeDetail } from '@/features/recipes/recipeApi';

import { createFakeSupabase, fakeSession } from './helpers/fakeSupabase';
import { detailRow } from './helpers/recipeFixtures';

const ENV = { url: 'https://bdhphjwhagygbwtfhhxn.supabase.co', key: 'sb_publishable_test' };
const USER = '44444444-4444-4444-8444-444444444444';
const SEARCH_ROW = {
  id: 'r1', slug: '001-thit-kho', name: 'Thịt lợn kho cốt dừa', category_slug: 'mon_chinh', category_name: 'Món chính',
  difficulty: 'medium', default_servings: 4, prep_time_minutes: 15, cook_time_minutes: 60, cover_image_path: null, description: null,
};

function setup(session: ReturnType<typeof fakeSession> | null = fakeSession({ id: USER })) {
  const fake = createFakeSupabase(session);
  fake.catalog.recipes = [SEARCH_ROW];
  fake.catalog.details['001-thit-kho'] = detailRow();
  render(<App rawEnv={ENV} createClient={() => fake.client} />);
  return fake;
}

/** Close the app and open it again on the same backend (the stack header has no back button under Jest). */
async function reopen(fake: ReturnType<typeof createFakeSupabase>) {
  await cleanupAsync();
  render(<App rawEnv={ENV} createClient={() => fake.client} />);
}

async function openRecipe() {
  fireEvent.press(await screen.findByRole('button', { name: /^Thịt lợn kho cốt dừa\./ }));
  await screen.findByTestId('recipe-detail');
}
const openShoppingTab = async () => fireEvent.press(await screen.findByRole('button', { name: /^Đi chợ/ }));
const items = (fake: ReturnType<typeof createFakeSupabase>) => fake.tables.shopping_list_items ?? [];

describe('recipe to shopping rows', () => {
  it('keeps to-taste NULL, scales and rounds like the recipe page, and carries notes', () => {
    const recipe = parseRecipeDetail(detailRow());
    expect(itemsFromRecipe(recipe, 6)).toEqual([
      { ingredient_id: null, label: 'Thịt lợn', quantity: 750, unit: 'g', note: 'cắt miếng' },
      { ingredient_id: null, label: 'Nước mắm', quantity: 3.75, unit: 'muỗng canh', note: null },
      { ingredient_id: null, label: 'Tiêu', quantity: null, unit: null, note: 'vừa ăn' },
      { ingredient_id: null, label: 'Nước dừa', quantity: 450, unit: 'ml', note: 'lượng ước tính · tùy chọn' },
    ]);
    expect(itemsFromRecipe(recipe, 4)[1].quantity).toBe(2.5); // book value, not re-rounded
  });

  it('validates a typed-in item; blank quantity and unit are NULL', () => {
    expect(parseManual({ label: '  ', quantity: '', unit: '' }).errors.label).toBeTruthy();
    expect(parseManual({ label: 'Hành', quantity: '0', unit: '' }).errors.quantity).toBeTruthy();
    expect(parseManual({ label: 'Hành', quantity: 'abc', unit: '' }).errors.quantity).toBeTruthy();
    expect(parseManual({ label: ' Hành ', quantity: '2,5', unit: ' củ ' }).item).toEqual({
      ingredient_id: null, label: 'Hành', quantity: 2.5, unit: 'củ', note: null,
    });
    expect(parseManual({ label: 'Hành', quantity: ' ', unit: '' }).item).toMatchObject({ quantity: null, unit: null });
  });
});

describe('shopping list', () => {
  it('asks a guest to sign in, from the tab and from the recipe button', async () => {
    setup(null);
    await openShoppingTab();
    expect(await screen.findByTestId('shopping-guest')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: /^Khám phá/ }));
    await openRecipe();
    fireEvent.press(screen.getByRole('button', { name: 'Thêm vào đi chợ (4 người)' }));
    expect(await screen.findByRole('button', { name: 'Đăng nhập' })).toBeTruthy();
  });

  it('adds a recipe at the chosen servings and shows it on the tab', async () => {
    const fake = setup();
    await openRecipe();
    fireEvent.press(screen.getByRole('button', { name: 'Tăng khẩu phần' }));
    fireEvent.press(screen.getByRole('button', { name: 'Tăng khẩu phần' }));
    fireEvent.press(screen.getByRole('button', { name: 'Thêm vào đi chợ (6 người)' }));
    expect(await screen.findByText('Đã thêm 4 món vào danh sách đi chợ.')).toBeTruthy();
    expect(fake.tables.shopping_lists).toEqual([expect.objectContaining({ user_id: USER, name: 'Danh sách mua sắm' })]);

    await reopen(fake);
    await openShoppingTab();
    const list = await screen.findByTestId('shopping-to-buy');
    expect(within(list).getAllByTestId('shopping-item')).toHaveLength(4);
    expect(screen.getByTestId('shopping-progress')).toHaveTextContent('Đã mua 0/4');
    expect(within(list).getByRole('checkbox', { name: 'Nước mắm, 3¾ muỗng canh' })).toBeTruthy();
    expect(within(list).getByRole('checkbox', { name: 'Tiêu' })).toBeTruthy(); // to taste: no number
  });

  it('appends a second export to the same list without merging rows', async () => {
    const fake = setup();
    await openRecipe();
    fireEvent.press(screen.getByRole('button', { name: 'Thêm vào đi chợ (4 người)' }));
    await screen.findByText('Đã thêm 4 món vào danh sách đi chợ.');
    fireEvent.press(screen.getByRole('button', { name: 'Thêm vào đi chợ (4 người)' }));
    await waitFor(() => expect(items(fake)).toHaveLength(8));
    expect(fake.tables.shopping_lists).toHaveLength(1);
    expect(items(fake).map((i) => i.sort_order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('does not leave an empty list behind when saving the rows fails', async () => {
    const fake = setup();
    await openRecipe();
    fake.failNext('shopping_list_items', 'insert');
    fireEvent.press(screen.getByRole('button', { name: 'Thêm vào đi chợ (4 người)' }));
    expect(await screen.findByText('Không lưu được món vào danh sách.')).toBeTruthy();
    expect(fake.tables.shopping_lists).toEqual([]);
  });

  it('adds a typed-in item, with field errors first', async () => {
    const fake = setup();
    await openShoppingTab();
    expect(await screen.findByTestId('shopping-empty')).toBeTruthy();
    fireEvent.press(screen.getByTestId('open-shopping-add-btn'));
    expect(await screen.findByTestId('shopping-add-modal')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Thêm vào danh sách' }));
    expect(await screen.findByText('Nhập tên món cần mua.')).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText('Món cần mua'), 'Hành lá');
    fireEvent.changeText(screen.getByLabelText('Số lượng'), '0');
    fireEvent.press(screen.getByRole('button', { name: 'Thêm vào danh sách' }));
    expect(await screen.findByText('Số lượng phải là số lớn hơn 0.')).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText('Số lượng'), '2,5');
    fireEvent.changeText(screen.getByLabelText('Đơn vị'), 'củ');
    fireEvent.press(screen.getByRole('button', { name: 'Thêm vào danh sách' }));
    expect(await screen.findByRole('checkbox', { name: 'Hành lá, 2½ củ' })).toBeTruthy();
    expect(items(fake)).toEqual([expect.objectContaining({ label: 'Hành lá', quantity: 2.5, unit: 'củ', ingredient_id: null })]);
    expect(screen.getByLabelText('Món cần mua').props.value).toBe(''); // form cleared
  });

  it('ticks, rolls a failed tick back, removes and clears bought items', async () => {
    const fake = setup();
    fake.tables.shopping_lists = [{ id: 'l1', user_id: USER, name: 'Danh sách mua sắm', created_at: '2026-11-14T00:00:00Z' }];
    fake.tables.shopping_list_items = [
      { id: 'i1', shopping_list_id: 'l1', label: 'Gừng', quantity: 50, unit: 'g', note: null, is_checked: false, sort_order: 0 },
      { id: 'i2', shopping_list_id: 'l1', label: 'Quế', quantity: null, unit: null, note: null, is_checked: false, sort_order: 1 },
      { id: 'i3', shopping_list_id: 'l1', label: 'Hồi', quantity: 3, unit: 'cánh', note: null, is_checked: false, sort_order: 2 },
    ];
    await openShoppingTab();
    fireEvent.press(await screen.findByRole('checkbox', { name: 'Gừng, 50 g' }));
    expect(await screen.findByTestId('shopping-bought')).toBeTruthy();
    expect(screen.getByTestId('shopping-progress')).toHaveTextContent('Đã mua 1/3');
    expect(items(fake).find((i) => i.id === 'i1')?.is_checked).toBe(true);

    fake.failNext('shopping_list_items', 'update');
    fireEvent.press(screen.getByRole('checkbox', { name: 'Quế' }));
    expect(await screen.findByText('Không cập nhật được món này.')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Quế' })).not.toBeChecked();

    fireEvent.press(screen.getByRole('button', { name: 'Xóa Hồi' }));
    await waitFor(() => expect(items(fake).map((i) => i.id)).toEqual(['i1', 'i2']));

    fireEvent.press(screen.getByRole('button', { name: 'Xóa các món đã mua (1)' }));
    await waitFor(() => expect(items(fake).map((i) => i.id)).toEqual(['i2']));
    expect(screen.queryByTestId('shopping-bought')).toBeNull();
  });

  it('checks all remaining items at once and rolls back on failure', async () => {
    const fake = setup();
    fake.tables.shopping_lists = [{ id: 'l1', user_id: USER, name: 'Danh sách mua sắm', created_at: '2026-11-14T00:00:00Z' }];
    fake.tables.shopping_list_items = [
      { id: 'i1', shopping_list_id: 'l1', label: 'Gừng', quantity: 50, unit: 'g', note: null, is_checked: false, sort_order: 0 },
      { id: 'i2', shopping_list_id: 'l1', label: 'Quế', quantity: null, unit: null, note: null, is_checked: false, sort_order: 1 },
    ];
    await openShoppingTab();
    expect(await screen.findByTestId('shopping-to-buy')).toBeTruthy();

    fake.failNext('shopping_list_items', 'update');
    fireEvent.press(screen.getByTestId('check-all-btn'));
    expect(await screen.findByText('Không cập nhật được danh sách.')).toBeTruthy();
    expect(screen.getByTestId('shopping-progress')).toHaveTextContent('Đã mua 0/2');

    fireEvent.press(screen.getByTestId('check-all-btn'));
    await waitFor(() => expect(screen.queryByTestId('shopping-to-buy')).toBeNull());
    expect(screen.getByTestId('shopping-progress')).toHaveTextContent('Đã mua 2/2');
    expect(items(fake).every((i) => i.is_checked)).toBe(true);
  });
});
