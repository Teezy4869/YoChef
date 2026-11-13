import { fireEvent, render, screen, within } from '@testing-library/react-native';

import App from '@/app/App';
import { formatClock, formatSeconds } from '@/features/recipes/format';
import { parseRecipeDetail } from '@/features/recipes/recipeApi';
import { clampServings, formatQuantity, quantityText, scaleQuantity } from '@/features/recipes/servings';

import { createFakeSupabase } from './helpers/fakeSupabase';

const ENV = { url: 'https://bdhphjwhagygbwtfhhxn.supabase.co', key: 'sb_publishable_test' };

export function detailRow(over: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    slug: '001-thit-kho',
    name: 'Thịt lợn kho cốt dừa',
    description: 'Món kho đậm đà.',
    difficulty: 'medium',
    default_servings: 4,
    serving_basis: 'book',
    serving_note: null,
    prep_time_minutes: 15,
    cook_time_minutes: 60,
    cover_image_path: '001-thit-kho/cover.webp',
    category: { slug: 'mon_chinh', name: 'Món chính' },
    source: { title: 'Dieu Thao 2014', compiler: 'Điều Thảo', publication_year: 2014, usage_note: 'Sử dụng cho mục đích giáo dục' },
    recipe_ingredients: [
      { sort_order: 2, quantity: 2.5, unit: 'muỗng canh', quantity_basis: 'book', preparation_note: null, quantity_note: null, is_optional: false, ingredient: { name: 'Nước mắm' } },
      { sort_order: 1, quantity: 500, unit: 'g', quantity_basis: 'book', preparation_note: 'cắt miếng', quantity_note: null, is_optional: false, ingredient: { name: 'Thịt lợn' } },
      { sort_order: 3, quantity: null, unit: null, quantity_basis: 'to_taste', preparation_note: null, quantity_note: null, is_optional: false, ingredient: { name: 'Tiêu' } },
      { sort_order: 4, quantity: 300, unit: 'ml', quantity_basis: 'editor_estimate', preparation_note: null, quantity_note: null, is_optional: true, ingredient: { name: 'Nước dừa' } },
    ],
    recipe_steps: [
      { step_number: 2, instruction: 'Kho nhỏ lửa.', timer_enabled: true, duration_seconds: 2400 },
      { step_number: 1, instruction: 'Ướp thịt.', timer_enabled: false, duration_seconds: null },
    ],
    ...over,
  };
}

describe('servings math', () => {
  it('scales linearly and keeps unknown/to-taste null', () => {
    expect(scaleQuantity(500, 'book', 4, 8)).toBe(1000);
    expect(scaleQuantity(500, 'book', 4, 2)).toBe(250);
    expect(scaleQuantity(null, 'book', 4, 8)).toBeNull();
    expect(scaleQuantity(5, 'to_taste', 4, 8)).toBeNull();
    expect(scaleQuantity(500, 'book', null, 8)).toBe(500); // cannot scale: book value
  });

  it('clamps servings to 1..50', () => {
    expect(clampServings(0)).toBe(1);
    expect(clampServings(99)).toBe(50);
    expect(clampServings(NaN)).toBe(1);
    expect(clampServings(3.4)).toBe(3);
  });

  it.each([
    [0.5, '½'],
    [0.25, '¼'],
    [1 / 3, '⅓'],
    [2.5, '2½'],
    [2.75, '2¾'],
    [3, '3'],
    [2.999, '3'],
    [0.1, '0,1'],
    [1.2, '1,2'],
    [12.34, '12,3'],
    [10, '10'],
    [250.4, '250'],
    [2500, '2500'],
  ])('formats %s as %s', (n, text) => {
    expect(formatQuantity(n)).toBe(text);
  });

  it('formats a whole line, with estimate and to-taste markers', () => {
    expect(quantityText(2.5, 'muỗng canh', 'book', 4, 4)).toBe('2½ muỗng canh');
    expect(quantityText(300, 'ml', 'editor_estimate', 4, 8)).toBe('≈ 600 ml');
    expect(quantityText(null, null, 'to_taste', 4, 8)).toBe('vừa ăn');
    expect(quantityText(2, null, 'book', 4, 4)).toBe('2');
  });

  it('is exact at the default servings (no rounding drift)', () => {
    for (const q of [0.125, 1, 7.5, 33.3, 99.9]) {
      expect(scaleQuantity(q, 'book', 6, 6)).toBe(q);
    }
  });
});

describe('time formatting', () => {
  it('words and clock', () => {
    expect(formatSeconds(30)).toBe('30 giây');
    expect(formatSeconds(90)).toBe('1 phút 30 giây');
    expect(formatSeconds(900)).toBe('15 phút');
    expect(formatSeconds(5400)).toBe('1 giờ 30 phút');
    expect(formatClock(75)).toBe('01:15');
    expect(formatClock(3725)).toBe('1:02:05');
    expect(formatClock(0.2)).toBe('00:01');
    expect(formatClock(-5)).toBe('00:00');
  });
});

