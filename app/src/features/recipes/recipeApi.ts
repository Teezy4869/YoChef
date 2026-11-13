// Recipe data access. Reads only: the Data API enforces that guests and users
// see published recipes (RLS), and search runs in public.search_recipes().
import type { YoChefClient } from '@/lib/supabase';

import type {
  Category,
  Difficulty,
  IngredientLine,
  QuantityBasis,
  RecipeDetail,
  RecipeStep,
  RecipeSummary,
  SearchFilters,
  ServingBasis,
} from './types';

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

// --- Detail -------------------------------------------------------------------

const DETAIL_SELECT =
  'id,slug,name,description,difficulty,default_servings,serving_basis,serving_note,prep_time_minutes,cook_time_minutes,' +
  'cover_image_path,category:categories(slug,name),source:recipe_sources(title,compiler,publication_year,usage_note),' +
  'recipe_ingredients(sort_order,quantity,unit,quantity_basis,preparation_note,quantity_note,is_optional,ingredient:ingredients(name)),' +
  'recipe_steps(step_number,instruction,timer_enabled,duration_seconds)';

type Row = Record<string, unknown>;

/** PostgREST returns a to-one embed as an object; tolerate a one-element array too. */
function one(v: unknown): Row | null {
  const x = Array.isArray(v) ? v[0] : v;
  return x && typeof x === 'object' ? (x as Row) : null;
}

function many(v: unknown): Row[] {
  return Array.isArray(v) ? (v as Row[]) : [];
}

const QUANTITY_BASIS: readonly string[] = ['book', 'editor_estimate', 'to_taste'];
const SERVING_BASIS: readonly string[] = ['book', 'editor_estimate', 'inferred_yield'];

function toIngredient(r: Row): IngredientLine | null {
  const name = asText(one(r.ingredient)?.name);
  const sortOrder = asNumber(r.sort_order);
  if (!name || sortOrder === null) return null;
  const basis = (QUANTITY_BASIS.includes(String(r.quantity_basis)) ? r.quantity_basis : 'book') as QuantityBasis;
  const q = asNumber(r.quantity);
  return {
    sortOrder,
    name,
    // "To taste" is always null; a stray 0 from bad data is unknown too.
    quantity: basis === 'to_taste' || q === null || q <= 0 ? null : q,
    unit: asText(r.unit),
    basis,
    preparationNote: asText(r.preparation_note),
    quantityNote: asText(r.quantity_note),
    isOptional: r.is_optional === true,
  };
}

function toStep(r: Row): RecipeStep | null {
  const stepNumber = asNumber(r.step_number);
  const instruction = asText(r.instruction);
  if (stepNumber === null || !instruction) return null;
  const duration = asNumber(r.duration_seconds);
  const durationSeconds = duration !== null && duration > 0 ? duration : null;
  return {
    stepNumber,
    instruction,
    // A timer needs a duration; without one the step simply has no timer.
    timerEnabled: r.timer_enabled === true && durationSeconds !== null,
    durationSeconds,
  };
}

export function parseRecipeDetail(row: Row): RecipeDetail {
  const source = one(row.source);
  const category = one(row.category);
  const sourceTitle = asText(source?.title);
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    description: asText(row.description),
    categoryName: asText(category?.name),
    difficulty: asDifficulty(row.difficulty),
    defaultServings: asNumber(row.default_servings),
    servingBasis: SERVING_BASIS.includes(String(row.serving_basis)) ? (row.serving_basis as ServingBasis) : null,
    servingNote: asText(row.serving_note),
    prepTimeMinutes: asNumber(row.prep_time_minutes),
    cookTimeMinutes: asNumber(row.cook_time_minutes),
    coverImagePath: asText(row.cover_image_path),
    source: sourceTitle
      ? {
          title: sourceTitle,
          compiler: asText(source?.compiler),
          publicationYear: asNumber(source?.publication_year),
          usageNote: asText(source?.usage_note),
        }
      : null,
    ingredients: many(row.recipe_ingredients)
      .map(toIngredient)
      .filter((i): i is IngredientLine => i !== null)
      .sort((a, b) => a.sortOrder - b.sortOrder),
    steps: many(row.recipe_steps)
      .map(toStep)
      .filter((s): s is RecipeStep => s !== null)
      .sort((a, b) => a.stepNumber - b.stepNumber),
  };
}

/** Null when the slug does not exist or the recipe is not published (RLS hides it). */
export async function fetchRecipeDetail(client: YoChefClient, slug: string): Promise<RecipeDetail | null> {
  const { data, error } = await client.from('recipes').select(DETAIL_SELECT).eq('slug', slug).maybeSingle();
  if (error) fail(error, 'Không tải được công thức.');
  return data ? parseRecipeDetail(data as unknown as Row) : null;
}
