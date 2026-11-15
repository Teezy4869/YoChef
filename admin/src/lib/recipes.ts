// Recipe CMS data (4.5). Editors read every status (RLS) and write only through
// save_recipe / transition_recipe_status / delete_recipe. Covers go to
// recipe-images as <slug>/cover-<time>.<ext>, never overwriting a file.
import { errorMessage, type AdminClient } from './supabase';

export type RecipeStatus = 'draft' | 'staged' | 'published' | 'archived';
export type QuantityBasis = 'book' | 'editor_estimate' | 'to_taste';
export type IngredientLine = {
  ingredientId: string | null;
  name: string;
  quantity: string;
  unit: string;
  basis: QuantityBasis;
  preparationNote: string;
  isOptional: boolean;
};
export type StepLine = { instruction: string; durationMinutes: string; timerEnabled: boolean };
export type RecipeForm = {
  slug: string;
  name: string;
  description: string;
  categoryId: string;
  difficulty: string;
  defaultServings: string;
  servingBasis: string;
  servingNote: string;
  prepMinutes: string;
  cookMinutes: string;
  coverPath: string;
  ingredients: IngredientLine[];
  steps: StepLine[];
};
export type RecipeRecord = { id: string; status: RecipeStatus; form: RecipeForm };
export type Option = { id: string; name: string };
export type ListRow = { id: string; slug: string; name: string; status: RecipeStatus; updatedAt: string };

export const STATUS_LABEL: Record<RecipeStatus, string> = {
  draft: 'Nháp',
  staged: 'Chờ công bố',
  published: 'Đã công bố',
  archived: 'Lưu trữ',
};
/** The lifecycle (phase4_08): draft -> published is not a move. */
export const MOVES: Record<RecipeStatus, RecipeStatus[]> = {
  draft: ['staged', 'archived'],
  staged: ['published', 'draft', 'archived'],
  published: ['staged', 'archived'],
  archived: ['draft'],
};
export const COVER_BUCKET = 'recipe-images';
export const PAGE = 50;
const COVER_TYPES: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };

/** Field -> message, from the server's readiness check (the error detail) or our own. */
export class RecipeSaveError extends Error {
  constructor(message: string, readonly fields: Record<string, string> = {}) {
    super(message);
  }
}

function fail(error: { message?: string; code?: string; details?: string | null } | null, fallback: string): never {
  if (error?.code === '23505') throw new RecipeSaveError('Slug đã được dùng cho công thức khác.', { slug: 'Slug đã được dùng.' });
  if (error?.code === '22023' && error.details) {
    try {
      throw new RecipeSaveError('Công thức chưa đủ điều kiện.', JSON.parse(error.details) as Record<string, string>);
    } catch (e) {
      if (e instanceof RecipeSaveError) throw e;
    }
  }
  if (error?.code === '22023' && error.message) throw new RecipeSaveError(translate(error.message));
  if (error?.code === '23514') throw new RecipeSaveError('Có giá trị không hợp lệ (số lượng phải lớn hơn 0; "vừa ăn" thì để trống số lượng).');
  throw new RecipeSaveError(errorMessage(error, fallback));
}

const MESSAGES: [RegExp, string][] = [
  [/cannot move from/, 'Không chuyển được sang trạng thái này.'],
  [/type the recipe slug/, 'Slug gõ lại không khớp.'],
  [/archive a published recipe/, 'Hãy lưu trữ công thức trước khi xóa.'],
  [/favorites, ratings, comments or photos/, 'Công thức đã có người dùng tương tác, không xóa được. Hãy lưu trữ thay vì xóa.'],
  [/reason is required/, 'Cần ghi lý do.'],
];
const translate = (m: string) => MESSAGES.find(([re]) => re.test(m))?.[1] ?? 'Dữ liệu không hợp lệ.';

export const slugify = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const emptyForm = (): RecipeForm => ({
  slug: '', name: '', description: '', categoryId: '', difficulty: '', defaultServings: '', servingBasis: '',
  servingNote: '', prepMinutes: '', cookMinutes: '', coverPath: '',
  ingredients: [{ ingredientId: null, name: '', quantity: '', unit: '', basis: 'book', preparationNote: '', isOptional: false }],
  steps: [{ instruction: '', durationMinutes: '', timerEnabled: false }],
});

