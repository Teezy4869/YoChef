import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { FavoriteButton } from '@/features/favorites/FavoriteButton';
import { colors, radius, shadows, spacing } from '@/theme/tokens';

import { formatMinutes, joinMeta, servingsLabel, timeLabel, totalMinutes } from './format';
import { DIFFICULTY_LABEL, type RecipeSummary } from './types';

export function RecipeCard({
  recipe,
  imageUri,
  onPress,
}: {
  recipe: RecipeSummary;
  imageUri: string | null;
  onPress: () => void;
}) {
  const time = totalMinutes(recipe.prepTimeMinutes, recipe.cookTimeMinutes);
  const meta = joinMeta([
    timeLabel(recipe.prepTimeMinutes, recipe.cookTimeMinutes),
    servingsLabel(recipe.defaultServings),
    recipe.difficulty ? DIFFICULTY_LABEL[recipe.difficulty] : null,
  ]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${recipe.name}. ${meta}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}
    >
      <View style={styles.imageContainer}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" testID="recipe-card-image" />
        ) : (
          <View style={[styles.image, styles.noImage]} testID="recipe-card-no-image">
            <Ionicons name="restaurant-outline" size={32} color={colors.textMuted} />
            <AppText variant="caption" tone="muted">
              Chưa có ảnh
            </AppText>
          </View>
        )}

        {/* Favorite Floating Button */}
        <View style={styles.favoriteFloating}>
          <FavoriteButton recipeId={recipe.id} />
        </View>

        {/* Difficulty Badge Floating */}
        {recipe.difficulty ? (
          <View style={styles.difficultyBadge}>
            <AppText variant="caption" style={styles.difficultyText}>
              {DIFFICULTY_LABEL[recipe.difficulty]}
            </AppText>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        {recipe.categoryName ? (
          <AppText variant="caption" tone="primary" style={styles.categoryText}>
            {recipe.categoryName.toUpperCase()}
          </AppText>
        ) : null}

        <AppText variant="heading" numberOfLines={2} style={styles.name}>
          {recipe.name}
        </AppText>

        {/* Meta badges with Icons */}
        <View style={styles.metaRow}>
          {time !== null ? (
            <View style={styles.metaBadge}>
              <Ionicons name="time-outline" size={14} color={colors.textMuted} />
              <AppText variant="caption" tone="muted">
                {formatMinutes(time)}
              </AppText>
            </View>
          ) : null}

          {recipe.defaultServings ? (
            <View style={styles.metaBadge}>
              <Ionicons name="people-outline" size={14} color={colors.textMuted} />
              <AppText variant="caption" tone="muted">
                {servingsLabel(recipe.defaultServings)}
              </AppText>
            </View>
          ) : null}
        </View>

        {/* Hidden full string for screen-reader & test assertions */}
        {meta ? (
          <AppText variant="caption" tone="muted" style={styles.screenReaderMeta}>
            {meta}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  pressed: {
    opacity: 0.94,
    transform: [{ scale: 0.99 }],
  },
  imageContainer: {
    position: 'relative',
    width: '100%',
    height: 190,
    backgroundColor: colors.surfaceMuted,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  noImage: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  favoriteFloating: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: radius.pill,
    padding: 2,
    ...shadows.subtle,
  },
  difficultyBadge: {
    position: 'absolute',
    bottom: spacing.md,
    left: spacing.md,
    backgroundColor: 'rgba(17, 24, 39, 0.8)',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  difficultyText: {
    color: colors.textInverse,
    fontWeight: '700',
    fontSize: 12,
  },
  body: {
    padding: spacing.lg,
    gap: spacing.xs,
  },
  categoryText: {
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  name: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    color: colors.text,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  screenReaderMeta: {
    fontSize: 12,
    marginTop: 2,
  },
});
