import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { MainTabScreenProps } from "@/app/navigation/types";
import { AppIcon } from "@/components/AppIcon";
import { AppText } from "@/components/AppText";
import { Banner } from "@/components/Banner";
import { Button } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { EmptyState } from "@/components/EmptyState";
import { RecipeListSkeleton } from "@/components/Skeleton";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  matchRecipesFromPantry,
  type PantryMatchRecipe,
} from "@/features/pantry/pantryApi";
import { coverUrl, fetchCategories } from "@/features/recipes/recipeApi";
import { RecipeCard } from "@/features/recipes/RecipeCard";
import {
  DIFFICULTY_LABEL,
  EMPTY_FILTERS,
  type Category,
  type Difficulty,
  type SearchFilters,
} from "@/features/recipes/types";
import { useRecipeSearch } from "@/features/recipes/useRecipeSearch";
import { useSupabase } from "@/lib/supabase";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import {
  colors,
  radius,
  shadows,
  spacing,
  touchTarget,
  typography,
} from "@/theme/tokens";

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];
const TIME_OPTIONS = [30, 60];
export const SEARCH_DEBOUNCE_MS = 350;

export function HomeScreen({ navigation }: MainTabScreenProps<"Home">) {
  const supabase = useSupabase();
  const { status, session } = useAuth();
  const signedIn = status === "signedIn";
  const userId = signedIn && session ? session.user.id : undefined;

  const [filters, setFilters] = useState<SearchFilters>(EMPTY_FILTERS);
  const [pantrySelected, setPantrySelected] = useState(false);
  const pantryOnly = signedIn && pantrySelected;
  const [pantryReloadTick, setPantryReloadTick] = useState(0);
  const [pantryResult, setPantryResult] = useState<{
    key: string;
    error: string | null;
    items: PantryMatchRecipe[];
    total: number;
  } | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Typing is debounced; chips apply at once.
  const debouncedQuery = useDebouncedValue(filters.query, SEARCH_DEBOUNCE_MS);
  const effective = useMemo(
    () => ({ ...filters, query: debouncedQuery }),
    [filters, debouncedQuery],
  );
  const search = useRecipeSearch(supabase, effective);

  // Categories are a convenience: if they fail to load, search still works.
  useEffect(() => {
    let active = true;
    fetchCategories(supabase).then(
      (c) => active && setCategories(c),
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [supabase]);

  useFocusEffect(
    useCallback(() => {
      if (pantryOnly) setPantryReloadTick((n) => n + 1);
    }, [pantryOnly]),
  );

  const pantryKey = `${signedIn ? "1" : "0"}:${pantryReloadTick}`;

  useEffect(() => {
    if (!pantryOnly) return;
    let active = true;
    matchRecipesFromPantry(supabase, { limit: 40, offset: 0 }).then(
      (res) =>
        active &&
        setPantryResult({
          key: pantryKey,
          error: null,
          items: res.items,
          total: res.total,
        }),
      (e: unknown) =>
        active &&
        setPantryResult({
          key: pantryKey,
          error:
            e instanceof Error ? e.message : "Không gợi ý được món từ tủ lạnh.",
          items: [],
          total: 0,
        }),
    );
    return () => {
      active = false;
    };
  }, [supabase, pantryOnly, pantryKey, userId]);

  const currentPantry =
    pantryOnly && pantryResult?.key === pantryKey ? pantryResult : null;
  const pantryState = {
    loading: pantryOnly && currentPantry === null,
    error: currentPantry?.error ?? null,
    items: currentPantry?.items ?? [],
    total: currentPantry?.total ?? 0,
  };

  const set = (patch: Partial<SearchFilters>) => {
    setPantrySelected(false);
    setFilters((f) => ({ ...f, ...patch }));
  };

  const hasFilters =
    filters.query.trim() !== "" ||
    filters.categorySlug !== null ||
    filters.difficulty !== null ||
    filters.maxTotalMinutes !== null;

  const handleRefresh = () => {
    setRefreshing(true);
    if (pantryOnly) {
      setPantryReloadTick((n) => n + 1);
    } else {
      search.retry();
    }
    setTimeout(() => setRefreshing(false), 300);
  };

  const topSearchBar = (
    <View style={styles.topBar}>
      <View style={styles.brandRow}>
        <View style={styles.brandCopy}>
          <AppText variant="title">Khám phá món Việt</AppText>
          <AppText variant="caption" tone="muted">
            Công thức chuẩn vị · Chỉnh khẩu phần linh hoạt
          </AppText>
        </View>
      </View>

      <View style={styles.searchBox}>
        <AppIcon name="search-outline" size={19} tone="muted" />
        <TextInput
          accessibilityLabel="Tìm công thức"
          placeholder="Tìm theo tên món hoặc nguyên liệu"
          placeholderTextColor={colors.textMuted}
          value={filters.query}
          onChangeText={(query) => set({ query })}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={styles.searchInput}
        />
        {filters.query.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Xóa từ khóa"
            onPress={() => set({ query: "" })}
            hitSlop={6}
            style={styles.clearBtn}
          >
            <AppIcon name="close-circle" size={18} tone="muted" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  const filterHeader = (
    <View style={styles.filterBlock}>
      {categories.length > 0 || signedIn ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {categories.length > 0 ? (
            <Chip
              label="Tất cả"
              selected={!pantryOnly && filters.categorySlug === null}
              onPress={() => {
                setPantrySelected(false);
                set({ categorySlug: null });
              }}
            />
          ) : null}
          {signedIn ? (
            <Chip
              label="Nấu từ tủ lạnh"
              icon="snow-outline"
              selected={pantryOnly}
              onPress={() => setPantrySelected((v) => !v)}
            />
          ) : null}
          {categories.map((c) => (
            <Chip
              key={c.slug}
              label={c.name}
              selected={!pantryOnly && filters.categorySlug === c.slug}
              onPress={() =>
                set({
                  categorySlug: filters.categorySlug === c.slug ? null : c.slug,
                })
              }
            />
          ))}
        </ScrollView>
      ) : null}

      {!pantryOnly ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {DIFFICULTIES.map((d) => (
            <Chip
              key={d}
              label={DIFFICULTY_LABEL[d]}
              selected={filters.difficulty === d}
              onPress={() =>
                set({ difficulty: filters.difficulty === d ? null : d })
              }
            />
          ))}
          {TIME_OPTIONS.map((m) => (
            <Chip
              key={m}
              label={`Dưới ${m} phút`}
              icon="time-outline"
              selected={filters.maxTotalMinutes === m}
              onPress={() =>
                set({
                  maxTotalMinutes: filters.maxTotalMinutes === m ? null : m,
                })
              }
            />
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.statusRow}>
        {pantryOnly ? (
          !pantryState.loading && !pantryState.error ? (
            <AppText
              variant="caption"
              tone="muted"
              accessibilityLiveRegion="polite"
              testID="pantry-match-count"
            >
              {`${pantryState.total} món gợi ý từ tủ lạnh của bạn`}
            </AppText>
          ) : (
            <View />
          )
        ) : !search.loading && !search.error ? (
          <AppText
            variant="caption"
            tone="muted"
            accessibilityLiveRegion="polite"
            testID="result-count"
          >
            {search.total} công thức
          </AppText>
        ) : (
          <View />
        )}

        {hasFilters && !pantryOnly ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setFilters(EMPTY_FILTERS)}
            hitSlop={6}
            style={styles.resetLink}
          >
            <AppText variant="caption" tone="primary">
              Đặt lại bộ lọc
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  let body;
  if (pantryOnly) {
    if (pantryState.loading) {
      body = (
        <ScrollView contentContainerStyle={styles.scrollFallback}>
          {filterHeader}
          <RecipeListSkeleton count={3} testID="pantry-match-loading" />
        </ScrollView>
      );
    } else if (pantryState.error) {
      body = (
        <ScrollView
          contentContainerStyle={styles.scrollFallback}
          testID="pantry-match-error"
        >
          {filterHeader}
          <EmptyState
            icon="alert-circle-outline"
            tone="danger"
            title="Không gợi ý được món từ tủ lạnh"
            message={pantryState.error}
            action={
              <Button
                title="Thử lại"
                icon="refresh"
                onPress={() => setPantryReloadTick((n) => n + 1)}
              />
            }
          />
        </ScrollView>
      );
    } else if (pantryState.items.length === 0) {
      body = (
        <ScrollView
          contentContainerStyle={styles.scrollFallback}
          testID="pantry-match-empty"
        >
          {filterHeader}
          <EmptyState
            icon="snow-outline"
            title="Chưa có món nào khớp với tủ lạnh"
            message="Hãy thêm nguyên liệu đang có vào mục Đi chợ → Tủ lạnh để YoChef gợi ý món nấu ngay."
            action={
              <Button
                title="Xem tất cả công thức"
                variant="secondary"
                onPress={() => setPantrySelected(false)}
              />
            }
          />
        </ScrollView>
      );
    } else {
      body = (
        <FlatList
          data={pantryState.items}
          keyExtractor={(m) => m.recipe.id}
          ListHeaderComponent={filterHeader}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <RecipeCard
              recipe={item.recipe}
              imageUri={coverUrl(supabase, item.recipe.coverImagePath)}
              pantryBadge={
                item.missingCount === 0
                  ? "Đủ nguyên liệu"
                  : `Có ${item.matchedCount}/${item.requiredCount} · Thiếu ${item.missingCount} món`
              }
              pantryTone={item.missingCount === 0 ? "success" : "info"}
              onPress={() =>
                navigation.navigate("RecipeDetail", { slug: item.recipe.slug })
              }
            />
          )}
        />
      );
    }
  } else if (search.loading) {
    body = (
      <ScrollView contentContainerStyle={styles.scrollFallback}>
        {filterHeader}
        <RecipeListSkeleton count={3} testID="recipes-loading" />
      </ScrollView>
    );
  } else if (search.error) {
    body = (
      <ScrollView
        contentContainerStyle={styles.scrollFallback}
        testID="recipes-error"
      >
        {filterHeader}
        <EmptyState
          icon="cloud-offline-outline"
          tone="danger"
          title="Không tải được công thức"
          message={search.error}
          action={
            <Button title="Thử lại" icon="refresh" onPress={search.retry} />
          }
        />
      </ScrollView>
    );
  } else if (search.items.length === 0) {
    body = (
      <ScrollView
        contentContainerStyle={styles.scrollFallback}
        testID="recipes-empty"
      >
        {filterHeader}
        <EmptyState
          icon="search-outline"
          tone="muted"
          title="Không tìm thấy công thức phù hợp"
          message="Thử bỏ dấu, đổi từ khóa hoặc bỏ bớt bộ lọc."
          action={
            hasFilters ? (
              <Button
                title="Xóa bộ lọc"
                variant="secondary"
                onPress={() => setFilters(EMPTY_FILTERS)}
              />
            ) : undefined
          }
        />
      </ScrollView>
    );
  } else {
    body = (
      <FlatList
        data={search.items}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={filterHeader}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
        renderItem={({ item }) => (
          <RecipeCard
            recipe={item}
            imageUri={coverUrl(supabase, item.coverImagePath)}
            onPress={() =>
              navigation.navigate("RecipeDetail", { slug: item.slug })
            }
          />
        )}
        onEndReached={search.loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          search.loadingMore ? (
            <ActivityIndicator
              color={colors.primary}
              style={styles.footer}
              accessibilityLabel="Đang tải thêm"
            />
          ) : search.moreError ? (
            <View style={styles.footer}>
              <Banner tone="error" message={search.moreError} />
              <Button
                title="Tải thêm"
                variant="secondary"
                onPress={search.loadMore}
              />
            </View>
          ) : undefined
        }
      />
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      {topSearchBar}
      {body}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  topBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandCopy: {
    gap: spacing.xxs,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: touchTarget,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    ...shadows.card,
  },
  searchInput: {
    ...typography.body,
    flex: 1,
    color: colors.text,
    paddingVertical: spacing.sm,
  },
  clearBtn: {
    padding: spacing.xs,
  },
  filterBlock: {
    gap: spacing.xs,
    paddingBottom: spacing.xs,
  },
  chips: { gap: spacing.sm, paddingVertical: spacing.xs },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: spacing.xxs,
  },
  resetLink: {
    paddingVertical: spacing.xxs,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  scrollFallback: { flexGrow: 1, padding: spacing.lg, gap: spacing.md },
  footer: { paddingVertical: spacing.lg, gap: spacing.md },
});
