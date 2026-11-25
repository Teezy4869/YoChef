import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet, View } from "react-native";

import type { RootStackParamList } from "@/app/navigation/types";
import { AppIcon } from "@/components/AppIcon";
import { AppImage } from "@/components/AppImage";
import { AppText } from "@/components/AppText";
import { useAuth } from "@/features/auth/AuthProvider";
import { useFavorites } from "@/features/favorites/FavoritesProvider";
import { triggerHaptic } from "@/lib/haptics";
import { colors, radius, shadows, spacing } from "@/theme/tokens";

import { joinMeta, servingsLabel, timeLabel } from "./format";
import {
  DIFFICULTY_LABEL,
  DIFFICULTY_TONE,
  type Difficulty,
  type RecipeSummary,
} from "./types";

const DIFFICULTY_TRAFFIC_COLOR: Record<Difficulty, string> = {
  easy: "#16A34A",
  medium: "#CA8A04",
  hard: "#DC2626",
};

const DIFFICULTY_PILL_BG: Record<Difficulty, string> = {
  easy: "#DCFCE7",
  medium: "#FEF9C3",
  hard: "#FEE2E2",
};

const DIFFICULTY_PILL_BORDER: Record<Difficulty, string> = {
  easy: "#86EFAC",
  medium: "#FDE047",
  hard: "#FCA5A5",
};

const DIFFICULTY_TEXT_COLOR: Record<Difficulty, string> = {
  easy: "#15803D",
  medium: "#A16207",
  hard: "#DC2626",
};

