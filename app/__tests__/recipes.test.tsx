import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { FlatList } from 'react-native';

import App from '@/app/App';
import { formatMinutes, joinMeta, timeLabel, totalMinutes } from '@/features/recipes/format';
import { asNumber, searchRecipes } from '@/features/recipes/recipeApi';
import { EMPTY_FILTERS } from '@/features/recipes/types';

import { createFakeSupabase } from './helpers/fakeSupabase';

const ENV = { url: 'https://bdhphjwhagygbwtfhhxn.supabase.co', key: 'sb_publishable_test' };

function row(n: number, over: Record<string, unknown> = {}) {
  return {
    id: `id-${n}`,
    slug: `${String(n).padStart(3, '0')}-mon-${n}`,
    name: `Món ${n}`,
    description: null,
    category_slug: 'mon_chinh',
    category_name: 'Món chính',
    difficulty: 'easy',
    default_servings: 4,
    prep_time_minutes: 10,
    cook_time_minutes: 20,
    cover_image_path: `${String(n).padStart(3, '0')}-mon-${n}/cover.webp`,
    ...over,
  };
}

function setup(rows: Record<string, unknown>[]) {
  const fake = createFakeSupabase();
  fake.catalog.categories = [
    { slug: 'mon_chinh', name: 'Món chính' },
    { slug: 'canh', name: 'Canh' },
  ];
  fake.catalog.recipes = rows;
  render(<App rawEnv={ENV} createClient={() => fake.client} />);
  return fake;
}

describe('format helpers', () => {
  it('formats minutes', () => {
    expect(formatMinutes(45)).toBe('45 phút');
    expect(formatMinutes(60)).toBe('1 giờ');
    expect(formatMinutes(95)).toBe('1 giờ 35 phút');
  });

  it('never invents an unknown time (null is not 0)', () => {
    expect(totalMinutes(15, null)).toBeNull();
    expect(timeLabel(null, null)).toBeNull();
    expect(timeLabel(15, 45)).toBe('1 giờ');
    expect(timeLabel(null, 30)).toBe('Nấu 30 phút');
    expect(timeLabel(10, null)).toBe('Chuẩn bị 10 phút');
  });

  it('joins only the parts that exist', () => {
    expect(joinMeta(['45 phút', null, 'Dễ'])).toBe('45 phút · Dễ');
    expect(joinMeta([null, undefined])).toBe('');
  });

  it('parses numbers defensively', () => {
    expect(asNumber('2.5')).toBe(2.5);
    expect(asNumber(null)).toBeNull();
    expect(asNumber('abc')).toBeNull();
    expect(asNumber('')).toBeNull();
  });
});

describe('searchRecipes', () => {
  it('maps rows, nulls and the total', async () => {
    const fake = createFakeSupabase();
    fake.catalog.recipes = [row(1, { prep_time_minutes: null, cook_time_minutes: null, difficulty: 'weird', description: '' })];
    const r = await searchRecipes(fake.client, EMPTY_FILTERS);
    expect(r.total).toBe(1);
    expect(r.items[0]).toMatchObject({
      slug: '001-mon-1',
      prepTimeMinutes: null,
      cookTimeMinutes: null,
      difficulty: null,
      description: null,
    });
  });

  it('passes the trimmed query and filters, blank query as null', async () => {
    const fake = createFakeSupabase();
    await searchRecipes(fake.client, { query: '  ', categorySlug: 'canh', difficulty: 'hard', maxTotalMinutes: 30 }, { offset: 40 });
    expect(fake.rpc).toHaveBeenCalledWith('search_recipes', {
      p_query: null,
      p_category_slug: 'canh',
      p_difficulty: 'hard',
      p_max_total_minutes: 30,
      p_limit: 20,
      p_offset: 40,
    });
  });

  it('turns a transport failure into a friendly message', async () => {
    const fake = createFakeSupabase();
    fake.rpc.mockResolvedValueOnce({ data: null, error: { message: 'TypeError: Network request failed' } });
    await expect(searchRecipes(fake.client, EMPTY_FILTERS)).rejects.toThrow('Không kết nối được máy chủ');
  });
});

