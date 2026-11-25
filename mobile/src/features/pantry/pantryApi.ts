// Pantry (My Fridge) data access & domain logic.
// Strictly uses canonical catalog ingredients (ingredients table) and unit rules
// aligned with public.convert_pantry_qty in 20261124155148_user_pantry.sql.
import {
  asDifficulty,
  asNumber,
  asText,
  fail,
  one,
} from "@/features/recipes/recipeApi";
import { shownQuantity } from "@/features/recipes/servings";
import type {
  IngredientLine,
  RecipeDetail,
  RecipeSummary,
} from "@/features/recipes/types";
import type { YoChefClient } from "@/lib/supabase";

export type PantryGroup =
  | "meat_seafood"
  | "vegetables"
  | "spices"
  | "dry_other";

export const PANTRY_GROUP_ORDER: PantryGroup[] = [
  "meat_seafood",
  "vegetables",
  "spices",
  "dry_other",
];

export const PANTRY_GROUP_LABEL: Record<PantryGroup, string> = {
  meat_seafood: "Thịt, cá & Trứng",
  vegetables: "Rau củ quả",
  spices: "Gia vị & Nước chấm",
  dry_other: "Đồ khô & Khác",
};

export const FALLBACK_COMMON_UNITS = [
  "g",
  "kg",
  "ml",
  "lít",
  "quả",
  "củ",
  "gói",
  "phần",
] as const;

export type CatalogIngredient = {
  id: string;
  name: string;
  slug: string;
  aliases: string[];
  commonUnits: string[];
};

export type PantryItem = {
  id: string;
  ingredientId: string;
  name: string;
  commonUnits: string[];
  quantity: number;
  unit: string;
  group: PantryGroup;
  updatedAt: string;
};

export type PantryMatchRecipe = {
  recipe: RecipeSummary;
  matchedCount: number;
  requiredCount: number;
  missingCount: number;
};

export type IngredientAvailabilityStatus =
  | "available"
  | "insufficient"
  | "missing"
  | "optional";

export type IngredientAvailability = {
  line: IngredientLine;
  status: IngredientAvailabilityStatus;
  neededQty: number | null;
  pantryItem: PantryItem | null;
};

export function foldVi(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim();
}

const MEAT_KEYWORDS = [
  "thit",
  "bo ",
  "lon ",
  "heo",
  "ga ",
  "vit",
  "ngan",
  "ngong",
  "de ",
  "cuu",
  "suon",
  "ba chi",
  "ca loc",
  "ca thu",
  "ca hoi",
  "ca chep",
  "ca ro",
  "ca tre",
  "ca basa",
  "ca ngu",
  "ca nuc",
  "ca moi",
  "ca phe",
  "tom",
  "cua",
  "ghe",
  "muc",
  "bach tuoc",
  "ngao",
  "so ",
  "oc ",
  "trai",
  "trung",
  "gio ",
  "cha ",
  "xuc xich",
  "lap xuong",
  "pate",
  "gan ",
  "tim ",
  "cat ",
  "luon",
  "ech",
];

const SPICE_KEYWORDS = [
  "muoi",
  "duong",
  "nuoc mam",
  "mam ",
  "hat nem",
  "bot ngot",
  "mi chinh",
  "tieu",
  "xi dau",
  "nuoc tuong",
  "tuong ot",
  "tuong ca",
  "tuong ban",
  "dau an",
  "dau hao",
  "dau me",
  "giam",
  "sa te",
  "ngu vi huong",
  "bot nghe",
  "bot ot",
  "ot bot",
  "bot cari",
  "ca ri",
  "hoa hoi",
  "thao qua",
  "que ",
  "dinh huong",
  "ruou nau",
  "mat ong",
  "nuoc hang",
  "nuoc mau",
  "chao ",
  "mam tom",
];

const VEG_KEYWORDS = [
  "rau",
  "cai",
  "ca chua",
  "ca rot",
  "ca tim",
  "ca phao",
  "hanh",
  "toi",
  "ot",
  "gung",
  "rieng",
  "nghe",
  "sa ",
  "chanh",
  "tac ",
  "quat",
  "khoai",
  "bi ",
  "bau",
  "muop",
  "dua",
  "su hao",
  "su su",
  "mang",
  "nam ",
  "gia do",
  "do ",
  "dau bap",
  "dau co ve",
  "dau ha lan",
  "ngo ",
  "bap ",
  "xa lach",
  "hung ",
  "mui ",
  "tia to",
  "kinh gioi",
  "la lot",
  "la chanh",
  "me chua",
  "khe",
  "chuoi",
  "thom",
  "xoai",
  "oi ",
  "tao",
  "cam ",
  "buoi",
];