export async function listRecipes(client: AdminClient, filter: { status: RecipeStatus | ''; search: string; page: number }) {
  let q = client.from('recipes').select('id,slug,name,status,updated_at', { count: 'exact' });
  if (filter.status) q = q.eq('status', filter.status);
  if (filter.search.trim()) q = q.ilike('name', `%${filter.search.trim().replace(/[%_]/g, '')}%`);
  const from = filter.page * PAGE;
  const { data, error, count } = await q.order('updated_at', { ascending: false }).order('slug', { ascending: true }).range(from, from + PAGE - 1);
  if (error) fail(error, 'Không tải được danh sách công thức.');
  const rows = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id), slug: String(r.slug), name: String(r.name), status: r.status as RecipeStatus, updatedAt: String(r.updated_at),
  }));
  return { rows, total: count ?? rows.length };
}

export async function loadOptions(client: AdminClient): Promise<{ categories: Option[]; ingredients: Option[] }> {
  const [c, i] = await Promise.all([
    client.from('categories').select('id,name').order('sort_order', { ascending: true }),
    client.from('ingredients').select('id,name').order('name', { ascending: true }).range(0, 4999),
  ]);
  if (c.error || i.error) fail(c.error ?? i.error, 'Không tải được danh mục và nguyên liệu.');
  return { categories: (c.data ?? []) as Option[], ingredients: (i.data ?? []) as Option[] };
}

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

export async function loadRecipe(client: AdminClient, id: string): Promise<RecipeRecord | null> {
  const { data, error } = await client
    .from('recipes')
    .select(
      'id,status,slug,name,description,category_id,difficulty,default_servings,serving_basis,serving_note,prep_time_minutes,cook_time_minutes,cover_image_path,' +
        'recipe_ingredients(sort_order,quantity,unit,quantity_basis,preparation_note,is_optional,ingredient:ingredients(id,name)),' +
        'recipe_steps(step_number,instruction,duration_seconds,timer_enabled)',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) fail(error, 'Không tải được công thức.');
  if (!data) return null;
  const r = data as unknown as Record<string, unknown>;
  const ings = ((r.recipe_ingredients ?? []) as Record<string, unknown>[]).sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
  const steps = ((r.recipe_steps ?? []) as Record<string, unknown>[]).sort((a, b) => Number(a.step_number) - Number(b.step_number));
  return {
    id: String(r.id),
    status: r.status as RecipeStatus,
    form: {
      slug: str(r.slug), name: str(r.name), description: str(r.description), categoryId: str(r.category_id),
      difficulty: str(r.difficulty), defaultServings: str(r.default_servings), servingBasis: str(r.serving_basis),
      servingNote: str(r.serving_note), prepMinutes: str(r.prep_time_minutes), cookMinutes: str(r.cook_time_minutes),
      coverPath: str(r.cover_image_path),
      ingredients: ings.map((x) => {
        const ing = (Array.isArray(x.ingredient) ? x.ingredient[0] : x.ingredient) as { id?: string; name?: string } | null;
        return {
          ingredientId: ing?.id ?? null, name: ing?.name ?? '', quantity: x.quantity === null ? '' : String(Number(x.quantity)),
          unit: str(x.unit), basis: x.quantity_basis as QuantityBasis, preparationNote: str(x.preparation_note), isOptional: !!x.is_optional,
        };
      }),
      steps: steps.map((s) => ({
        instruction: str(s.instruction),
        durationMinutes: s.duration_seconds ? String(Number(s.duration_seconds) / 60) : '',
        timerEnabled: !!s.timer_enabled,
      })),
    },
  };
}

const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

/** Checks the browser can do before a round trip; the database re-checks everything. */
export function validateForm(form: RecipeForm): Record<string, string> {
  const e: Record<string, string> = {};
  if (!form.name.trim()) e.name = 'Nhập tên món.';
  if (!/^[a-z0-9-]+$/.test(form.slug)) e.slug = 'Slug chỉ gồm chữ thường không dấu, số và dấu gạch ngang.';
  for (const [k, v] of [['defaultServings', form.defaultServings], ['prepMinutes', form.prepMinutes], ['cookMinutes', form.cookMinutes]] as const) {
    const n = num(v);
    if (n !== null && (!Number.isInteger(n) || n < (k === 'defaultServings' ? 1 : 0))) e[k] = 'Nhập số nguyên hợp lệ hoặc để trống.';
  }
  form.ingredients.forEach((i, idx) => {
    if (!i.name.trim()) e[`ingredients.${idx}`] = 'Chọn hoặc nhập tên nguyên liệu.';
    else if (i.basis !== 'to_taste' && !(Number(num(i.quantity)) > 0)) e[`ingredients.${idx}`] = 'Số lượng phải lớn hơn 0.';
  });
  form.steps.forEach((s, idx) => {
    if (!s.instruction.trim()) e[`steps.${idx}`] = 'Nhập nội dung bước.';
    else if (s.timerEnabled && !(Number(num(s.durationMinutes)) > 0)) e[`steps.${idx}`] = 'Bước có hẹn giờ cần thời lượng.';
  });
  return e;
}

