import type { RootStackScreenProps } from '@/app/navigation/types';
import { AppText } from '@/components/AppText';
import { Screen } from '@/components/Screen';

// Placeholder until step 2.3 (detail, servings).
export function RecipeDetailScreen({ route }: RootStackScreenProps<'RecipeDetail'>) {
  return (
    <Screen testID="recipe-detail">
      <AppText variant="title">{route.params.slug}</AppText>
    </Screen>
  );
}
