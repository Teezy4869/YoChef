import { ActivityIndicator, FlatList, StyleSheet } from 'react-native';

import type { MainTabScreenProps } from '@/app/navigation/types';
import { AppText } from '@/components/AppText';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { SignInPrompt } from '@/components/SignInPrompt';
import { useAuth } from '@/features/auth/AuthProvider';
import { useFavorites } from '@/features/favorites/FavoritesProvider';
import { RecipeCard } from '@/features/recipes/RecipeCard';
import { coverUrl } from '@/features/recipes/recipeApi';
import { useSupabase } from '@/lib/supabase';
import { colors, spacing } from '@/theme/tokens';

export function FavoritesScreen({ navigation }: MainTabScreenProps<'Favorites'>) {
  const supabase = useSupabase();
  const { status } = useAuth();
  const { items, loading, error, reload } = useFavorites();

  if (status !== 'signedIn') {
    return (
      <SignInPrompt
        title="Yêu thích"
        message="Đăng nhập để lưu những món bạn muốn nấu lại."
        testID="favorites-guest"
      />
    );
  }
  if (loading && items.length === 0) {
    return (
      <Screen centered testID="favorites-loading">
        <ActivityIndicator color={colors.primary} size="large" accessibilityLabel="Đang tải món yêu thích" />
      </Screen>
    );
  }
  if (error && items.length === 0) {
    return (
      <Screen centered testID="favorites-error">
        <Banner tone="error" message={error} />
        <Button title="Thử lại" onPress={reload} />
      </Screen>
    );
  }
  if (items.length === 0) {
    return (
      <Screen centered testID="favorites-empty">
        <AppText variant="title">Chưa có món yêu thích</AppText>
        <AppText tone="muted">Bấm ♡ trên trang công thức để lưu món vào đây.</AppText>
      </Screen>
    );
  }
  return (
    <Screen scroll={false} testID="favorites">
      <AppText variant="title">Yêu thích</AppText>
      <FlatList
        data={items}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <RecipeCard
            recipe={item}
            imageUri={coverUrl(supabase, item.coverImagePath)}
            onPress={() => navigation.navigate('RecipeDetail', { slug: item.slug })}
          />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm, paddingBottom: spacing.lg },
});
