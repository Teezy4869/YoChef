import { useCallback, useEffect, useState } from 'react';

import { RecipeError } from '@/features/recipes/recipeApi';
import type { YoChefClient } from '@/lib/supabase';

import {
  addOrMergePantryItems,
  fetchPantry,
  removePantryItem,
  updatePantryItem,
  type PantryEntryInput,
  type PantryItem,
} from './pantryApi';

type Result = { userId: string; attempt: number; items: PantryItem[]; error: string | null };
const messageOf = (e: unknown) =>
  e instanceof RecipeError || e instanceof Error ? e.message : 'Có lỗi xảy ra. Vui lòng thử lại.';

/**
 * Signed-in user's pantry state. Reloads without flashing a spinner when returning
 * to the tab or after cooking deduction / shopping transfer.
 */
export function usePantry(client: YoChefClient, userId: string | null) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    fetchPantry(client, userId).then(
      (items) => active && setResult({ userId, attempt, items, error: null }),
      (e: unknown) =>
        active &&
        setResult((prev) => ({
          userId,
          attempt,
          items: prev?.userId === userId ? prev.items : [],
          error: messageOf(e),
        })),
    );
    return () => {
      active = false;
    };
  }, [client, userId, attempt]);

  const current = userId && result?.userId === userId ? result : null;
  const items = current?.items ?? [];

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const addItem = async (entry: PantryEntryInput): Promise<boolean> => {
    if (!userId) return false;
    setActionError(null);
    try {
      await addOrMergePantryItems(client, [entry], undefined, userId);
      reload();
      return true;
    } catch (e) {
      setActionError(messageOf(e));
      return false;
    }
  };

  const updateItem = async (pantryId: string, patch: { quantity: number; unit: string }): Promise<boolean> => {
    if (!userId) return false;
    setActionError(null);
    try {
      await updatePantryItem(client, pantryId, patch, userId);
      reload();
      return true;
    } catch (e) {
      setActionError(messageOf(e));
      return false;
    }
  };

  const removeItem = async (pantryId: string): Promise<boolean> => {
    if (!userId) return false;
    setActionError(null);
    const before = items;
    setResult((prev) => (prev && prev.userId === userId ? { ...prev, items: prev.items.filter((i) => i.id !== pantryId) } : prev));
    try {
      await removePantryItem(client, pantryId, userId);
      return true;
    } catch (e) {
      setResult((prev) => (prev && prev.userId === userId ? { ...prev, items: before } : prev));
      setActionError(messageOf(e));
      return false;
    }
  };

  return {
    loading: Boolean(userId) && current === null,
    error: current?.error ?? null,
    items,
    actionError,
    addItem,
    updateItem,
    removeItem,
    reload,
  };
}