/** Uploads a new cover; returns its storage path. */
export async function uploadCover(client: AdminClient, slug: string, file: File): Promise<string> {
  const ext = COVER_TYPES[file.type];
  if (!ext) throw new RecipeSaveError('Ảnh bìa phải là WebP, JPEG hoặc PNG.');
  if (file.size > 5 * 1024 * 1024) throw new RecipeSaveError('Ảnh bìa tối đa 5 MB.');
  if (!/^[a-z0-9-]+$/.test(slug)) throw new RecipeSaveError('Nhập slug hợp lệ trước khi tải ảnh.');
  const path = `${slug}/cover-${Date.now()}.${ext}`;
  const { error } = await client.storage.from(COVER_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) fail(error, 'Không tải ảnh lên được.');
  return path;
}

export const removeCover = (client: AdminClient, path: string) =>
  client.storage.from(COVER_BUCKET).remove([path]).then(({ error }) => !error, () => false);

export const coverUrl = (client: AdminClient, path: string) =>
  path.startsWith('https://') ? path : client.storage.from(COVER_BUCKET).getPublicUrl(path).data.publicUrl;

export async function saveRecipe(
  client: AdminClient,
  id: string | null,
  form: RecipeForm,
  ingredientsByName: Map<string, string>,
): Promise<string> {
  // New ingredient names are created first (create_ingredient returns the existing id for a known name).
  const lines = await Promise.all(
    form.ingredients.map(async (i) => {
      let ingredientId = i.ingredientId ?? ingredientsByName.get(i.name.trim().toLowerCase()) ?? null;
      if (!ingredientId) {
        const { data, error } = await client.rpc('create_ingredient', { p_name: i.name.trim() });
        if (error) fail(error, `Không tạo được nguyên liệu "${i.name.trim()}".`);
        ingredientId = String(data);
      }
      return {
        ingredient_id: ingredientId,
        quantity: i.basis === 'to_taste' ? null : num(i.quantity),
        unit: i.basis === 'to_taste' ? null : i.unit.trim() || null,
        quantity_basis: i.basis,
        preparation_note: i.preparationNote.trim() || null,
        is_optional: i.isOptional,
      };
    }),
  );
  const steps = form.steps.map((s) => {
    const minutes = num(s.durationMinutes);
    return {
      instruction: s.instruction.trim(),
      duration_seconds: minutes ? Math.round(minutes * 60) : null,
      timer_enabled: s.timerEnabled,
    };
  });
  const recipe = {
    slug: form.slug.trim(), name: form.name.trim(), description: form.description, category_id: form.categoryId || null,
    difficulty: form.difficulty || null, default_servings: num(form.defaultServings), serving_basis: form.servingBasis || null,
    serving_note: form.servingNote, prep_time_minutes: num(form.prepMinutes), cook_time_minutes: num(form.cookMinutes),
    cover_image_path: form.coverPath || null,
  };
  const { data, error } = await client.rpc('save_recipe', { p_id: id, p_recipe: recipe, p_ingredients: lines, p_steps: steps });
  if (error) fail(error, 'Không lưu được công thức.');
  return String(data);
}

export async function moveRecipe(client: AdminClient, id: string, to: RecipeStatus, reason: string) {
  const { error } = await client.rpc('transition_recipe_status', { p_id: id, p_to: to, p_reason: reason });
  if (error) fail(error, 'Không đổi được trạng thái.');
}

export async function deleteRecipe(client: AdminClient, id: string, slug: string, reason: string) {
  const { error } = await client.rpc('delete_recipe', { p_id: id, p_confirm_slug: slug, p_reason: reason });
  if (error) fail(error, 'Không xóa được công thức.');
}
