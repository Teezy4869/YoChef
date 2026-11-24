import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import type { RootStackParamList } from "@/app/navigation/types";
import { Banner } from "@/components/Banner";
import { Button } from "@/components/Button";
import { useAuth } from "@/features/auth/AuthProvider";
import { triggerHaptic } from "@/lib/haptics";
import { spacing } from "@/theme/tokens";

import { useFavorites } from "./FavoritesProvider";

/** Heart on the recipe page; a guest is sent to sign in instead. */
export function FavoriteButton({ recipeId }: { recipeId: string }) {
  const { status } = useAuth();
  const { isFavorite, toggle } = useFavorites();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [error, setError] = useState<string | null>(null);
  const on = status === "signedIn" && isFavorite(recipeId);

  const press = async () => {
    if (status !== "signedIn") {
      navigation.navigate("SignIn");
      return;
    }
    triggerHaptic("light");
    setError(await toggle(recipeId));
  };

  return (
    <View style={styles.root} testID="favorite">
      <Button
        title={on ? "Đã lưu vào yêu thích" : "Lưu vào yêu thích"}
        icon={on ? "heart" : "heart-outline"}
        accessibilityLabel={on ? "Bỏ khỏi yêu thích" : "Lưu vào yêu thích"}
        accessibilityState={{ selected: on }}
        variant={on ? "soft" : "secondary"}
        onPress={press}
      />
      {error ? <Banner tone="error" message={error} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
});
