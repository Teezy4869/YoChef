// Nutrition admin data (4.3): USDA lookups through the nutrition-search Edge Function,
// mappings and unit conversions through editor RPCs, recipe results calculated and
// verified on the server (engine 2.0.0). Nothing becomes official before verification.
import { errorMessage, type AdminClient } from './supabase';

export const NUTRIENTS = [
  ['energy_kcal', 'Năng lượng', 'kcal'],
  ['protein_g', 'Đạm', 'g'],
  ['fat_g', 'Béo', 'g'],
  ['carbs_g', 'Bột đường', 'g'],
  ['sodium_mg', 'Natri', 'mg'],
  ['saturated_fat_g', 'Béo bão hòa', 'g'],
  ['fiber_g', 'Chất xơ', 'g'],
  ['sugar_g', 'Đường', 'g'],
] as const;
export type NutrientKey = (typeof NUTRIENTS)[number][0];
export type Values = Record<NutrientKey, number | null>;

export type CanonicalFood = {
  provider: 'usda';
  externalId: string;
  description: string;
  dataType: string | null;
  basis: 'per_100g' | null;
  sourceVersion: string | null;
  retrievedAt: string;
  nutrients: Record<string, number | null>;
};
export type Mapping = { status: string; description: string | null; externalId: string | null; values: Values } | null;
export type IngredientRow = { id: string; name: string; mapping: Mapping };
export type Conversion = {
  id: string; ingredientId: string | null; ingredientName: string | null; unit: string; grams: number;
  source: string | null; method: string | null; verified: boolean;
};
export type RecipeResult = {
  status: string; totals: Values; per_serving: Values | null; completeness: number; reason_codes: string[];
  breakdown: { ingredient_id: string; name: string; grams: number | null; reasons: string[] }[];
};

export const STATUS_LABEL: Record<string, string> = {
  UNMAPPED: 'Chưa gắn', CANDIDATE: 'Ứng viên', NEEDS_REVIEW: 'Cần xem lại', VERIFIED: 'Đã xác minh', UNAVAILABLE: 'Không có dữ liệu',
  NOT_CALCULATED: 'Chưa tính được', INCOMPLETE: 'Thiếu dữ liệu', CALCULATED: 'Đã tính, chờ xác minh', STALE: 'Cần tính lại',
};
export const REASON_LABEL: Record<string, string> = {
  missing_quantity: 'thiếu số lượng (ví dụ "vừa ăn")', invalid_quantity: 'số lượng không hợp lệ', missing_unit: 'thiếu đơn vị',
  unverified_conversion: 'quy đổi đơn vị chưa xác minh', no_verified_conversion: 'chưa có quy đổi đơn vị sang gam',
  unmapped_nutrition: 'chưa gắn dữ liệu dinh dưỡng', unverified_mapping: 'dữ liệu dinh dưỡng chưa xác minh',
  unavailable_nutrition: 'không có dữ liệu dinh dưỡng', missing_nutrient: 'thiếu chất bắt buộc', invalid_servings: 'khẩu phần không hợp lệ',
};
const EDGE_MESSAGES: Record<string, string> = {
  unauthorized: 'Phiên đăng nhập đã hết. Đăng nhập lại.', forbidden: 'Chỉ biên tập viên được tra cứu dinh dưỡng.',
  invalid_input: 'Từ khóa không hợp lệ (tối đa 100 ký tự).', not_found: 'USDA không có thực phẩm này.',
  quota_exceeded: 'USDA đang giới hạn lượt gọi. Thử lại sau ít phút.', provider_timeout: 'USDA không phản hồi kịp. Thử lại.',
  config_error: 'Máy chủ chưa cấu hình khóa USDA.', provider_error: 'USDA đang lỗi. Thử lại sau.',
  malformed_provider_response: 'USDA trả dữ liệu không đọc được.',
};

function fail(error: { message?: string; code?: string } | null, fallback: string): never {
  if (error?.code === '22023' && error.message) throw new Error(translate(error.message));
  throw new Error(errorMessage(error, fallback));
}
const translate = (m: string) =>
  /calculate the nutrition first/.test(m) ? 'Hãy tính dinh dưỡng trước.'
  : /only a CALCULATED result/.test(m) ? 'Chỉ xác minh được kết quả "Đã tính, chờ xác minh".'
  : /no longer matches/.test(m) ? 'Dữ liệu đầu vào đã đổi. Tính lại rồi xác minh.'
  : /per-100 g basis/.test(m) ? 'Chỉ xác minh được thực phẩm USDA có giá trị trên 100 g.'
  : /source and a method/.test(m) ? 'Cần ghi nguồn và cách đo trước khi xác minh.'
  : 'Dữ liệu không hợp lệ.';

const NUT_COLS = NUTRIENTS.map(([k]) => k).join(',');
const toValues = (r: Record<string, unknown> | null | undefined): Values =>
  Object.fromEntries(NUTRIENTS.map(([k]) => [k, r?.[k] === null || r?.[k] === undefined ? null : Number(r[k])])) as Values;
const one = (v: unknown) => (Array.isArray(v) ? v[0] : v) as Record<string, unknown> | null | undefined;

