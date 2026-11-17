import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { RootStackScreenProps } from '@/app/navigation/types';
import { AppText } from '@/components/AppText';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { CommentSection } from '@/features/community/CommentSection';
import { CookingPhotoSection } from '@/features/community/CookingPhotoSection';
import { FavoriteButton } from '@/features/favorites/FavoriteButton';
import { NutritionSection } from '@/features/nutrition/NutritionSection';
import { VideoButton } from '@/features/videos/VideoButton';
import { RatingSection } from '@/features/ratings/RatingSection';
import { AddToShoppingButton } from '@/features/shopping/AddToShoppingButton';
import { formatSeconds, joinMeta, timeLabel } from '@/features/recipes/format';
import { coverUrl } from '@/features/recipes/recipeApi';
import { IngredientRows } from '@/features/recipes/IngredientRows';
import { clampServings, MAX_SERVINGS, MIN_SERVINGS } from '@/features/recipes/servings';
import { DIFFICULTY_LABEL, type RecipeDetail, type ServingBasis } from '@/features/recipes/types';
import { useRecipeDetail } from '@/features/recipes/useRecipeDetail';
import { useSupabase } from '@/lib/supabase';
import { colors, radius, shadows, spacing } from '@/theme/tokens';

const SERVING_BASIS_LABEL: Record<ServingBasis, string> = {
  book: 'Khẩu phần theo sách',
  editor_estimate: 'Khẩu phần do biên tập ước tính',
  inferred_yield: 'Khẩu phần suy ra từ thành phẩm',
};

export function RecipeDetailScreen({ route, navigation }: RootStackScreenProps<'RecipeDetail'>) {
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
  return (
    <RecipeDetailView
      recipe={recipe}
      imageUri={coverUrl(supabase, recipe.coverImagePath)}
      onCook={(servings) => navigation.navigate('CookingMode', { slug: recipe.slug, servings })}
    />
  );
}