describe('parseRecipeDetail', () => {
  it('orders lines, keeps to-taste null, drops a timer without duration, tolerates array embeds', () => {
    const d = parseRecipeDetail(
      detailRow({
        category: [{ slug: 'mon_chinh', name: 'Món chính' }],
        recipe_steps: [{ step_number: 1, instruction: 'A', timer_enabled: true, duration_seconds: null }],
        recipe_ingredients: [
          { sort_order: 2, quantity: 0, unit: '', quantity_basis: 'book', is_optional: false, ingredient: { name: 'Bad zero' } },
          { sort_order: 1, quantity: 5, unit: 'g', quantity_basis: 'to_taste', is_optional: false, ingredient: { name: 'Muối' } },
          { sort_order: 3, quantity: 1, unit: 'g', quantity_basis: 'book', is_optional: false, ingredient: null },
        ],
      }),
    );
    expect(d.categoryName).toBe('Món chính');
    expect(d.steps[0].timerEnabled).toBe(false);
    expect(d.ingredients.map((i) => i.name)).toEqual(['Muối', 'Bad zero']); // nameless line dropped
    expect(d.ingredients[0].quantity).toBeNull(); // to taste
    expect(d.ingredients[1].quantity).toBeNull(); // 0 is unknown
    expect(d.ingredients[1].unit).toBeNull(); // '' is unknown
  });
});

async function openDetail(row: Record<string, unknown> | null = detailRow()) {
  const fake = createFakeSupabase();
  fake.catalog.recipes = [
    { id: 'r1', slug: '001-thit-kho', name: 'Thịt lợn kho cốt dừa', category_slug: 'mon_chinh', category_name: 'Món chính',
      difficulty: 'medium', default_servings: 4, prep_time_minutes: 15, cook_time_minutes: 60, cover_image_path: null, description: null },
  ];
  if (row) fake.catalog.details['001-thit-kho'] = row;
  render(<App rawEnv={ENV} createClient={() => fake.client} />);
  fireEvent.press(await screen.findByRole('button', { name: /^Thịt lợn kho cốt dừa\./ }));
  return fake;
}

describe('recipe detail screen', () => {
  it('shows ingredients in order with book quantities, estimates and to-taste', async () => {
    await openDetail();
    await screen.findByTestId('recipe-detail');
    const qty = screen.getAllByTestId('ingredient-qty').map((n) => n.props.children);
    expect(qty).toEqual(['500 g', '2½ muỗng canh', 'vừa ăn', '≈ 300 ml']);
    expect(screen.getByText('Nước dừa (tùy chọn)')).toBeTruthy();
    expect(screen.getByText('cắt miếng')).toBeTruthy();
  });

  it('scales quantities with the stepper and returns to the default', async () => {
    await openDetail();
    await screen.findByTestId('recipe-detail');
    expect(screen.getByTestId('servings-value')).toHaveTextContent('4 người');
    fireEvent.press(screen.getByRole('button', { name: 'Tăng khẩu phần' }));
    fireEvent.press(screen.getByRole('button', { name: 'Tăng khẩu phần' }));
    expect(screen.getByTestId('servings-value')).toHaveTextContent('6 người');
    expect(screen.getAllByTestId('ingredient-qty').map((n) => n.props.children)).toEqual([
      '750 g',
      '3¾ muỗng canh',
      'vừa ăn',
      '≈ 450 ml',
    ]);
    fireEvent.press(screen.getByRole('button', { name: 'Về 4 người' }));
    expect(screen.getByTestId('servings-value')).toHaveTextContent('4 người');
    expect(screen.getAllByTestId('ingredient-qty')[0]).toHaveTextContent('500 g');
  });

  it('stops at the minimum servings', async () => {
    await openDetail(detailRow({ default_servings: 1 }));
    await screen.findByTestId('recipe-detail');
    expect(screen.getByRole('button', { name: 'Giảm khẩu phần' })).toBeDisabled();
  });

  it('lists steps in order with their timer hint, and the source credit', async () => {
    await openDetail();
    await screen.findByTestId('recipe-detail');
    const steps = screen.getAllByTestId('step-row');
    expect(within(steps[0]).getByText('Ướp thịt.')).toBeTruthy();
    expect(within(steps[1]).getByText('Kho nhỏ lửa.')).toBeTruthy();
    expect(within(steps[1]).getByText('Hẹn giờ 40 phút')).toBeTruthy();
    expect(within(steps[0]).queryByText(/Hẹn giờ/)).toBeNull();
    expect(screen.getByText(/^Nguồn: Dieu Thao 2014 · .+ · 2014$/)).toBeTruthy();
    expect(screen.getByText('Sử dụng cho mục đích giáo dục')).toBeTruthy();
  });

  it('cannot scale when the default servings are unknown', async () => {
    await openDetail(detailRow({ default_servings: null }));
    await screen.findByTestId('recipe-detail');
    expect(screen.queryByTestId('servings-stepper')).toBeNull();
    expect(screen.getByText(/Chưa rõ khẩu phần gốc/)).toBeTruthy();
    expect(screen.getAllByTestId('ingredient-qty')[0]).toHaveTextContent('500 g');
  });

  it('says so when the recipe is not found or not published', async () => {
    await openDetail(null);
    expect(await screen.findByTestId('recipe-detail-notfound')).toBeTruthy();
  });
});
