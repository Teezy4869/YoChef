// Recipe data access. Reads only: the Data API enforces that guests and users
// see published recipes (RLS), and search runs in public.search_recipes().
import type { YoChefClient } from '@/lib/supabase';

import type { Category, Difficulty, RecipeSummary, SearchFilters } from './types';

export const COVER_BUCKET = 'recipe-images';
export const PAGE_SIZE = 20;

export class RecipeError extends Error {}

const NETWORK = 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';

export function fail(error: { message?: string } | null | undefined, fallback: string): never {
  if (error?.message && /network|fetch/i.test(error.message)) throw new RecipeError(NETWORK);
  throw new RecipeError(fallback);
}

const DIFFICULTIES: readonly string[] = ['easy', 'medium', 'hard'];

export function asDifficulty(v: unknown): Difficulty | null {
  return typeof v === 'string' && DIFFICULTIES.includes(v) ? (v as Difficulty) : null;
}

/** Postgres numbers can arrive as strings; anything that is not a finite number is unknown. */
export function asNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function asText(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

type SearchRow = Record<string, unknown>;

function toSummary(row: SearchRow): RecipeSummary {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    description: asText(row.description),
    categorySlug: asText(row.category_slug),
    categoryName: asText(row.category_name),
    difficulty: asDifficulty(row.difficulty),
    defaultServings: asNumber(row.default_servings),
    prepTimeMinutes: asNumber(row.prep_time_minutes),
    cookTimeMinutes: asNumber(row.cook_time_minutes),
    coverImagePath: asText(row.cover_image_path),
  };
}

export async function searchRecipes(
  client: YoChefClient,
  filters: SearchFilters,
  page: { limit?: number; offset?: number } = {},
): Promise<{ items: RecipeSummary[]; total: number }> {
  const { data, error } = await client.rpc('search_recipes', {
    p_query: filters.query.trim() || null,
    p_category_slug: filters.categorySlug,
    p_difficulty: filters.difficulty,
    p_max_total_minutes: filters.maxTotalMinutes,
    p_limit: page.limit ?? PAGE_SIZE,
    p_offset: page.offset ?? 0,
  });
  if (error) fail(error, 'Không tải được danh sách công thức.');
  const rows = (data ?? []) as SearchRow[];
  return {
    items: rows.map(toSummary),
    total: rows.length > 0 ? (asNumber(rows[0].total_count) ?? rows.length) : 0,
  };
}

export async function fetchCategories(client: YoChefClient): Promise<Category[]> {
  const { data, error } = await client.from('categories').select('slug,name').order('sort_order');
  if (error) fail(error, 'Không tải được danh mục.');
  return ((data ?? []) as { slug: string; name: string }[]).map((c) => ({ slug: c.slug, name: c.name }));
}

export function coverUrl(client: YoChefClient, path: string | null): string | null {
  if (!path) return null;
  return client.storage.from(COVER_BUCKET).getPublicUrl(path).data.publicUrl;
}