describe('recipe list screen', () => {
  it('shows recipes with meta and a count, omitting unknown parts', async () => {
    setup([row(1), row(2, { prep_time_minutes: null, cook_time_minutes: null, default_servings: null, difficulty: null })]);
    expect(await screen.findByText('Món 1')).toBeTruthy();
    expect(screen.getByTestId('result-count')).toHaveTextContent('2 công thức');
    expect(screen.getByLabelText('Món 1. 30 phút · 4 người · Dễ')).toBeTruthy();
    expect(screen.getByLabelText('Món 2. ')).toBeTruthy();
    expect(screen.getAllByTestId('recipe-card-image')).toHaveLength(2);
  });

  it('shows an empty state with a way back, and clears filters', async () => {
    setup([row(1)]);
    await screen.findByText('Món 1');
    fireEvent.press(screen.getByLabelText('Canh'));
    expect(await screen.findByTestId('recipes-empty')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Xóa bộ lọc' }));
    expect(await screen.findByText('Món 1')).toBeTruthy();
  });

  it('searches without accents, after the debounce', async () => {
    jest.useFakeTimers();
    try {
      const fake = setup([row(1, { name: 'Thịt lợn kho' }), row(2, { name: 'Canh chua' })]);
      await screen.findByText('Thịt lợn kho');
      fireEvent.changeText(screen.getByLabelText('Tìm công thức'), 'thit lon');
      expect(fake.rpc).toHaveBeenCalledTimes(1); // typing alone does not search
      await act(async () => {
        jest.advanceTimersByTime(400);
      });
      await waitFor(() => expect(screen.queryByText('Canh chua')).toBeNull());
      expect(screen.getByText('Thịt lợn kho')).toBeTruthy();
      expect(fake.rpc).toHaveBeenLastCalledWith('search_recipes', expect.objectContaining({ p_query: 'thit lon' }));
    } finally {
      jest.useRealTimers();
    }
  });

  it('applies a category chip at once and toggles it off', async () => {
    const fake = setup([row(1), row(2, { category_slug: 'canh', category_name: 'Canh', name: 'Canh 2' })]);
    await screen.findByText('Món 1');
    fireEvent.press(screen.getByLabelText('Canh'));
    await waitFor(() => expect(screen.queryByText('Món 1')).toBeNull());
    expect(screen.getByText('Canh 2')).toBeTruthy();
    expect(fake.rpc).toHaveBeenLastCalledWith('search_recipes', expect.objectContaining({ p_category_slug: 'canh' }));
    fireEvent.press(screen.getByLabelText('Canh'));
    expect(await screen.findByText('Món 1')).toBeTruthy();
  });

  it('loads the next page when the end is reached', async () => {
    const rows = Array.from({ length: 25 }, (_, i) => row(i + 1));
    const fake = setup(rows);
    await screen.findByText('Món 1');
    expect(screen.getByTestId('result-count')).toHaveTextContent('25 công thức');
    fireEvent(screen.UNSAFE_getByType(FlatList), 'endReached');
    await waitFor(() =>
      expect(fake.rpc).toHaveBeenCalledWith('search_recipes', expect.objectContaining({ p_offset: 20 })),
    );
  });

  it('shows an error with retry when loading fails', async () => {
    const fake = createFakeSupabase();
    fake.rpc.mockResolvedValueOnce({ data: null, error: { message: 'TypeError: Network request failed' } });
    fake.catalog.recipes = [row(1)];
    render(<App rawEnv={ENV} createClient={() => fake.client} />);
    expect(await screen.findByTestId('recipes-error')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Món 1')).toBeTruthy();
  });

  it('opens the recipe detail for the tapped card', async () => {
    const fake = setup([row(7)]);
    fake.catalog.details['007-mon-7'] = { id: 'id-7', slug: '007-mon-7', name: 'Món 7', recipe_ingredients: [], recipe_steps: [] };
    fireEvent.press(await screen.findByRole('button', { name: /^Món 7\./ }));
    expect(await screen.findByTestId('recipe-detail')).toBeTruthy();
    expect(screen.getByText('Chưa có danh sách nguyên liệu.')).toBeTruthy();
  });
});
