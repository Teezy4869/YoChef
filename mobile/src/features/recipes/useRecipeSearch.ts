import { useCallback, useEffect, useRef, useState } from 'react';

import type { YoChefClient } from '@/lib/supabase';

import { PAGE_SIZE, RecipeError, searchRecipes } from './recipeApi';
import type { RecipeSummary, SearchFilters } from './types';

type Result = { key: string; items: RecipeSummary[]; total: number; error: string | null };

const messageOf = (e: unknown) => (e instanceof RecipeError ? e.message : 'Có lỗi xảy ra. Vui lòng thử lại.');

/**
 * Paged recipe search. `filters` must already be debounced. A result belongs to
 * the request key that produced it, so while the key changes the hook reports
 * `loading` without ever setting state synchronously, and a slow response for
 * an old key is dropped.
 */
export function useRecipeSearch(client: YoChefClient, filters: SearchFilters) {
  const { query, categorySlug, difficulty, maxTotalMinutes } = filters;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  const key = JSON.stringify([query.trim(), categorySlug, difficulty, maxTotalMinutes, attempt]);
  const keyRef = useRef(key);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    keyRef.current = key;
  }, [key]);

  useEffect(() => {
    let active = true;
    const f: SearchFilters = { query, categorySlug, difficulty, maxTotalMinutes };
    searchRecipes(client, f, { offset: 0 }).then(
      (r) => active && setResult({ key, items: r.items, total: r.total, error: null }),
      (e: unknown) => active && setResult({ key, items: [], total: 0, error: messageOf(e) }),
    );
    return () => {
      active = false;
    };
  }, [client, key, query, categorySlug, difficulty, maxTotalMinutes]);

  const current = result && result.key === key ? result : null;

  const loadMore = useCallback(async () => {
    if (!current || current.error || loadingMoreRef.current || current.items.length >= current.total) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setMoreError(null);
    const startKey = keyRef.current;
    try {
      const page = await searchRecipes(
        client,
        { query, categorySlug, difficulty, maxTotalMinutes },
        { offset: current.items.length, limit: PAGE_SIZE },
      );
      if (keyRef.current !== startKey) return; // filters changed meanwhile
      setResult((prev) => {
        if (!prev || prev.key !== startKey) return prev;
        const seen = new Set(prev.items.map((i) => i.id));
        return { ...prev, items: [...prev.items, ...page.items.filter((i) => !seen.has(i.id))], total: page.total || prev.total };
      });
    } catch (e) {
      if (keyRef.current === startKey) setMoreError(messageOf(e));
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [client, current, query, categorySlug, difficulty, maxTotalMinutes]);

  return {
    loading: current === null,
    error: current?.error ?? null,
    items: current?.items ?? [],
    total: current?.total ?? 0,
    loadingMore,
    moreError,
    loadMore,
    retry: () => setAttempt((n) => n + 1),
  };
}
