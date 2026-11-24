import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { RootStackScreenProps } from "@/app/navigation/types";
import { AppIcon } from "@/components/AppIcon";
import { AppImage } from "@/components/AppImage";
import { AppText } from "@/components/AppText";
import { Banner } from "@/components/Banner";
import { BottomSheetModal } from "@/components/BottomSheetModal";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { Screen } from "@/components/Screen";
import { useAuth } from "@/features/auth/AuthProvider";
import { CommentSection } from "@/features/community/CommentSection";
import { CookingPhotoSection } from "@/features/community/CookingPhotoSection";
import { FavoriteButton } from "@/features/favorites/FavoriteButton";
import { NutritionSection } from "@/features/nutrition/NutritionSection";
import { checkRecipeAvailability } from "@/features/pantry/pantryApi";
import { usePantry } from "@/features/pantry/usePantry";
import { RatingSection } from "@/features/ratings/RatingSection";
import { formatSeconds, joinMeta, timeLabel } from "@/features/recipes/format";
import { IngredientRows } from "@/features/recipes/IngredientRows";
import { coverUrl } from "@/features/recipes/recipeApi";
import {
  clampServings,
  MAX_SERVINGS,
  MIN_SERVINGS,
} from "@/features/recipes/servings";
import {
  DIFFICULTY_LABEL,
  type IngredientLine,
  type RecipeDetail,
  type ServingBasis,
} from "@/features/recipes/types";
import { useRecipeDetail } from "@/features/recipes/useRecipeDetail";
import { AddToShoppingButton } from "@/features/shopping/AddToShoppingButton";
import { VideoButton } from "@/features/videos/VideoButton";
import { triggerHaptic } from "@/lib/haptics";
import { useSupabase } from "@/lib/supabase";
import { colors, radius, shadows, spacing, touchTarget } from "@/theme/tokens";

const SERVING_BASIS_LABEL: Record<ServingBasis, string> = {
  book: "Khẩu phần theo sách",
  editor_estimate: "Khẩu phần do biên tập ước tính",
  inferred_yield: "Khẩu phần suy ra từ thành phẩm",
};