export async function listIngredients(client: AdminClient, search: string): Promise<IngredientRow[]> {
  let q = client.from('ingredients').select(`id,name,nutrition:ingredient_nutrition(mapping_status,description,external_id,${NUT_COLS})`);
  if (search.trim()) q = q.ilike('name', `%${search.trim().replace(/[%_]/g, '')}%`);
  const { data, error } = await q.order('name', { ascending: true }).range(0, 99);
  if (error) fail(error, 'Không tải được nguyên liệu.');
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    const n = one(r.nutrition);
    return {
      id: String(r.id),
      name: String(r.name),
      mapping: n ? { status: String(n.mapping_status), description: (n.description as string) ?? null, externalId: (n.external_id as string) ?? null, values: toValues(n) } : null,
    };
  });
}

export async function searchUsda(client: AdminClient, query: string): Promise<CanonicalFood[]> {
  const { data, error } = await client.functions.invoke('nutrition-search', { body: { action: 'search_usda', query } });
  if (error) {
    let code = '';
    try {
      code = (await (error as { context?: Response }).context?.json())?.error?.code ?? '';
    } catch {
      code = '';
    }
    throw new Error(EDGE_MESSAGES[code] ?? 'Không gọi được dịch vụ tra cứu dinh dưỡng.');
  }
  const items = (data as { items?: unknown })?.items;
  if (!Array.isArray(items)) throw new Error('Dịch vụ tra cứu trả dữ liệu không đúng hợp đồng.');
  return items as CanonicalFood[];
}

export async function saveMapping(client: AdminClient, ingredientId: string, food: CanonicalFood | null, status: 'CANDIDATE' | 'UNAVAILABLE') {
  const { error } = await client.rpc('save_ingredient_nutrition', { p_ingredient_id: ingredientId, p_food: food, p_status: status });
  if (error) fail(error, 'Không lưu được dữ liệu dinh dưỡng.');
}
export async function verifyMapping(client: AdminClient, ingredientId: string) {
  const { error } = await client.rpc('verify_ingredient_nutrition', { p_ingredient_id: ingredientId });
  if (error) fail(error, 'Không xác minh được.');
}

export async function listConversions(client: AdminClient): Promise<Conversion[]> {
  const { data, error } = await client
    .from('nutrition_unit_conversions')
    .select('id,ingredient_id,unit,grams_per_unit,source,method,verified_at,ingredient:ingredients(name)')
    .order('unit', { ascending: true });
  if (error) fail(error, 'Không tải được bảng quy đổi.');
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    id: String(r.id), ingredientId: (r.ingredient_id as string) ?? null, ingredientName: (one(r.ingredient)?.name as string) ?? null,
    unit: String(r.unit), grams: Number(r.grams_per_unit), source: (r.source as string) ?? null, method: (r.method as string) ?? null,
    verified: r.verified_at !== null && r.verified_at !== undefined,
  }));
}
export async function saveConversion(client: AdminClient, c: { ingredientId: string | null; unit: string; grams: number; source: string; method: string }) {
  if (!c.unit.trim()) throw new Error('Nhập đơn vị.');
  if (!(c.grams > 0)) throw new Error('Số gam phải lớn hơn 0.');
  const { error } = await client.rpc('save_unit_conversion', {
    p_ingredient_id: c.ingredientId, p_unit: c.unit, p_grams: c.grams, p_source: c.source, p_method: c.method,
  });
  if (error) fail(error, 'Không lưu được quy đổi.');
}
export async function verifyConversion(client: AdminClient, id: string) {
  const { error } = await client.rpc('verify_unit_conversion', { p_id: id });
  if (error) fail(error, 'Không xác minh được quy đổi.');
}

export async function findRecipes(client: AdminClient, search: string) {
  const { data, error } = await client
    .from('recipes')
    .select('id,name,status,nutrition:recipe_nutrition(status)')
    .ilike('name', `%${search.trim().replace(/[%_]/g, '')}%`)
    .order('name', { ascending: true })
    .range(0, 19);
  if (error) fail(error, 'Không tìm được công thức.');
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    id: String(r.id), name: String(r.name), status: String(r.status), nutrition: (one(r.nutrition)?.status as string) ?? null,
  }));
}
export async function calculate(client: AdminClient, recipeId: string): Promise<RecipeResult> {
  const { data, error } = await client.rpc('calculate_recipe_nutrition', { p_recipe_id: recipeId });
  if (error) fail(error, 'Không tính được dinh dưỡng.');
  const r = data as RecipeResult;
  return { ...r, totals: toValues(r.totals), per_serving: r.per_serving ? toValues(r.per_serving) : null };
}
export async function verifyRecipe(client: AdminClient, recipeId: string) {
  const { error } = await client.rpc('verify_recipe_nutrition', { p_recipe_id: recipeId });
  if (error) fail(error, 'Không xác minh được dinh dưỡng.');
}

/** "—" for unknown, never 0 (C5). */
export const show = (v: number | null | undefined, unit: string) => (v === null || v === undefined ? '—' : `${String(v).replace('.', ',')} ${unit}`);
