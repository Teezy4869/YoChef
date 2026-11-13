import { Image, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { colors, radius, spacing } from '@/theme/tokens';

import { joinMeta, servingsLabel, timeLabel } from './format';
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
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" testID="recipe-card-image" />
      ) : (
        <View style={[styles.image, styles.noImage]} testID="recipe-card-no-image">
          <AppText variant="caption" tone="muted">
            Chưa có ảnh
          </AppText>
        </View>
      )}
      <View style={styles.body}>
        <AppText variant="heading" numberOfLines={2}>
          {recipe.name}
        </AppText>
        {recipe.categoryName ? (
          <AppText variant="caption" tone="primary">
            {recipe.categoryName}
          </AppText>
        ) : null}
        {meta ? (
          <AppText variant="caption" tone="muted">
            {meta}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { backgroundColor: colors.surfaceMuted },
  image: { width: 96, height: 96, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted },
  noImage: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: spacing.xxs, justifyContent: 'center' },
});
