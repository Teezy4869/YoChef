// Shopping list (Phase 3.2, migration 20261114041322_phase3_shopping_lists).
// One default list per user: the oldest one, created on first use. Exports from
// a recipe append rows and never merge them (spec 12 §2): the same ingredient may
// come with different units or notes.
import { joinMeta } from "@/features/recipes/format";
import { asNumber, asText, fail } from "@/features/recipes/recipeApi";
import { shownQuantity } from "@/features/recipes/servings";
import type { RecipeDetail } from "@/features/recipes/types";
import type { YoChefClient } from "@/lib/supabase";

export const LABEL_MAX = 100;
export const UNIT_MAX = 50;
const NOTE_MAX = 200;

export type ShoppingItem = {
  id: string;
  ingredientId: string | null;
  label: string;
  /** null: unknown or to taste, never 0. */
  quantity: number | null;
  unit: string | null;
  note: string | null;
  isChecked: boolean;
  sortOrder: number;
};

const ITEM_COLUMNS =
  "id,ingredient_id,label,quantity,unit,note,is_checked,sort_order";

function toItem(r: Record<string, unknown>): ShoppingItem {
  return {
    id: String(r.id),
    ingredientId: asText(r.ingredient_id),
    label: String(r.label),
    quantity: asNumber(r.quantity),
    unit: asText(r.unit),
    note: asText(r.note),
    isChecked: r.is_checked === true,
    sortOrder: asNumber(r.sort_order) ?? 0,
  };
}

/** The user's default list, or null before the first item is ever added. */
export async function findDefaultList(
  client: YoChefClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("shopping_lists")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) fail(error, "Không tải được danh sách đi chợ.");
  const row = (data ?? [])[0] as { id: string } | undefined;
  return row?.id ?? null;
}

async function getOrCreateDefaultList(
  client: YoChefClient,
  userId: string,
): Promise<{ id: string; created: boolean }> {
  const existing = await findDefaultList(client, userId);
  if (existing) return { id: existing, created: false };
  // The name comes from the column default.
  const { data, error } = await client
    .from("shopping_lists")
    .insert({ user_id: userId })
    .select("id");
  const row = (data ?? [])[0] as { id: string } | undefined;
  if (error || !row) fail(error, "Không tạo được danh sách đi chợ.");
  return { id: row.id, created: true };
}

export async function fetchItems(
  client: YoChefClient,
  listId: string,
): Promise<ShoppingItem[]> {
  const { data, error } = await client
    .from("shopping_list_items")
    .select(ITEM_COLUMNS)
    .eq("shopping_list_id", listId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) fail(error, "Không tải được danh sách đi chợ.");
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(toItem);
}

async function nextSortOrder(
  client: YoChefClient,
  listId: string,
): Promise<number> {
  const { data, error } = await client
    .from("shopping_list_items")
    .select("sort_order")
    .eq("shopping_list_id", listId)
    .order("sort_order", { ascending: false })
    .limit(1);
  if (error) fail(error, "Không lưu được món vào danh sách.");
  const last = asNumber(
    ((data ?? [])[0] as { sort_order?: unknown } | undefined)?.sort_order,
  );
  return last === null ? 0 : last + 1;
}

type NewItem = {
  ingredient_id: string | null;
  label: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
};

/** Adds rows in one request (all or nothing); a list created just for them is removed again on failure. */
async function appendItems(
  client: YoChefClient,
  userId: string,
  items: NewItem[],
): Promise<ShoppingItem[]> {
  if (items.length === 0) return [];
  const list = await getOrCreateDefaultList(client, userId);
  try {
    const base = await nextSortOrder(client, list.id);
    const rows = items.map((i, k) => ({
      ...i,
      shopping_list_id: list.id,
      sort_order: base + k,
    }));
    const { data, error } = await client
      .from("shopping_list_items")
      .insert(rows)
      .select(ITEM_COLUMNS);
    if (error) fail(error, "Không lưu được món vào danh sách.");
    return ((data ?? []) as unknown as Record<string, unknown>[]).map(toItem);
  } catch (e) {
    if (list.created)
      await client.from("shopping_lists").delete().eq("id", list.id);
    throw e;
  }
}

