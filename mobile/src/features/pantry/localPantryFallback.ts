// Local AsyncStorage fallback for pantry operations when the remote Supabase
// project has not yet applied the 20261124155148_user_pantry migration.
// Never masks network or authorization errors.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { asDifficulty, asNumber, asText, fail, one } from '@/features/recipes/recipeApi';
import type { YoChefClient } from '@/lib/supabase';

import {
  classifyIngredientGroup,
  convertPantryQty,
  type DeductPantryInput,
  type PantryEntryInput,
  type PantryItem,
  type PantryMatchRecipe,
} from './pantryApi';

const KEY_PREFIX = '@yochef/pantry-fallback/';
const storageKey = (userId: string) => `${KEY_PREFIX}${userId}`;

type StoredItem = {
  id: string;
  ingredientId: string;
  name: string;
  commonUnits: string[];
  quantity: number;
  unit: string;
  updatedAt: string;
};

export function isMissingBackendFeature(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const code = error.code ?? '';
  if (code === 'PGRST205' || code === 'PGRST202' || code === '42P01' || code === '42883') return true;
  const msg = error.message ?? '';
  return /schema cache|does not exist|could not find the (table|function)/i.test(msg);
}

async function readStore(userId: string): Promise<StoredItem[]> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredItem[]) : [];
  } catch {
    return [];
  }
}

async function writeStore(userId: string, rows: StoredItem[]): Promise<void> {
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(rows));
}

export async function localFetchPantry(userId: string): Promise<PantryItem[]> {
  const rows = await readStore(userId);
  return rows
    .filter((r) => r.quantity > 0)
    .sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1))
    .map((r) => ({
      ...r,
      group: classifyIngredientGroup(r.name),
    }));
}

export async function localAddOrMergePantryItems(
  client: YoChefClient,
  userId: string,
  items: PantryEntryInput[],
  shoppingItemIds?: string[],
): Promise<void> {
  const ids = Array.from(new Set(items.map((i) => i.ingredientId)));
  const { data: ingData } = await client
    .from('ingredients')
    .select('id,name,common_units')
    .in('id', ids);

  const ingMap = new Map<string, { name: string; commonUnits: string[] }>();
  for (const row of (ingData ?? []) as unknown as Record<string, unknown>[]) {
    ingMap.set(String(row.id), {
      name: String(row.name ?? 'Nguyên liệu'),
      commonUnits: Array.isArray(row.common_units) ? row.common_units.map(String) : [],
    });
  }

  const rows = await readStore(userId);
  const now = new Date().toISOString();

  for (const entry of items) {
    const unit = entry.unit.trim();
    if (!(entry.quantity > 0) || !unit) continue;
    const existing = rows.find((r) => r.ingredientId === entry.ingredientId);
    const meta = ingMap.get(entry.ingredientId);

    if (!existing) {
      rows.push({
        id: `local-${entry.ingredientId}`,
        ingredientId: entry.ingredientId,
        name: meta?.name ?? 'Nguyên liệu',
        commonUnits: meta?.commonUnits ?? [],
        quantity: Math.round(entry.quantity * 10000) / 10000,
        unit,
        updatedAt: now,
      });
    } else {
      const converted = convertPantryQty(entry.quantity, unit, existing.unit);
      if (converted !== null) {
        existing.quantity = Math.round((existing.quantity + converted) * 10000) / 10000;
      } else {
        existing.quantity = Math.round(entry.quantity * 10000) / 10000;
        existing.unit = unit;
      }
      if (meta) {
        existing.name = meta.name;
        existing.commonUnits = meta.commonUnits;
      }
      existing.updatedAt = now;
    }
  }

  await writeStore(userId, rows);

  if (shoppingItemIds && shoppingItemIds.length > 0) {
    const { error } = await client.from('shopping_list_items').delete().in('id', shoppingItemIds);
    if (error) fail(error, 'Đã cất vào tủ nhưng không dọn được danh sách đi chợ.');
  }
}