export function RecipeDetailScreen({
  route,
  navigation,
}: RootStackScreenProps<"RecipeDetail">) {
  const supabase = useSupabase();
  const { loading, error, recipe, notFound, retry } = useRecipeDetail(
    supabase,
    route.params.slug,
  );

  if (loading) {
    return (
      <Screen centered testID="recipe-detail-loading">
        <ActivityIndicator
          color={colors.primary}
          size="large"
          accessibilityLabel="Đang tải công thức"
        />
      </Screen>
    );
  }
  if (error) {
    return (
      <Screen centered testID="recipe-detail-error">
        <EmptyState
          icon="cloud-offline-outline"
          tone="danger"
          title="Không tải được công thức"
          message={error}
          action={
            <>
              <Button title="Thử lại" icon="refresh" onPress={retry} />
              {navigation.canGoBack() ? (
                <Button
                  title="Quay lại"
                  variant="ghost"
                  onPress={() => navigation.goBack()}
                />
              ) : null}
            </>
          }
        />
      </Screen>
    );
  }
  if (notFound || !recipe) {
    return (
      <Screen centered testID="recipe-detail-notfound">
        <EmptyState
          icon="restaurant-outline"
          tone="muted"
          title="Không tìm thấy công thức"
          message="Công thức này không tồn tại hoặc chưa được công bố."
          action={
            navigation.canGoBack() ? (
              <Button
                title="Quay lại"
                variant="secondary"
                onPress={() => navigation.goBack()}
              />
            ) : undefined
          }
        />
      </Screen>
    );
  }
  // Mounted only once the recipe exists, so servings can start from its default.
  return (
    <RecipeDetailView
      recipe={recipe}
      imageUri={coverUrl(supabase, recipe.coverImagePath)}
      onCook={(servings) =>
        navigation.navigate("CookingMode", { slug: recipe.slug, servings })
      }
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
  const supabase = useSupabase();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { status, session } = useAuth();
  const userId = status === "signedIn" && session ? session.user.id : null;
  const pantry = usePantry(supabase, userId);
  const { reload: reloadPantry } = pantry;
  const didMountFocus = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!didMountFocus.current) {
        didMountFocus.current = true;
        return;
      }
      if (userId) reloadPantry();
    }, [userId, reloadPantry]),
  );

  const base = recipe.defaultServings;
  const [servings, setServings] = useState(base ?? MIN_SERVINGS);
  const canScale = base !== null;
  const [shopNotice, setShopNotice] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [showMissingModal, setShowMissingModal] = useState(false);
  const [addingMissing, setAddingMissing] = useState(false);

  const availability = useMemo(
    () =>
      userId && !pantry.loading && !pantry.error
        ? checkRecipeAvailability(recipe, servings, pantry.items)
        : null,
    [userId, pantry.loading, pantry.error, pantry.items, recipe, servings],
  );

  const addSingleMissing = async (line: IngredientLine) => {
    if (!userId) return;
    setShopNotice(null);
    try {
      const { addIngredientLines } =
        await import("@/features/shopping/shoppingApi");
      await addIngredientLines(supabase, userId, [line], base, servings);
      triggerHaptic("success");
      setShopNotice({
        tone: "success",
        text: `Đã thêm "${line.name}" vào danh sách đi chợ.`,
      });
    } catch (e) {
      setShopNotice({
        tone: "error",
        text: e instanceof Error ? e.message : "Không thêm được vào đi chợ.",
      });
    }
  };

  const addAllMissingAndClose = async () => {
    if (!userId || !availability) return;
    setAddingMissing(true);
    try {
      const { addIngredientLines } =
        await import("@/features/shopping/shoppingApi");
      const lines = availability.missingOrInsufficient.map((m) => m.line);
      await addIngredientLines(supabase, userId, lines, base, servings);
      triggerHaptic("success");
      setShowMissingModal(false);
      setShopNotice({
        tone: "success",
        text: `Đã thêm ${lines.length} nguyên liệu còn thiếu vào danh sách đi chợ.`,
      });
    } catch (e) {
      setShopNotice({
        tone: "error",
        text: e instanceof Error ? e.message : "Không thêm được vào đi chợ.",
      });
      setShowMissingModal(false);
    } finally {
      setAddingMissing(false);
    }
  };

  const handleStartCook = () => {
    if (availability && availability.missingOrInsufficient.length > 0) {
      setShowMissingModal(true);
      return;
    }
    onCook(servings);
  };

  const time = timeLabel(recipe.prepTimeMinutes, recipe.cookTimeMinutes);
  const difficulty = recipe.difficulty
    ? DIFFICULTY_LABEL[recipe.difficulty]
    : null;
  const hasStickyBar = recipe.steps.length > 0;

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.root}
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: (hasStickyBar ? 112 : spacing.xxxl) + insets.bottom,
          },
        ]}
        testID="recipe-detail"
      >
        {imageUri ? (
          <View style={styles.heroWrap}>
            <AppImage
              uri={imageUri}
              style={styles.cover}
              accessibilityLabel={recipe.name}
            />
            <LinearGradient
              colors={[colors.scrimTop, "transparent", colors.scrimBottom]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
          </View>
        ) : (
          <View
            style={[
              styles.noHeroBanner,
              { paddingTop: insets.top + spacing.xxl },
            ]}
          >
            <AppIcon name="restaurant-outline" size={32} tone="primary" />
          </View>
        )}

        <View style={[styles.floatingNav, { top: insets.top + spacing.sm }]}>
          {navigation.canGoBack() ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Quay lại"
              onPress={() => navigation.goBack()}
              style={styles.navPill}
            >
              <AppIcon name="arrow-back" size={20} tone="default" />
            </Pressable>
          ) : (
            <View />
          )}
        </View>

        <View style={styles.bodyStack}>
          <View style={styles.overviewCard}>
            {recipe.categoryName ? (
              <View style={styles.categoryTag}>
                <AppText
                  variant="caption"
                  tone="primary"
                  style={styles.categoryTagText}
                >
                  {recipe.categoryName}
                </AppText>
              </View>
            ) : null}
            <AppText variant="display">{recipe.name}</AppText>
            {time || difficulty ? (
              <View style={styles.metaPills}>
                {time ? (
                  <View style={styles.metaPill}>
                    <AppIcon name="time-outline" size={15} tone="muted" />
                    <AppText variant="caption" tone="muted">
                      {time}
                    </AppText>
                  </View>
                ) : null}
                {difficulty ? (
                  <View style={styles.metaPill}>
                    <AppIcon name="flame-outline" size={15} tone="primary" />
                    <AppText variant="caption" tone="muted">
                      {difficulty}
                    </AppText>
                  </View>
                ) : null}
              </View>
            ) : null}
            {recipe.description ? (
              <AppText>{recipe.description}</AppText>
            ) : null}
            <FavoriteButton recipeId={recipe.id} />
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.sectionHead}>
              <AppIcon name="list-outline" size={20} tone="primary" />
              <AppText variant="title">Nguyên liệu</AppText>
            </View>

            {canScale ? (
              <View style={styles.stepper} testID="servings-stepper">
                <View style={styles.stepperPill}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Giảm khẩu phần"
                    disabled={servings <= MIN_SERVINGS}
                    onPress={() => {
                      triggerHaptic("light");
                      setServings((s) => clampServings(s - 1));
                    }}
                    style={[
                      styles.stepBtn,
                      servings <= MIN_SERVINGS ? styles.stepOff : null,
                    ]}
                  >
                    <AppIcon name="remove" size={18} tone="default" />
                  </Pressable>
                  <AppText
                    variant="heading"
                    tabularNums
                    accessibilityLiveRegion="polite"
                    testID="servings-value"
                    style={styles.servingsValue}
                  >
                    {`${servings} người`}
                  </AppText>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Tăng khẩu phần"
                    disabled={servings >= MAX_SERVINGS}
                    onPress={() => {
                      triggerHaptic("light");
                      setServings((s) => clampServings(s + 1));
                    }}
                    style={[
                      styles.stepBtn,
                      servings >= MAX_SERVINGS ? styles.stepOff : null,
                    ]}
                  >
                    <AppIcon name="add" size={18} tone="default" />
                  </Pressable>
                </View>
                {servings !== base ? (
                  <Button
                    title={`Về ${base} người`}
                    variant="soft"
                    size="sm"
                    fullWidth={false}
                    onPress={() => setServings(base)}
                  />
                ) : null}
              </View>
            ) : (
              <AppText tone="muted">
                Chưa rõ khẩu phần gốc nên không thể điều chỉnh.
              </AppText>
            )}

            {recipe.servingBasis || recipe.servingNote ? (
              <AppText variant="caption" tone="muted">
                {joinMeta([
                  recipe.servingBasis
                    ? SERVING_BASIS_LABEL[recipe.servingBasis]
                    : null,
                  recipe.servingNote,
                ])}
              </AppText>
            ) : null}

            <IngredientRows
              ingredients={recipe.ingredients}
              defaultServings={base}
              servings={servings}
              availability={availability?.lines}
              onAddMissing={userId ? addSingleMissing : undefined}
            />
            {shopNotice ? (
              <Banner tone={shopNotice.tone} message={shopNotice.text} />
            ) : null}
            <AddToShoppingButton recipe={recipe} servings={servings} />
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.sectionHead}>
              <AppIcon name="flame-outline" size={20} tone="primary" />
              <AppText variant="title">Cách làm</AppText>
            </View>
            <VideoButton recipeId={recipe.id} />
            {recipe.steps.length === 0 ? (
              <AppText tone="muted">Chưa có các bước thực hiện.</AppText>
            ) : (
              <View style={styles.timeline}>
                {recipe.steps.map((s, idx) => {
                  const isLast = idx === recipe.steps.length - 1;
                  return (
                    <View
                      key={s.stepNumber}
                      style={styles.step}
                      testID="step-row"
                    >
                      <View style={styles.stepRail}>
                        <View style={styles.badge}>
                          <AppText variant="label" tone="onPrimary" tabularNums>
                            {s.stepNumber}
                          </AppText>
                        </View>
                        {!isLast ? <View style={styles.railLine} /> : null}
                      </View>
                      <View style={styles.stepBody}>
                        <AppText>{s.instruction}</AppText>
                        {s.timerEnabled && s.durationSeconds !== null ? (
                          <View style={styles.timerChip}>
                            <AppIcon
                              name="timer-outline"
                              size={14}
                              tone="primary"
                            />
                            <AppText
                              variant="caption"
                              tone="primary"
                              style={styles.timerChipText}
                            >
                              {`Hẹn giờ ${formatSeconds(s.durationSeconds)}`}
                            </AppText>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          <View style={styles.sectionCard}>
            <NutritionSection recipeId={recipe.id} />
          </View>

          <View style={styles.sectionCard}>
            <RatingSection recipeId={recipe.id} />
          </View>

          <View style={styles.sectionCard}>
            <CookingPhotoSection recipeId={recipe.id} />
          </View>

          <View style={styles.sectionCard}>
            <CommentSection recipeId={recipe.id} />
          </View>

          {recipe.source ? (
            <View style={styles.sourceBox} testID="recipe-source">
              <AppIcon name="book-outline" size={16} tone="muted" />
              <View style={styles.sourceCopy}>
                <AppText variant="caption" tone="muted">
                  {`Nguồn: ${joinMeta([recipe.source.title, recipe.source.compiler, recipe.source.publicationYear?.toString()])}`}
                </AppText>
                {recipe.source.usageNote ? (
                  <AppText variant="caption" tone="muted">
                    {recipe.source.usageNote}
                  </AppText>
                ) : null}
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {hasStickyBar ? (
        <View
          style={[
            styles.stickyBar,
            { paddingBottom: Math.max(spacing.md, insets.bottom) },
          ]}
        >
          <View style={styles.stickyMeta}>
            <AppText variant="label">{`${recipe.steps.length} bước nấu`}</AppText>
            <AppText variant="caption" tone="muted">
              {canScale
                ? `Cho ${servings} người`
                : (time ?? "Sẵn sàng vào bếp")}
            </AppText>
          </View>
          <View style={styles.stickyAction}>
            <Button
              title="Bắt đầu nấu"
              icon="flame-outline"
              onPress={handleStartCook}
            />
          </View>
        </View>
      ) : null}

      <BottomSheetModal
        visible={Boolean(showMissingModal && availability)}
        title="Tủ lạnh chưa đủ nguyên liệu"
        subtitle="Nguyên liệu trong tủ của bạn chưa đủ để nấu món này. Bạn cần mua thêm:"
        onClose={() => setShowMissingModal(false)}
        testID="missing-ingredients-modal"
        footer={
          <View style={styles.modalActions}>
            <Button
              title="Vẫn tiếp tục nấu"
              icon="flame-outline"
              onPress={() => {
                setShowMissingModal(false);
                onCook(servings);
              }}
              testID="continue-cook-btn"
            />
            <Button
              title="Thêm đồ thiếu vào Đi chợ"
              variant="secondary"
              icon="basket-outline"
              loading={addingMissing}
              onPress={addAllMissingAndClose}
              testID="add-missing-shopping-btn"
            />
            <Button
              title="Đóng"
              variant="ghost"
              onPress={() => setShowMissingModal(false)}
            />
          </View>
        }
      >
        <View style={styles.missingList}>
          {(availability?.missingOrInsufficient ?? []).map((m) => (
            <AppText key={m.line.sortOrder} variant="label">
              {`• ${m.line.name}${m.status === "insufficient" ? " (chưa đủ lượng)" : ""}`}
            </AppText>
          ))}
        </View>
      </BottomSheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  root: { flex: 1, backgroundColor: colors.background },
  content: { gap: spacing.md },
  heroWrap: {
    position: "relative",
    width: "100%",
    aspectRatio: 16 / 10,
    backgroundColor: colors.surfaceMuted,
  },
  cover: { width: "100%", height: "100%" },
  noHeroBanner: {
    width: "100%",
    paddingBottom: spacing.xl,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  floatingNav: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    flexDirection: "row",
    justifyContent: "space-between",
    zIndex: 10,
  },
  navPill: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.overlayChip,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.card,
  },
  bodyStack: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  overviewCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  categoryTag: {
    alignSelf: "flex-start",
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  categoryTagText: { fontWeight: "600" },
  metaPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  stepperPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    padding: spacing.xs,
  },
  stepBtn: {
    width: touchTarget - 10,
    height: touchTarget - 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  servingsValue: {
    minWidth: 74,
    textAlign: "center",
  },
  stepOff: { opacity: 0.4 },
  timeline: { gap: spacing.xs },
  step: { flexDirection: "row", gap: spacing.md },
  stepRail: { alignItems: "center", width: 28 },
  badge: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  railLine: {
    flex: 1,
    width: 2,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  stepBody: { flex: 1, gap: spacing.xs, paddingBottom: spacing.md },
  timerChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    alignSelf: "flex-start",
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  timerChipText: { fontWeight: "600" },
  sourceBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  sourceCopy: { flex: 1, gap: spacing.xxs },
  stickyBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadows.floating,
  },
  stickyMeta: {
    gap: spacing.xxs,
  },
  stickyAction: {
    flex: 1,
  },
  missingList: { gap: spacing.sm },
  missingRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  missingName: { flex: 1 },
  modalActions: { gap: spacing.xs },
});