export function classifyIngredientGroup(name: string): PantryGroup {
  const f = ` ${foldVi(name)} `;
  if (SPICE_KEYWORDS.some((kw) => f.includes(kw))) return "spices";
  if (VEG_KEYWORDS.some((kw) => f.includes(kw))) return "vegetables";
  if (MEAT_KEYWORDS.some((kw) => f.includes(kw))) return "meat_seafood";
  return "dry_other";
}

export function availableUnitsFor(commonUnits: string[]): string[] {
  const cleaned = commonUnits.map((u) => u.trim()).filter(Boolean);
  const unique = Array.from(new Set(cleaned));
  return unique.length > 0 ? unique : [...FALLBACK_COMMON_UNITS];
}

const UNIT_FACTORS: Record<string, { group: "mass" | "vol"; factor: number }> =
  {
    g: { group: "mass", factor: 1 },
    gam: { group: "mass", factor: 1 },
    lạng: { group: "mass", factor: 100 },
    kg: { group: "mass", factor: 1000 },
    ml: { group: "vol", factor: 1 },
    l: { group: "vol", factor: 1000 },
    lít: { group: "vol", factor: 1000 },
    lit: { group: "vol", factor: 1000 },
    "muỗng cà phê": { group: "vol", factor: 5 },
    "thìa cà phê": { group: "vol", factor: 5 },
    "muỗng canh": { group: "vol", factor: 15 },
    "thìa canh": { group: "vol", factor: 15 },
  };

export function convertPantryQty(
  qty: number,
  fromUnit: string | null,
  toUnit: string | null,
): number | null {
  if (!Number.isFinite(qty) || qty <= 0) return null;
  const f = (fromUnit ?? "").trim().toLowerCase();
  const t = (toUnit ?? "").trim().toLowerCase();
  if (!f || !t) return null;
  if (f === t) return qty;
  const fromDef = UNIT_FACTORS[f];
  const toDef = UNIT_FACTORS[t];
  if (!fromDef || !toDef || fromDef.group !== toDef.group) return null;
  return Math.round(((qty * fromDef.factor) / toDef.factor) * 10000) / 10000;
}

function toCatalogIngredient(r: Record<string, unknown>): CatalogIngredient {
  const aliases = Array.isArray(r.aliases) ? r.aliases.map(String) : [];
  const commonUnits = Array.isArray(r.common_units)
    ? r.common_units.map(String)
    : [];
  return {
    id: String(r.id),
    name: String(r.name),
    slug: String(r.slug ?? ""),
    aliases,
    commonUnits,
  };
}

function toPantryItem(r: Record<string, unknown>): PantryItem | null {
  const ing = one(r.ingredient);
  const ingId = asText(r.ingredient_id) ?? asText(ing?.id);
  const name = asText(ing?.name);
  const qty = asNumber(r.quantity);
  const unit = asText(r.unit);
  if (!ingId || !name || qty === null || qty <= 0 || !unit) return null;
  const rawUnits = Array.isArray(ing?.common_units)
    ? (ing.common_units as unknown[]).map(String)
    : [];
  return {
    id: String(r.id),
    ingredientId: ingId,
    name,
    commonUnits: rawUnits,
    quantity: qty,
    unit,
    group: classifyIngredientGroup(name),
    updatedAt: String(r.updated_at ?? r.created_at ?? ""),
  };
}

export async function fetchCatalogIngredients(
  client: YoChefClient,
): Promise<CatalogIngredient[]> {
  const { data, error } = await client
    .from("ingredients")
    .select("id,name,slug,aliases,common_units")
    .order("name", { ascending: true });
  if (error) fail(error, "Không tải được danh mục nguyên liệu.");
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(
    toCatalogIngredient,
  );
}

export async function fetchPantry(
  client: YoChefClient,
  userId: string,
): Promise<PantryItem[]> {
  const { data, error } = await client
    .from("user_pantry")
    .select(
      "id,ingredient_id,quantity,unit,updated_at,created_at,ingredient:ingredients(id,name,common_units)",
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) fail(error, "Không tải được tủ lạnh.");
  return ((data ?? []) as unknown as Record<string, unknown>[])
    .map(toPantryItem)
    .filter((x): x is PantryItem => x !== null);
}

export type PantryEntryInput = {
  ingredientId: string;
  quantity: number;
  unit: string;
};

