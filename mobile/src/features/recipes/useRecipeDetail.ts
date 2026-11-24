import { useEffect, useState } from 'react';

import type { YoChefClient } from '@/lib/supabase';

import { fetchRecipeDetail, RecipeError } from './recipeApi';
import type { RecipeDetail } from './types';

type Result = { key: string; recipe: RecipeDetail | null; error: string | null };

/** Loads one recipe by slug. `notFound` means it does not exist or is not published. */
export function useRecipeDetail(client: YoChefClient, slug: string) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const key = `${slug}#${attempt}`;

  useEffect(() => {
    let active = true;
    fetchRecipeDetail(client, slug).then(
      (recipe) => active && setResult({ key, recipe, error: null }),
      (e: unknown) =>
        active &&
        setResult({
          key,
          recipe: null,
          error: e instanceof RecipeError ? e.message : 'Có lỗi xảy ra. Vui lòng thử lại.',
        }),
    );
    return () => {
      active = false;
    };
  }, [client, slug, key]);

  const current = result && result.key === key ? result : null;
  return {
    loading: current === null,
    error: current?.error ?? null,
    recipe: current?.recipe ?? null,
    notFound: current !== null && current.error === null && current.recipe === null,
    retry: () => setAttempt((n) => n + 1),
  };
}
