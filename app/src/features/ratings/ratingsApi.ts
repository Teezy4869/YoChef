// Ratings (Phase 3.3, migration 20261114045322_phase3_ratings). Scores of
// published recipes are public; the average comes from the view
// public.recipe_rating_summary, which has no row while nobody has rated.
import { asNumber, fail } from '@/features/recipes/recipeApi';
import type { YoChefClient } from '@/lib/supabase';

export type RatingSummary = { count: number; average: number | null };

export async function fetchRatingSummary(client: YoChefClient, recipeId: string): Promise<RatingSummary> {
  const { data, error } = await client
    .from('recipe_rating_summary')
    .select('rating_count,avg_score')
    .eq('recipe_id', recipeId)
    .maybeSingle();
  if (error) fail(error, 'Không tải được đánh giá.');
  const row = data as { rating_count?: unknown; avg_score?: unknown } | null;
  // No row: unknown average (C5), never 0.
  return { count: asNumber(row?.rating_count) ?? 0, average: asNumber(row?.avg_score) };
}

export async function fetchMyScore(client: YoChefClient, userId: string, recipeId: string): Promise<number | null> {
  const { data, error } = await client
    .from('ratings')
    .select('score')
    .eq('user_id', userId)
    .eq('recipe_id', recipeId)
    .maybeSingle();
  if (error) fail(error, 'Không tải được đánh giá của bạn.');
  return asNumber((data as { score?: unknown } | null)?.score);
}

async function updateScore(client: YoChefClient, userId: string, recipeId: string, score: number): Promise<boolean> {
  const { data, error } = await client
    .from('ratings')
    .update({ score })
    .eq('user_id', userId)
    .eq('recipe_id', recipeId)
    .select('id');
  if (error) fail(error, 'Không lưu được đánh giá.');
  return (data ?? []).length === 1;
}

/** Changes the user's score, or adds it; a score saved meanwhile from another device is updated. */
export async function saveScore(client: YoChefClient, userId: string, recipeId: string, score: number): Promise<void> {
  if (!Number.isInteger(score) || score < 1 || score > 5) throw new Error('Điểm đánh giá phải từ 1 đến 5.');
  if (await updateScore(client, userId, recipeId, score)) return;
  const { error } = await client.from('ratings').insert({ user_id: userId, recipe_id: recipeId, score });
  if (!error) return;
  if (error.code === '23505' && (await updateScore(client, userId, recipeId, score))) return;
  fail(error, 'Không lưu được đánh giá.');
}

export async function removeScore(client: YoChefClient, userId: string, recipeId: string): Promise<void> {
  const { error } = await client.from('ratings').delete().eq('user_id', userId).eq('recipe_id', recipeId);
  if (error) fail(error, 'Không xóa được đánh giá.');
}

/** "4,3" */
export const formatAverage = (n: number) => n.toFixed(1).replace('.', ',');