export async function addOrMergePantryItems(
  client: YoChefClient,
  items: PantryEntryInput[],
  shoppingItemIds?: string[],
): Promise<void> {
  if (items.length === 0) return;
  const payload = items.map((i) => ({
    ingredient_id: i.ingredientId,
    quantity: i.quantity,
    unit: i.unit.trim(),
  }));
  const { error } = await client.rpc("add_or_merge_pantry_items", {
    p_items: payload,
    p_shopping_item_ids:
      shoppingItemIds && shoppingItemIds.length > 0 ? shoppingItemIds : null,
  });
  if (error) fail(error, "Không cập nhật được tủ lạnh.");
}

export async function updatePantryItem(
  client: YoChefClient,
  pantryId: string,
  patch: { quantity: number; unit: string },
): Promise<void> {
  const { data, error } = await client
    .from("user_pantry")
    .update({ quantity: patch.quantity, unit: patch.unit.trim() })
    .eq("id", pantryId)
    .select("id");
  if (error) fail(error, "Không cập nhật được nguyên liệu trong tủ.");
  if (!data || data.length !== 1)
    fail(null, "Không cập nhật được nguyên liệu trong tủ.");
}

export async function removePantryItem(
  client: YoChefClient,
  pantryId: string,
): Promise<void> {
  const { error } = await client
    .from("user_pantry")
    .delete()
    .eq("id", pantryId);
  if (error) fail(error, "Không xóa được nguyên liệu khỏi tủ.");
}

export type DeductPantryInput = {
  ingredientId: string;
  quantity: number;
  unit: string | null;
};

export async function deductPantryIngredients(
  client: YoChefClient,
  items: DeductPantryInput[],
): Promise<void> {
  if (items.length === 0) return;
  const payload = items
    .filter((i) => i.quantity > 0)
    .map((i) => ({
      ingredient_id: i.ingredientId,
      quantity: i.quantity,
      unit: i.unit,
    }));
  if (payload.length === 0) return;
  const { error } = await client.rpc("deduct_pantry_ingredients", {
    p_items: payload,
  });
  if (error) fail(error, "Không trừ được nguyên liệu trong tủ lạnh.");
}

export async function matchRecipesFromPantry(
  client: YoChefClient,
  page: { limit?: number; offset?: number } = {},
): Promise<{ items: PantryMatchRecipe[]; total: number }> {
  const { data, error } = await client.rpc("match_recipes_from_pantry", {
    p_limit: page.limit ?? 20,
    p_offset: page.offset ?? 0,
  });
  if (error) fail(error, "Không gợi ý được món ăn từ tủ lạnh.");
  const rows = (data ?? []) as Record<string, unknown>[];
  const total =
    rows.length > 0 ? (asNumber(rows[0].total_count) ?? rows.length) : 0;
  const items: PantryMatchRecipe[] = rows.map((row) => ({
    recipe: {
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
    },
    matchedCount: asNumber(row.matched_count) ?? 0,
    requiredCount: asNumber(row.required_count) ?? 0,
    missingCount: asNumber(row.missing_count) ?? 0,
  }));
  return { items, total };
}

/** Compares recipe ingredients (scaled to `servings`) against the user's pantry. */
export function checkRecipeAvailability(
  recipe: RecipeDetail,
  servings: number,
  pantry: PantryItem[],
): {
  lines: IngredientAvailability[];
  missingOrInsufficient: IngredientAvailability[];
} {
  const byIng = new Map<string, PantryItem>();
  for (const item of pantry) byIng.set(item.ingredientId, item);

  const lines: IngredientAvailability[] = recipe.ingredients.map((line) => {
    const neededQty = shownQuantity(
      line.quantity,
      line.basis,
      recipe.defaultServings,
      servings,
    );
    const pantryItem = line.ingredientId
      ? (byIng.get(line.ingredientId) ?? null)
      : null;

    if (!pantryItem) {
      return {
        line,
        status: line.isOptional ? "optional" : "missing",
        neededQty,
        pantryItem: null,
      };
    }

    if (neededQty === null) {
      return { line, status: "available", neededQty: null, pantryItem };
    }

    const neededInPantry = convertPantryQty(
      neededQty,
      line.unit,
      pantryItem.unit,
    );
    if (
      neededInPantry !== null &&
      pantryItem.quantity + 1e-6 < neededInPantry
    ) {
      return { line, status: "insufficient", neededQty, pantryItem };
    }

    return { line, status: "available", neededQty, pantryItem };
  });

  const missingOrInsufficient = lines.filter(
    (x) => x.status === "missing" || x.status === "insufficient",
  );
  return { lines, missingOrInsufficient };
}
