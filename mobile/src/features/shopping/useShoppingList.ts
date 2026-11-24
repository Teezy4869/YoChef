import { useCallback, useEffect, useState } from "react";

import type { YoChefClient } from "@/lib/supabase";

import {
  addManual,
  fetchItems,
  findDefaultList,
  parseManual,
  removeChecked,
  removeItem,
  setChecked,
  type ManualErrors,
  type ManualInput,
  type ShoppingItem,
} from "./shoppingApi";

type Result = {
  userId: string;
  attempt: number;
  listId: string | null;
  items: ShoppingItem[];
  error: string | null;
};
const messageOf = (e: unknown) =>
  e instanceof Error ? e.message : "Có lỗi xảy ra. Vui lòng thử lại.";

/**
 * The signed-in user's default shopping list. Ticks and deletes show at once
 * and are rolled back if saving fails. `reload` keeps the rows on screen while
 * it fetches, so returning to the tab does not flash a spinner.
 */
export function useShoppingList(client: YoChefClient, userId: string) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const listId = await findDefaultList(client, userId);
      const items = listId ? await fetchItems(client, listId) : [];
      return { listId, items };
    })().then(
      ({ listId, items }) =>
        active && setResult({ userId, attempt, listId, items, error: null }),
      (e: unknown) =>
        active &&
        setResult((prev) => ({
          userId,
          attempt,
          listId: prev?.userId === userId ? prev.listId : null,
          items: prev?.userId === userId ? prev.items : [],
          error: messageOf(e),
        })),
    );
    return () => {
      active = false;
    };
  }, [client, userId, attempt]);

  const current = result?.userId === userId ? result : null;
  const items = current?.items ?? [];

  const setItems = (fn: (items: ShoppingItem[]) => ShoppingItem[]) =>
    setResult((prev) =>
      prev && prev.userId === userId
        ? { ...prev, items: fn(prev.items) }
        : prev,
    );

  const toggle = async (item: ShoppingItem) => {
    setActionError(null);
    const flip = (checked: boolean) =>
      setItems((list) =>
        list.map((i) => (i.id === item.id ? { ...i, isChecked: checked } : i)),
      );
    flip(!item.isChecked);
    try {
      await setChecked(client, item.id, !item.isChecked);
    } catch (e) {
      flip(item.isChecked);
      setActionError(messageOf(e));
    }
  };

  const remove = async (item: ShoppingItem) => {
    setActionError(null);
    const before = items;
    setItems((list) => list.filter((i) => i.id !== item.id));
    try {
      await removeItem(client, item.id);
    } catch (e) {
      setItems(() => before);
      setActionError(messageOf(e));
    }
  };

  const clearChecked = async () => {
    if (!current?.listId) return;
    setActionError(null);
    const before = items;
    setItems((list) => list.filter((i) => !i.isChecked));
    try {
      await removeChecked(client, current.listId);
    } catch (e) {
      setItems(() => before);
      setActionError(messageOf(e));
    }
  };

  /** Validates, saves, then appends; returns field errors to show, or null when added. */
  const add = async (input: ManualInput): Promise<ManualErrors | null> => {
    setActionError(null);
    const { item, errors } = parseManual(input);
    if (!item) return errors;
    try {
      const row = await addManual(client, userId, item);
      // A list created by this add is picked up by the reload.
      if (current?.listId) setItems((list) => [...list, row]);
      else setAttempt((n) => n + 1);
      return null;
    } catch (e) {
      setActionError(messageOf(e));
      return {};
    }
  };

  return {
    loading: current === null,
    error: current?.error ?? null,
    items,
    actionError,
    toggle,
    remove,
    clearChecked,
    add,
    reload: useCallback(() => setAttempt((n) => n + 1), []),
  };
}
