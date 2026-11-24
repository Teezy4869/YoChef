import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useAuth } from "@/features/auth/AuthProvider";
import type { RecipeSummary } from "@/features/recipes/types";
import { useSupabase } from "@/lib/supabase";

import { addFavorite, fetchFavorites, removeFavorite } from "./favoritesApi";

export type FavoritesValue = {
  items: RecipeSummary[];
  loading: boolean;
  error: string | null;
  isFavorite: (recipeId: string) => boolean;
  /** Flips at once, then saves; on failure flips back and returns the message. */
  toggle: (recipeId: string) => Promise<string | null>;
  reload: () => void;
};

const FavoritesContext = createContext<FavoritesValue | null>(null);
const messageOf = (e: unknown) =>
  e instanceof Error ? e.message : "Có lỗi xảy ra. Vui lòng thử lại.";

type Loaded = {
  userId: string;
  version: number;
  items: RecipeSummary[];
  error: string | null;
};
/** Hearts flipped before the server list confirms them, per user. */
type Overrides = { userId: string | null; map: ReadonlyMap<string, boolean> };

/**
 * The signed-in user's favorites. Results are keyed by user, so a guest or a
 * different user never sees the previous user's list.
 */
export function FavoritesProvider({ children }: { children: ReactNode }) {
  const supabase = useSupabase();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [overrides, setOverrides] = useState<Overrides>({
    userId: null,
    map: new Map(),
  });

  useEffect(() => {
    if (!userId) return;
    let active = true;
    fetchFavorites(supabase, userId).then(
      (items) => {
        if (!active) return;
        setLoaded({ userId, version, items, error: null });
        setOverrides({ userId, map: new Map() }); // the server list is now the truth
      },
      (e: unknown) => {
        if (!active) return;
        // Keep showing the last good list of this user next to the error.
        setLoaded((prev) => ({
          userId,
          version,
          items: prev?.userId === userId ? prev.items : [],
          error: messageOf(e),
        }));
      },
    );
    return () => {
      active = false;
    };
  }, [supabase, userId, version]);

  const current = userId && loaded?.userId === userId ? loaded : null;
  const flips = useMemo(
    () =>
      overrides.userId === userId ? overrides.map : new Map<string, boolean>(),
    [overrides, userId],
  );
  const ids = useMemo(
    () => new Set(current?.items.map((r) => r.id) ?? []),
    [current],
  );
  const isFavorite = useCallback(
    (id: string) => flips.get(id) ?? ids.has(id),
    [flips, ids],
  );

  const setFlip = useCallback(
    (recipeId: string, on: boolean | null) =>
      setOverrides((prev) => {
        const map = new Map(prev.userId === userId ? prev.map : []);
        if (on === null) map.delete(recipeId);
        else map.set(recipeId, on);
        return { userId, map };
      }),
    [userId],
  );

  const toggle = useCallback(
    async (recipeId: string) => {
      if (!userId) return "Bạn cần đăng nhập để lưu món yêu thích.";
      const adding = !isFavorite(recipeId);
      setFlip(recipeId, adding);
      try {
        await (adding ? addFavorite : removeFavorite)(
          supabase,
          userId,
          recipeId,
        );
        setVersion((v) => v + 1); // refresh the tab list, which carries the recipe cards
        return null;
      } catch (e) {
        setFlip(recipeId, null);
        return messageOf(e);
      }
    },
    [supabase, userId, isFavorite, setFlip],
  );

  const value = useMemo<FavoritesValue>(
    () => ({
      items: (current?.items ?? []).filter((r) => flips.get(r.id) !== false),
      loading:
        userId !== null && (current === null || current.version !== version),
      error: current?.error ?? null,
      isFavorite,
      toggle,
      reload: () => setVersion((v) => v + 1),
    }),
    [current, flips, userId, version, isFavorite, toggle],
  );
  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites(): FavoritesValue {
  const value = useContext(FavoritesContext);
  if (!value)
    throw new Error("useFavorites must be used inside <FavoritesProvider>");
  return value;
}