export function RecipeCard({
  recipe,
  imageUri,
  pantryBadge,
  pantryTone = "info",
  variant = "default",
  onPress,
}: {
  recipe: RecipeSummary;
  imageUri: string | null;
  pantryBadge?: string;
  pantryTone?: "success" | "info";
  variant?: "default" | "compact";
  onPress: () => void;
}) {
  const { status } = useAuth();
  const { isFavorite, toggle } = useFavorites();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const favorited = status === "signedIn" && isFavorite(recipe.id);

  const time = timeLabel(recipe.prepTimeMinutes, recipe.cookTimeMinutes);
  const servings = servingsLabel(recipe.defaultServings);
  const difficulty = recipe.difficulty
    ? DIFFICULTY_LABEL[recipe.difficulty]
    : null;
  const difficultyTone = recipe.difficulty
    ? DIFFICULTY_TONE[recipe.difficulty]
    : null;
  const meta = joinMeta([time, servings, difficulty]);

  const handleToggleFavorite = () => {
    triggerHaptic("light");
    if (status !== "signedIn") {
      navigation.navigate("SignIn");
      return;
    }
    void toggle(recipe.id);
  };

  if (variant === "compact") {
    return (
      <View style={styles.cardWrap}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${recipe.name}. ${meta}`}
          onPress={onPress}
          style={({ pressed }) => [
            styles.compactCard,
            pressed ? styles.pressed : null,
          ]}
        >
          <AppImage
            uri={imageUri}
            style={styles.compactImage}
            testID="recipe-card-image"
            fallbackTestID="recipe-card-no-image"
            fallbackText="Chưa có ảnh"
          />
          <View style={styles.compactBody}>
            <AppText
              variant="heading"
              numberOfLines={1}
              style={styles.compactTitle}
            >
              {recipe.name}
            </AppText>
            {recipe.categoryName || time ? (
              <View style={styles.compactMetaRow}>
                {recipe.categoryName ? (
                  <AppText
                    variant="caption"
                    tone="primary"
                    numberOfLines={1}
                    style={styles.compactCategory}
                  >
                    {recipe.categoryName}
                  </AppText>
                ) : null}
                {recipe.categoryName && time ? (
                  <AppText
                    variant="caption"
                    tone="muted"
                    style={styles.compactDot}
                  >
                    ·
                  </AppText>
                ) : null}
                {time ? (
                  <View style={styles.compactMetaItem}>
                    <AppIcon name="time-outline" size={12} tone="muted" />
                    <AppText
                      variant="caption"
                      tone="muted"
                      numberOfLines={1}
                      style={styles.compactMetaText}
                    >
                      {time}
                    </AppText>
                  </View>
                ) : null}
              </View>
            ) : null}
            {difficulty && recipe.difficulty && difficultyTone ? (
              <View style={styles.compactDifficultyRow}>
                <View
                  style={[
                    styles.compactDifficultyPill,
                    {
                      backgroundColor: DIFFICULTY_PILL_BG[recipe.difficulty],
                      borderColor: DIFFICULTY_PILL_BORDER[recipe.difficulty],
                    },
                  ]}
                >
                  <AppIcon
                    name="flame-outline"
                    size={11}
                    color={DIFFICULTY_TRAFFIC_COLOR[recipe.difficulty]}
                  />
                  <AppText
                    variant="caption"
                    style={[
                      styles.compactDifficultyText,
                      { color: DIFFICULTY_TEXT_COLOR[recipe.difficulty] },
                    ]}
                  >
                    {difficulty}
                  </AppText>
                </View>
              </View>
            ) : null}
          </View>
          <View style={styles.compactFavSpacer} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            favorited
              ? `Bỏ ${recipe.name} khỏi yêu thích`
              : `Lưu ${recipe.name} vào yêu thích`
          }
          accessibilityState={{ selected: favorited }}
          onPress={handleToggleFavorite}
          hitSlop={6}
          style={({ pressed }) => [
            styles.compactFavBtn,
            pressed ? styles.favPressed : null,
          ]}
        >
          <AppIcon
            name={favorited ? "heart-dislike-outline" : "heart-outline"}
            size={18}
            tone={favorited ? "muted" : "default"}
          />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.cardWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${recipe.name}. ${meta}`}
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}
      >
        <View style={styles.mediaWrap}>
          <AppImage
            uri={imageUri}
            style={styles.image}
            testID="recipe-card-image"
            fallbackTestID="recipe-card-no-image"
            fallbackText="Chưa có ảnh"
          />
          {imageUri ? (
            <LinearGradient
              colors={[
                "rgba(31,26,23,0.08)",
                "transparent",
                "rgba(31,26,23,0.45)",
              ]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
          ) : null}
          {recipe.categoryName ? (
            <View style={styles.categoryPill}>
              <AppText variant="caption" style={styles.categoryText}>
                {recipe.categoryName}
              </AppText>
            </View>
          ) : null}
        </View>

        <View style={styles.body}>
          <AppText variant="heading" numberOfLines={2} style={styles.title}>
            {recipe.name}
          </AppText>

          {time || servings || difficulty ? (
            <View style={styles.metaRow}>
              {time ? (
                <View style={styles.metaChip}>
                  <AppIcon name="time-outline" size={14} tone="muted" />
                  <AppText variant="caption" tone="muted">
                    {time}
                  </AppText>
                </View>
              ) : null}
              {servings ? (
                <View style={styles.metaChip}>
                  <AppIcon name="people-outline" size={14} tone="muted" />
                  <AppText variant="caption" tone="muted">
                    {servings}
                  </AppText>
                </View>
              ) : null}
              {difficulty && recipe.difficulty ? (
                <View style={styles.metaChip}>
                  <AppIcon
                    name="flame-outline"
                    size={14}
                    color={DIFFICULTY_TRAFFIC_COLOR[recipe.difficulty]}
                  />
                  <AppText
                    variant="caption"
                    style={[
                      styles.difficultyText,
                      { color: DIFFICULTY_TRAFFIC_COLOR[recipe.difficulty] },
                    ]}
                  >
                    {difficulty}
                  </AppText>
                </View>
              ) : null}
            </View>
          ) : null}

          {pantryBadge ? (
            <View
              style={[
                styles.badge,
                pantryTone === "success"
                  ? styles.badgeSuccess
                  : styles.badgeInfo,
              ]}
            >
              <AppIcon
                name={
                  pantryTone === "success"
                    ? "checkmark-circle"
                    : "basket-outline"
                }
                size={14}
                tone={pantryTone === "success" ? "success" : "primary"}
              />
              <AppText
                variant="caption"
                tone={pantryTone === "success" ? "success" : "primary"}
              >
                {pantryBadge}
              </AppText>
            </View>
          ) : null}
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          favorited
            ? `Bỏ ${recipe.name} khỏi yêu thích`
            : `Lưu ${recipe.name} vào yêu thích`
        }
        accessibilityState={{ selected: favorited }}
        onPress={handleToggleFavorite}
        hitSlop={6}
        style={({ pressed }) => [
          styles.favBtn,
          pressed ? styles.favPressed : null,
        ]}
      >
        <AppIcon
          name={favorited ? "heart" : "heart-outline"}
          size={19}
          tone={favorited ? "primary" : "default"}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrap: {
    position: "relative",
  },
  card: {
    borderRadius: radius.lg,
    borderCurve: "continuous",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadows.card,
  },
  pressed: {
    opacity: 0.94,
    transform: [{ scale: 0.992 }],
  },
  mediaWrap: {
    position: "relative",
    width: "100%",
    aspectRatio: 16 / 7.5,
    backgroundColor: colors.surfaceMuted,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  categoryPill: {
    position: "absolute",
    left: spacing.sm,
    bottom: spacing.sm,
    backgroundColor: colors.overlayChip,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  categoryText: {
    fontWeight: "600",
    color: colors.text,
  },
  favBtn: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.overlayChip,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.card,
  },
  favPressed: {
    transform: [{ scale: 0.92 }],
  },
  body: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  title: {
    fontSize: 16,
    lineHeight: 22,
  },
  compactCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.xs,
    borderRadius: radius.md,
    borderCurve: "continuous",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  compactImage: {
    width: 68,
    height: 68,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  compactBody: {
    flex: 1,
    gap: 3,
    justifyContent: "center",
  },
  compactTitle: {
    fontSize: 15,
    lineHeight: 20,
  },
  compactMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  compactMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  compactDot: {
    fontSize: 12,
    lineHeight: 16,
  },
  compactCategory: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    flexShrink: 1,
  },
  compactMetaText: {
    fontSize: 12,
    lineHeight: 16,
  },
  compactDifficultyRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 1,
  },
  compactDifficultyPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.sm,
  },
  compactDifficultyText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
  },
  compactFavSpacer: {
    width: 36,
  },
  compactFavBtn: {
    position: "absolute",
    right: spacing.sm,
    top: "50%",
    marginTop: -18,
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.card,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.xxs,
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  difficultyText: {
    fontWeight: "600",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    marginTop: spacing.xs,
  },
  badgeSuccess: { backgroundColor: colors.successSoft },
  badgeInfo: { backgroundColor: colors.primarySoft },
});
