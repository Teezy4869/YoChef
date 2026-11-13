import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { RootStackScreenProps } from '@/app/navigation/types';
import { AppText } from '@/components/AppText';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { formatSeconds, joinMeta, timeLabel } from '@/features/recipes/format';
import { coverUrl } from '@/features/recipes/recipeApi';
import { clampServings, MAX_SERVINGS, MIN_SERVINGS, quantityText } from '@/features/recipes/servings';
import { DIFFICULTY_LABEL, type RecipeDetail, type ServingBasis } from '@/features/recipes/types';
import { useRecipeDetail } from '@/features/recipes/useRecipeDetail';
import { useSupabase } from '@/lib/supabase';
import { colors, radius, spacing, touchTarget } from '@/theme/tokens';

const SERVING_BASIS_LABEL: Record<ServingBasis, string> = {
  book: 'Khẩu phần theo sách',
  editor_estimate: 'Khẩu phần do biên tập ước tính',
  inferred_yield: 'Khẩu phần suy ra từ thành phẩm',
};

export function RecipeDetailScreen({ route }: RootStackScreenProps<'RecipeDetail'>) {
  const supabase = useSupabase();
  const { loading, error, recipe, notFound, retry } = useRecipeDetail(supabase, route.params.slug);

  if (loading) {
    return (
      <Screen centered testID="recipe-detail-loading">
        <ActivityIndicator color={colors.primary} size="large" accessibilityLabel="Đang tải công thức" />
      </Screen>
    );
  }
  if (error) {
    return (
      <Screen centered testID="recipe-detail-error">
        <Banner tone="error" message={error} />
        <Button title="Thử lại" onPress={retry} />
      </Screen>
    );
  }
  if (notFound || !recipe) {
    return (
      <Screen centered testID="recipe-detail-notfound">
        <AppText variant="title">Không tìm thấy công thức</AppText>
        <AppText tone="muted">Công thức này không tồn tại hoặc chưa được công bố.</AppText>
      </Screen>
    );
  }
  // Mounted only once the recipe exists, so servings can start from its default.
  return <RecipeDetailView recipe={recipe} imageUri={coverUrl(supabase, recipe.coverImagePath)} />;
}

function RecipeDetailView({ recipe, imageUri }: { recipe: RecipeDetail; imageUri: string | null }) {
  const base = recipe.defaultServings;
  const [servings, setServings] = useState(base ?? MIN_SERVINGS);
  const canScale = base !== null;

  const meta = joinMeta([
    recipe.categoryName,
    timeLabel(recipe.prepTimeMinutes, recipe.cookTimeMinutes),
    recipe.difficulty ? DIFFICULTY_LABEL[recipe.difficulty] : null,
  ]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} testID="recipe-detail">
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.cover} resizeMode="cover" accessibilityLabel={recipe.name} />
      ) : null}
      <View style={styles.block}>
        <AppText variant="display">{recipe.name}</AppText>
        {meta ? <AppText tone="muted">{meta}</AppText> : null}
        {recipe.description ? <AppText>{recipe.description}</AppText> : null}
      </View>

      <View style={styles.block}>
        <AppText variant="title">Nguyên liệu</AppText>
        {canScale ? (
          <View style={styles.stepper} testID="servings-stepper">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Giảm khẩu phần"
              disabled={servings <= MIN_SERVINGS}
              onPress={() => setServings((s) => clampServings(s - 1))}
              style={[styles.stepBtn, servings <= MIN_SERVINGS ? styles.stepOff : null]}
            >
              <AppText variant="title">−</AppText>
            </Pressable>
            <AppText variant="heading" accessibilityLiveRegion="polite" testID="servings-value">
              {`${servings} người`}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tăng khẩu phần"
              disabled={servings >= MAX_SERVINGS}
              onPress={() => setServings((s) => clampServings(s + 1))}
              style={[styles.stepBtn, servings >= MAX_SERVINGS ? styles.stepOff : null]}
            >
              <AppText variant="title">+</AppText>
            </Pressable>
            {servings !== base ? (
              <Button title={`Về ${base} người`} variant="ghost" fullWidth={false} onPress={() => setServings(base)} />
            ) : null}
          </View>
        ) : (
          <AppText tone="muted">Chưa rõ khẩu phần gốc nên không thể điều chỉnh.</AppText>
        )}
        {recipe.servingBasis || recipe.servingNote ? (
          <AppText variant="caption" tone="muted">
            {joinMeta([recipe.servingBasis ? SERVING_BASIS_LABEL[recipe.servingBasis] : null, recipe.servingNote])}
          </AppText>
        ) : null}

        {recipe.ingredients.length === 0 ? (
          <AppText tone="muted">Chưa có danh sách nguyên liệu.</AppText>
        ) : (
          recipe.ingredients.map((i) => {
            const qty = quantityText(i.quantity, i.unit, i.basis, base, servings);
            return (
              <View key={i.sortOrder} style={styles.ingredient} testID="ingredient-row">
                <AppText style={styles.qty} testID="ingredient-qty">
                  {qty}
                </AppText>
                <View style={styles.ingText}>
                  <AppText>
                    {i.name}
                    {i.isOptional ? ' (tùy chọn)' : ''}
                  </AppText>
                  {joinMeta([i.preparationNote, i.quantityNote]) ? (
                    <AppText variant="caption" tone="muted">
                      {joinMeta([i.preparationNote, i.quantityNote])}
                    </AppText>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
      </View>

      <View style={styles.block}>
        <AppText variant="title">Cách làm</AppText>
        {recipe.steps.length === 0 ? (
          <AppText tone="muted">Chưa có các bước thực hiện.</AppText>
        ) : (
          recipe.steps.map((s) => (
            <View key={s.stepNumber} style={styles.step} testID="step-row">
              <View style={styles.badge}>
                <AppText variant="label" tone="onPrimary">
                  {s.stepNumber}
                </AppText>
              </View>
              <View style={styles.ingText}>
                <AppText>{s.instruction}</AppText>
                {s.timerEnabled && s.durationSeconds !== null ? (
                  <AppText variant="caption" tone="primary">
                    {`Hẹn giờ ${formatSeconds(s.durationSeconds)}`}
                  </AppText>
                ) : null}
              </View>
            </View>
          ))
        )}
      </View>

      {recipe.source ? (
        <View style={styles.block} testID="recipe-source">
          <AppText variant="caption" tone="muted">
            {`Nguồn: ${joinMeta([recipe.source.title, recipe.source.compiler, recipe.source.publicationYear?.toString()])}`}
          </AppText>
          {recipe.source.usageNote ? (
            <AppText variant="caption" tone="muted">
              {recipe.source.usageNote}
            </AppText>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xxxl },
  cover: { width: '100%', aspectRatio: 16 / 10, backgroundColor: colors.surfaceMuted },
  block: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  stepBtn: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepOff: { opacity: 0.4 },
  ingredient: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.xs },
  qty: { width: 112, fontWeight: '600' },
  ingText: { flex: 1, gap: spacing.xxs },
  step: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.xs },
  badge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