export function itemsFromLines(
  lines: RecipeDetail["ingredients"],
  defaultServings: number | null,
  servings: number,
): NewItem[] {
  return lines.map((i) => {
    const note = joinMeta([
      i.preparationNote,
      i.quantityNote,
      i.basis === "to_taste" ? "vừa ăn" : null,
      i.basis === "editor_estimate" ? "lượng ước tính" : null,
      i.isOptional ? "tùy chọn" : null,
    ]);
    return {
      ingredient_id: i.ingredientId,
      label: i.name.slice(0, LABEL_MAX),
      quantity: shownQuantity(i.quantity, i.basis, defaultServings, servings),
      unit: i.unit,
      note: note ? note.slice(0, NOTE_MAX) : null,
    };
  });
}

/** The recipe's ingredients at `servings`, rounded exactly as the recipe page shows them. */
export function itemsFromRecipe(
  recipe: RecipeDetail,
  servings: number,
): NewItem[] {
  return itemsFromLines(recipe.ingredients, recipe.defaultServings, servings);
}

export function addRecipe(
  client: YoChefClient,
  userId: string,
  recipe: RecipeDetail,
  servings: number,
) {
  return appendItems(client, userId, itemsFromRecipe(recipe, servings));
}

export function addIngredientLines(
  client: YoChefClient,
  userId: string,
  lines: RecipeDetail["ingredients"],
  defaultServings: number | null,
  servings: number,
) {
  return appendItems(
    client,
    userId,
    itemsFromLines(lines, defaultServings, servings),
  );
}

export type ManualInput = { label: string; quantity: string; unit: string };
export type ManualErrors = { label?: string; quantity?: string; unit?: string };

/** Validates a typed-in item; blank quantity and unit are NULL (C5). */
export function parseManual(input: ManualInput): {
  item: NewItem | null;
  errors: ManualErrors;
} {
  const errors: ManualErrors = {};
  const label = input.label.trim();
  if (!label) errors.label = "Nhập tên món cần mua.";
  else if (label.length > LABEL_MAX)
    errors.label = `Tên món tối đa ${LABEL_MAX} ký tự.`;
  const q = input.quantity.trim().replace(",", ".");
  const quantity = q === "" ? null : Number(q);
  if (quantity !== null && !(Number.isFinite(quantity) && quantity > 0))
    errors.quantity = "Số lượng phải là số lớn hơn 0.";
  const unit = input.unit.trim();
  if (unit.length > UNIT_MAX) errors.unit = `Đơn vị tối đa ${UNIT_MAX} ký tự.`;
  if (Object.keys(errors).length > 0) return { item: null, errors };
  return {
    item: {
      ingredient_id: null,
      label,
      quantity,
      unit: unit || null,
      note: null,
    },
    errors,
  };
}

export async function addManual(
  client: YoChefClient,
  userId: string,
  item: NewItem,
): Promise<ShoppingItem> {
  const [row] = await appendItems(client, userId, [item]);
  return row;
}

export async function setChecked(
  client: YoChefClient,
  itemId: string,
  checked: boolean,
): Promise<void> {
  const { data, error } = await client
    .from("shopping_list_items")
    .update({ is_checked: checked })
    .eq("id", itemId)
    .select("id");
  if (error || !data || data.length !== 1)
    fail(error, "Không cập nhật được món này.");
}

export async function removeItem(
  client: YoChefClient,
  itemId: string,
): Promise<void> {
  const { error } = await client
    .from("shopping_list_items")
    .delete()
    .eq("id", itemId);
  if (error) fail(error, "Không xóa được món này.");
}

export async function removeChecked(
  client: YoChefClient,
  listId: string,
): Promise<void> {
  const { error } = await client
    .from("shopping_list_items")
    .delete()
    .eq("shopping_list_id", listId)
    .eq("is_checked", true);
  if (error) fail(error, "Không xóa được các món đã mua.");
}
