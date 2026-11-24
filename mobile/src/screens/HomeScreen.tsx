import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { MainTabScreenProps } from '@/app/navigation/types';
import { AppText } from '@/components/AppText';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { useAuth } from '@/features/auth/AuthProvider';
import { matchRecipesFromPantry, type PantryMatchRecipe } from '@/features/pantry/pantryApi';
import { fetchCategories, coverUrl } from '@/features/recipes/recipeApi';
import { RecipeCard } from '@/features/recipes/RecipeCard';
import { useRecipeSearch } from '@/features/recipes/useRecipeSearch';
import {
  DIFFICULTY_LABEL,
  EMPTY_FILTERS,
  type Category,
  type Difficulty,
  type SearchFilters,
} from '@/features/recipes/types';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useSupabase } from '@/lib/supabase';
import { colors, radius, spacing, touchTarget, typography } from '@/theme/tokens';

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
const TIME_OPTIONS = [30, 60];
export const SEARCH_DEBOUNCE_MS = 350;

export function HomeScreen({ navigation }: MainTabScreenProps<'Home'>) {
  const supabase = useSupabase();
  const { status } = useAuth();
  const signedIn = status === 'signedIn';

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

  // Typing is debounced; chips apply at once.
  const debouncedQuery = useDebouncedValue(filters.query, SEARCH_DEBOUNCE_MS);
  const effective = useMemo(() => ({ ...filters, query: debouncedQuery }), [filters, debouncedQuery]);
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

  const pantryKey = `${signedIn ? '1' : '0'}:${pantryReloadTick}`;

  useEffect(() => {
    if (!pantryOnly) return;
    let active = true;
    matchRecipesFromPantry(supabase, { limit: 40, offset: 0 }).then(
      (res) => active && setPantryResult({ key: pantryKey, error: null, items: res.items, total: res.total }),
      (e: unknown) =>
        active &&
        setPantryResult({
          key: pantryKey,
          error: e instanceof Error ? e.message : 'Không gợi ý được món từ tủ lạnh.',
          items: [],
          total: 0,
        }),
    );
    return () => {
      active = false;
    };
  }, [supabase, pantryOnly, pantryKey]);

  const currentPantry = pantryOnly && pantryResult?.key === pantryKey ? pantryResult : null;
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
    filters.query.trim() !== '' || filters.categorySlug !== null || filters.difficulty !== null || filters.maxTotalMinutes !== null;

  const header = (
    <View style={styles.header}>
      <AppText variant="title">Khám phá món Việt</AppText>
      <TextInput
        accessibilityLabel="Tìm công thức"
        placeholder="Tìm theo tên món hoặc nguyên liệu"
        placeholderTextColor={colors.textMuted}
        value={filters.query}
        onChangeText={(query) => set({ query })}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
        style={styles.search}
      />
      {categories.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip
            label="Tất cả"
            selected={!pantryOnly && filters.categorySlug === null}
            onPress={() => {
              setPantrySelected(false);
              set({ categorySlug: null });
            }}
          />
          {signedIn ? (
            <Chip
              label="Nấu từ tủ lạnh"
              selected={pantryOnly}
              onPress={() => setPantrySelected((v) => !v)}
            />
          ) : null}
          {categories.map((c) => (
            <Chip
              key={c.slug}
              label={c.name}
              selected={!pantryOnly && filters.categorySlug === c.slug}
              onPress={() => set({ categorySlug: filters.categorySlug === c.slug ? null : c.slug })}
            />
          ))}
        </ScrollView>
      ) : signedIn ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip
            label="Nấu từ tủ lạnh"
            selected={pantryOnly}
            onPress={() => setPantrySelected((v) => !v)}
          />
        </ScrollView>
      ) : null}

      {!pantryOnly ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {DIFFICULTIES.map((d) => (
            <Chip
              key={d}
              label={DIFFICULTY_LABEL[d]}
              selected={filters.difficulty === d}
              onPress={() => set({ difficulty: filters.difficulty === d ? null : d })}
            />
          ))}
          {TIME_OPTIONS.map((m) => (
            <Chip
              key={m}
              label={`Dưới ${m} phút`}
              selected={filters.maxTotalMinutes === m}
              onPress={() => set({ maxTotalMinutes: filters.maxTotalMinutes === m ? null : m })}
            />
          ))}
        </ScrollView>
      ) : null}

      {pantryOnly ? (
        !pantryState.loading && !pantryState.error ? (
          <AppText variant="caption" tone="muted" accessibilityLiveRegion="polite" testID="pantry-match-count">
            {`${pantryState.total} món gợi ý từ tủ lạnh của bạn`}
          </AppText>
        ) : null
      ) : !search.loading && !search.error ? (
        <AppText variant="caption" tone="muted" accessibilityLiveRegion="polite" testID="result-count">
          {search.total} công thức
        </AppText>
      ) : null}
    </View>
  );

  let body;
  if (pantryOnly) {
    if (pantryState.loading) {
      body = (
        <View style={styles.center} testID="pantry-match-loading">
          <ActivityIndicator color={colors.primary} size="large" accessibilityLabel="Đang tìm món từ tủ lạnh" />
        </View>
      );
    } else if (pantryState.error) {
      body = (
        <View style={styles.center} testID="pantry-match-error">
          <Banner tone="error" message={pantryState.error} />
          <Button title="Thử lại" onPress={() => setPantryReloadTick((n) => n + 1)} />
        </View>
      );
    } else if (pantryState.items.length === 0) {
      body = (
        <View style={styles.center} testID="pantry-match-empty">
          <AppText variant="heading" align="center">
            Chưa có món nào khớp với tủ lạnh
          </AppText>
          <AppText tone="muted" align="center">
            Hãy thêm nguyên liệu đang có vào mục Đi chợ → Tủ lạnh để YoChef gợi ý món nấu ngay.
          </AppText>
          <Button title="Xem tất cả công thức" variant="secondary" onPress={() => setPantrySelected(false)} />
        </View>
      );
    } else {
      body = (
        <FlatList
          data={pantryState.items}
          keyExtractor={(m) => m.recipe.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <RecipeCard
              recipe={item.recipe}
              imageUri={coverUrl(supabase, item.recipe.coverImagePath)}
              pantryBadge={
                item.missingCount === 0
                  ? 'Đủ nguyên liệu'
                  : `Có ${item.matchedCount}/${item.requiredCount} · Thiếu ${item.missingCount} món`
              }
              pantryTone={item.missingCount === 0 ? 'success' : 'info'}
              onPress={() => navigation.navigate('RecipeDetail', { slug: item.recipe.slug })}
            />
          )}
        />
      );
    }
  } else if (search.loading) {
    body = (
      <View style={styles.center} testID="recipes-loading">
        <ActivityIndicator color={colors.primary} size="large" accessibilityLabel="Đang tải công thức" />
      </View>
    );
  } else if (search.error) {
    body = (
      <View style={styles.center} testID="recipes-error">
        <Banner tone="error" message={search.error} />
        <Button title="Thử lại" onPress={search.retry} />
      </View>
    );
  } else if (search.items.length === 0) {
    body = (
      <View style={styles.center} testID="recipes-empty">
        <AppText variant="heading" align="center">
          Không tìm thấy công thức phù hợp
        </AppText>
        <AppText tone="muted" align="center">
          Thử bỏ dấu, đổi từ khóa hoặc bỏ bớt bộ lọc.
        </AppText>
        {hasFilters ? <Button title="Xóa bộ lọc" variant="secondary" onPress={() => setFilters(EMPTY_FILTERS)} /> : null}
      </View>
    );
  } else {
    body = (
      <FlatList
        data={search.items}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <RecipeCard
            recipe={item}
            imageUri={coverUrl(supabase, item.coverImagePath)}
            onPress={() => navigation.navigate('RecipeDetail', { slug: item.slug })}
          />
        )}
        onEndReached={search.loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          search.loadingMore ? (
            <ActivityIndicator color={colors.primary} style={styles.footer} accessibilityLabel="Đang tải thêm" />
          ) : search.moreError ? (
            <View style={styles.footer}>
              <Banner tone="error" message={search.moreError} />
              <Button title="Tải thêm" variant="secondary" onPress={search.loadMore} />
            </View>
          ) : undefined
        }
      />
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      {header}
      {body}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.sm },
  search: {
    ...typography.body,
    minHeight: touchTarget,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    color: colors.text,
  },
  chips: { gap: spacing.sm, paddingVertical: spacing.xs },
  list: { padding: spacing.lg, gap: spacing.md },
  center: { flex: 1, padding: spacing.xl, gap: spacing.lg, justifyContent: 'center' },
  footer: { paddingVertical: spacing.lg, gap: spacing.md },
});
