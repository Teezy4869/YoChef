import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { View } from 'react-native';

import type { RootStackParamList } from '@/app/navigation/types';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { useAuth } from '@/features/auth/AuthProvider';

import { useFavorites } from './FavoritesProvider';

/** Heart on the recipe page; a guest is sent to sign in instead. */
export function FavoriteButton({ recipeId }: { recipeId: string }) {
  const { status } = useAuth();
  const { isFavorite, toggle } = useFavorites();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [error, setError] = useState<string | null>(null);
  const on = status === 'signedIn' && isFavorite(recipeId);

  const press = async () => {
    if (status !== 'signedIn') {
      navigation.navigate('SignIn');
      return;
    }
    setError(await toggle(recipeId));
  };

  return (
    <View testID="favorite">
      <Button
        title={on ? '♥ Đã lưu vào yêu thích' : '♡ Lưu vào yêu thích'}
        accessibilityLabel={on ? 'Bỏ khỏi yêu thích' : 'Lưu vào yêu thích'}
        accessibilityState={{ selected: on }}
        variant={on ? 'primary' : 'secondary'}
        onPress={press}
      />
      {error ? <Banner tone="error" message={error} /> : null}
    </View>
  );
}