function RecipeDetailView({
  recipe,
  imageUri,
  onCook,
}: {
  recipe: RecipeDetail;
  imageUri: string | null;
  onCook: (servings: number) => void;
}) {
  const base = recipe.defaultServings;
  const [servings, setServings] = useState(base ?? MIN_SERVINGS);
  const canScale = base !== null;

  const meta = joinMeta([
    recipe.categoryName,
    timeLabel(recipe.prepTimeMinutes, recipe.cookTimeMinutes),
    recipe.difficulty ? DIFFICULTY_LABEL[recipe.difficulty] : null,
  ]);

  return (
    <View style={styles.root}>
      <ScrollView style={styles.root} contentContainerStyle={styles.content} testID="recipe-detail">
        {imageUri ? (
          <View style={styles.coverWrapper}>
            <Image source={{ uri: imageUri }} style={styles.cover} resizeMode="cover" accessibilityLabel={recipe.name} />
            <View style={styles.coverFloating}>
              <FavoriteButton recipeId={recipe.id} />
            </View>
          </View>
        ) : null}

        <View style={styles.headerBlock}>
          {recipe.categoryName ? (
            <AppText variant="caption" tone="primary" style={styles.categoryPill}>
              {recipe.categoryName.toUpperCase()}
            </AppText>
          ) : null}

          <AppText variant="display" style={styles.recipeTitle}>
            {recipe.name}
          </AppText>

          {meta ? (
            <AppText tone="muted" style={styles.metaSubtitle}>
              {meta}
            </AppText>
          ) : null}

          {recipe.description ? <AppText style={styles.descriptionText}>{recipe.description}</AppText> : null}

          {!imageUri ? (
            <View style={styles.favInline}>
              <FavoriteButton recipeId={recipe.id} />
            </View>
          ) : null}
        </View>

        {/* Servings & Ingredients Block */}
        <View style={styles.cardBlock}>
          <AppText variant="title" style={styles.blockTitle}>
            Nguyên liệu
          </AppText>

          {canScale ? (
            <View style={styles.servingsCard} testID="servings-stepper">
              <View style={styles.servingsLeft}>
                <AppText variant="label" style={styles.servingsLabel}>
                  Khẩu phần
                </AppText>
                <AppText variant="heading" accessibilityLiveRegion="polite" testID="servings-value">
                  {`${servings} người`}
                </AppText>
              </View>

              <View style={styles.stepperBtns}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Giảm khẩu phần"
                  disabled={servings <= MIN_SERVINGS}
                  onPress={() => setServings((s) => clampServings(s - 1))}
                  style={[styles.stepBtn, servings <= MIN_SERVINGS ? styles.stepOff : null]}
                >
                  <AppText variant="title" style={styles.stepBtnText}>−</AppText>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Tăng khẩu phần"
                  disabled={servings >= MAX_SERVINGS}
                  onPress={() => setServings((s) => clampServings(s + 1))}
                  style={[styles.stepBtn, servings >= MAX_SERVINGS ? styles.stepOff : null]}
                >
                  <AppText variant="title" style={styles.stepBtnText}>+</AppText>
                </Pressable>

                {servings !== base ? (
                  <Button title={`Về ${base} người`} variant="ghost" fullWidth={false} onPress={() => setServings(base)} />
                ) : null}
              </View>
            </View>
          ) : (
            <AppText tone="muted">Chưa rõ khẩu phần gốc nên không thể điều chỉnh.</AppText>
          )}

          {recipe.servingBasis || recipe.servingNote ? (
            <AppText variant="caption" tone="muted">
              {joinMeta([recipe.servingBasis ? SERVING_BASIS_LABEL[recipe.servingBasis] : null, recipe.servingNote])}
            </AppText>
          ) : null}

          <IngredientRows ingredients={recipe.ingredients} defaultServings={base} servings={servings} />
        </View>

        {/* Steps Block */}
        <View style={styles.cardBlock}>
          <View style={styles.stepsHeader}>
            <AppText variant="title" style={styles.blockTitle}>
              Cách làm ({recipe.steps.length} bước)
            </AppText>
          </View>

          <VideoButton recipeId={recipe.id} />

          {recipe.steps.length === 0 ? (
            <AppText tone="muted">Chưa có các bước thực hiện.</AppText>
          ) : (
            recipe.steps.map((s) => (
              <View key={s.stepNumber} style={styles.stepCard} testID="step-row">
                <View style={styles.stepBadge}>
                  <AppText variant="label" tone="onPrimary">
                    {s.stepNumber}
                  </AppText>
                </View>
                <View style={styles.stepBody}>
                  <AppText style={styles.stepInstruction}>{s.instruction}</AppText>
                  {s.timerEnabled && s.durationSeconds !== null ? (
                    <View style={styles.timerPill}>
                      <AppText variant="caption" tone="primary" style={styles.timerText}>
                        {`Hẹn giờ ${formatSeconds(s.durationSeconds)}`}
                      </AppText>
                    </View>
                  ) : null}
                </View>
              </View>
            ))
          )}
        </View>

        {/* Nutrition Section */}
        <View style={styles.cardBlock}>
          <NutritionSection recipeId={recipe.id} />
        </View>

        {/* Ratings Section */}
        <View style={styles.cardBlock}>
          <RatingSection recipeId={recipe.id} />
        </View>

        {/* Cooking Photos */}
        <View style={styles.cardBlock}>
          <CookingPhotoSection recipeId={recipe.id} />
        </View>

        {/* Comments Section */}
        <View style={styles.cardBlock}>
          <CommentSection recipeId={recipe.id} />
        </View>

        {recipe.source ? (
          <View style={styles.sourceBlock} testID="recipe-source">
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

      {/* Sticky Bottom Bar for instant action (cooking-recipes vibe) */}
      <SafeAreaView edges={['bottom']} style={styles.stickyBottomBar}>
        <View style={styles.bottomBarRow}>
          <View style={styles.bottomBarShopping}>
            <AddToShoppingButton recipe={recipe} servings={servings} />
          </View>
          {recipe.steps.length > 0 ? (
            <View style={styles.bottomBarCook}>
              <Button title="Bắt đầu nấu" onPress={() => onCook(servings)} />
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 100 },
  coverWrapper: {
    position: 'relative',
    width: '100%',
    aspectRatio: 16 / 10,
    backgroundColor: colors.surfaceMuted,
  },
  cover: { width: '100%', height: '100%' },
  coverFloating: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: radius.pill,
    padding: 2,
    ...shadows.subtle,
  },
  headerBlock: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  categoryPill: {
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  recipeTitle: {
    fontSize: 26,
    lineHeight: 34,
    fontWeight: '800',
    color: colors.text,
  },
  metaSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  descriptionText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
  },
  favInline: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
  cardBlock: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  blockTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  servingsCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.subtle,
  },
  servingsLeft: {
    gap: 2,
  },
  servingsLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },
  stepperBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stepBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: {
    fontSize: 20,
    lineHeight: 24,
  },
  stepOff: { opacity: 0.3 },
  stepsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepCard: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.subtle,
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBody: {
    flex: 1,
    gap: spacing.xs,
  },
  stepInstruction: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
  },
  timerPill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.xs,
    marginTop: 2,
  },
  timerText: {
    fontWeight: '600',
    fontSize: 12,
  },
  sourceBlock: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    gap: 4,
  },
  stickyBottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    ...shadows.card,
  },
  bottomBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  bottomBarShopping: {
    flex: 1,
  },
  bottomBarCook: {
    flex: 1.4,
  },
});
