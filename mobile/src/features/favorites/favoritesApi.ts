// Favorites (Phase 3.1, migration 20261113234830_phase3_favorites). Rows are
// private: RLS returns only the signed-in user's own favorites.
import type { YoChefClient } from "@/lib/supabase";
import {
  asDifficulty,
  asNumber,
  asText,
  fail,
  one,
} from "@/features/recipes/recipeApi";
import type { RecipeSummary } from "@/features/recipes/types";

const FAVORITE_SELECT =
  "created_at,recipe:recipes(id,slug,name,description,difficulty,default_servings,prep_time_minutes,cook_time_minutes," +
  "cover_image_path,category:categories(slug,name))";

/** A favorite whose recipe is no longer published comes back without its recipe: skip it. */
function toSummary(row: Record<string, unknown>): RecipeSummary | null {
  const r = one(row.recipe);
  if (!r) return null;
  const category = one(r.category);
  return {
    id: String(r.id),
    slug: String(r.slug),
    name: String(r.name),
    description: asText(r.description),
    categorySlug: asText(category?.slug),
    categoryName: asText(category?.name),
    difficulty: asDifficulty(r.difficulty),
    defaultServings: asNumber(r.default_servings),
    prepTimeMinutes: asNumber(r.prep_time_minutes),
    cookTimeMinutes: asNumber(r.cook_time_minutes),
    coverImagePath: asText(r.cover_image_path),
  };
}

/** Newest first. */
export async function fetchFavorites(
  client: YoChefClient,
  userId: string,
): Promise<RecipeSummary[]> {
  const { data, error } = await client
    .from("favorites")
    .select(FAVORITE_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) fail(error, "Không tải được danh sách yêu thích.");
  return ((data ?? []) as unknown as Record<string, unknown>[])
    .map(toSummary)
    .filter((r): r is RecipeSummary => r !== null);
}

export async function addFavorite(
  client: YoChefClient,
  userId: string,
  recipeId: string,
): Promise<void> {
  const { error } = await client
    .from("favorites")
    .insert({ user_id: userId, recipe_id: recipeId });
  // Already a favorite (another device, or a double tap): the goal is reached.
  if (error && error.code !== "23505")
    fail(error, "Không lưu được món yêu thích.");
}

export async function removeFavorite(
  client: YoChefClient,
  userId: string,
  recipeId: string,
): Promise<void> {
  const { error } = await client
    .from("favorites")
    .delete()
    .eq("user_id", userId)
    .eq("recipe_id", recipeId);
  if (error) fail(error, "Không bỏ được món yêu thích.");
}
