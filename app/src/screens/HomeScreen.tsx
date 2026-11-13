import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { MainTabScreenProps } from '@/app/navigation/types';
import { AppText } from '@/components/AppText';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
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
  const [filters, setFilters] = useState<SearchFilters>(EMPTY_FILTERS);
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

  const set = (patch: Partial<SearchFilters>) => setFilters((f) => ({ ...f, ...patch }));
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
          <Chip label="Tất cả" selected={filters.categorySlug === null} onPress={() => set({ categorySlug: null })} />
          {categories.map((c) => (
            <Chip
              key={c.slug}
              label={c.name}
              selected={filters.categorySlug === c.slug}
              onPress={() => set({ categorySlug: filters.categorySlug === c.slug ? null : c.slug })}
            />
          ))}
        </ScrollView>
      ) : null}
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
      {!search.loading && !search.error ? (
        <AppText variant="caption" tone="muted" accessibilityLiveRegion="polite" testID="result-count">
          {search.total} công thức
        </AppText>
      ) : null}
    </View>
  );

  let body;
  if (search.loading) {
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