export async function localUpdatePantryItem(
  userId: string,
  pantryId: string,
  patch: { quantity: number; unit: string },
): Promise<void> {
  const rows = await readStore(userId);
  const target = rows.find((r) => r.id === pantryId);
  if (!target) throw new Error('Không tìm thấy nguyên liệu trong tủ.');
  target.quantity = Math.round(patch.quantity * 10000) / 10000;
  target.unit = patch.unit.trim();
  target.updatedAt = new Date().toISOString();
  await writeStore(userId, rows);
}

export async function localRemovePantryItem(userId: string, pantryId: string): Promise<void> {
  const rows = await readStore(userId);
  await writeStore(
    userId,
    rows.filter((r) => r.id !== pantryId),
  );
}

export async function localDeductPantryIngredients(userId: string, items: DeductPantryInput[]): Promise<void> {
  const rows = await readStore(userId);
  const now = new Date().toISOString();

  for (const d of items) {
    if (!(d.quantity > 0)) continue;
    const idx = rows.findIndex((r) => r.ingredientId === d.ingredientId);
    if (idx < 0) continue;
    const target = rows[idx];
    const deductAmt = d.unit ? convertPantryQty(d.quantity, d.unit, target.unit) : d.quantity;
    if (deductAmt !== null && deductAmt > 0) {
      if (target.quantity <= deductAmt) {
        rows.splice(idx, 1);
      } else {
        target.quantity = Math.round((target.quantity - deductAmt) * 10000) / 10000;
        target.updatedAt = now;
      }
    }
  }

  await writeStore(userId, rows);
}

export async function localMatchRecipesFromPantry(
  client: YoChefClient,
  userId: string,
  page: { limit?: number; offset?: number } = {},
): Promise<{ items: PantryMatchRecipe[]; total: number }> {
  const pantry = await readStore(userId);
  if (pantry.length === 0) return { items: [], total: 0 };

  const owned = new Set(pantry.filter((p) => p.quantity > 0).map((p) => p.ingredientId));
  const { data, error } = await client
    .from('recipes')
    .select(
      'id,slug,name,description,difficulty,default_servings,prep_time_minutes,cook_time_minutes,cover_image_path,' +
        'category:categories(slug,name),recipe_ingredients(ingredient_id,is_optional)',
    )
    .eq('status', 'published');

  if (error) fail(error, 'Không gợi ý được món ăn từ tủ lạnh.');

  const scored: PantryMatchRecipe[] = [];
  for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
    const ings = Array.isArray(r.recipe_ingredients) ? (r.recipe_ingredients as Record<string, unknown>[]) : [];
    const requiredIds = new Set<string>();
    const allIds = new Set<string>();
    for (const ri of ings) {
      const iid = asText(ri.ingredient_id) ?? asText(one(ri.ingredient)?.id);
      if (!iid) continue;
      allIds.add(iid);
      if (ri.is_optional !== true) requiredIds.add(iid);
    }
    const pool = requiredIds.size > 0 ? requiredIds : allIds;
    if (pool.size === 0) continue;

    let matched = 0;
    for (const iid of pool) {
      if (owned.has(iid)) matched += 1;
    }
    if (matched === 0) continue;

    const cat = one(r.category);
    scored.push({
      recipe: {
        id: String(r.id),
        slug: String(r.slug),
        name: String(r.name),
        description: asText(r.description),
        categorySlug: asText(cat?.slug),
        categoryName: asText(cat?.name),
        difficulty: asDifficulty(r.difficulty),
        defaultServings: asNumber(r.default_servings),
        prepTimeMinutes: asNumber(r.prep_time_minutes),
        cookTimeMinutes: asNumber(r.cook_time_minutes),
        coverImagePath: asText(r.cover_image_path),
      },
      matchedCount: matched,
      requiredCount: pool.size,
      missingCount: Math.max(0, pool.size - matched),
    });
  }

  scored.sort(
    (a, b) =>
      (a.missingCount === 0 ? -1 : 1) - (b.missingCount === 0 ? -1 : 1) ||
      b.matchedCount / b.requiredCount - a.matchedCount / a.requiredCount ||
      a.missingCount - b.missingCount ||
      a.recipe.name.localeCompare(b.recipe.name, 'vi'),
  );

  const offset = Math.max(0, page.offset ?? 0);
  const limit = Math.min(100, Math.max(1, page.limit ?? 20));
  return {
    items: scored.slice(offset, offset + limit),
    total: scored.length,
  };
}
