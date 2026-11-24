import { useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";

import type { MainTabScreenProps } from "@/app/navigation/types";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { Screen } from "@/components/Screen";
import { SignInPrompt } from "@/components/SignInPrompt";
import { RecipeListSkeleton } from "@/components/Skeleton";
import { useAuth } from "@/features/auth/AuthProvider";
import { useFavorites } from "@/features/favorites/FavoritesProvider";
import { coverUrl } from "@/features/recipes/recipeApi";
import { RecipeCard } from "@/features/recipes/RecipeCard";
import { useSupabase } from "@/lib/supabase";
import { colors, spacing } from "@/theme/tokens";

export function FavoritesScreen({
  navigation,
}: MainTabScreenProps<"Favorites">) {
  const supabase = useSupabase();
  const { status } = useAuth();
  const { items, loading, error, reload } = useFavorites();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    reload();
    setTimeout(() => setRefreshing(false), 300);
  };

  if (status !== "signedIn") {
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
      <Screen scroll={false} padding="none" testID="favorites-loading">
        <View style={styles.header}>
          <AppText variant="title">Yêu thích</AppText>
        </View>
        <RecipeListSkeleton count={3} />
      </Screen>
    );
  }
  if (error && items.length === 0) {
    return (
      <Screen centered testID="favorites-error">
        <EmptyState
          icon="cloud-offline-outline"
          tone="danger"
          title="Không tải được món yêu thích"
          message={error}
          action={<Button title="Thử lại" icon="refresh" onPress={reload} />}
        />
      </Screen>
    );
  }
  if (items.length === 0) {
    return (
      <Screen centered testID="favorites-empty">
        <EmptyState
          icon="heart-outline"
          title="Chưa có món yêu thích"
          message="Bấm ♡ trên trang công thức để lưu món vào đây."
          action={
            <Button
              title="Khám phá món Việt"
              icon="compass-outline"
              onPress={() => navigation.navigate("Home")}
            />
          }
        />
      </Screen>
    );
  }
  return (
    <Screen scroll={false} padding="none" testID="favorites">
      <View style={styles.header}>
        <AppText variant="title">Yêu thích</AppText>
        <AppText variant="caption" tone="muted">
          {`${items.length} món đã lưu`}
        </AppText>
      </View>
      <FlatList
        data={items}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
        renderItem={({ item }) => (
          <RecipeCard
            variant="compact"
            recipe={item}
            imageUri={coverUrl(supabase, item.coverImagePath)}
            onPress={() =>
              navigation.navigate("RecipeDetail", { slug: item.slug })
            }
          />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.xxs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
});
