import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { View } from 'react-native';

import type { RootStackParamList } from '@/app/navigation/types';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import type { RecipeDetail } from '@/features/recipes/types';
import { useSupabase } from '@/lib/supabase';

import { addRecipe } from './shoppingApi';

/** Adds the recipe's ingredients, at the servings on screen, to the shopping list. */
export function AddToShoppingButton({ recipe, servings }: { recipe: RecipeDetail; servings: number }) {
  const supabase = useSupabase();
  const { status, session } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  if (recipe.ingredients.length === 0) return null;

  const press = async () => {
    if (status !== 'signedIn' || !session) {
      navigation.navigate('SignIn');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const added = await addRecipe(supabase, session.user.id, recipe, servings);
      setMessage({ tone: 'success', text: `Đã thêm ${added.length} món vào danh sách đi chợ.` });
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'Có lỗi xảy ra. Vui lòng thử lại.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View testID="add-to-shopping">
      <Button title={`Thêm vào đi chợ (${servings} người)`} variant="secondary" loading={busy} onPress={press} />
      {message ? <Banner tone={message.tone} message={message.text} /> : null}
    </View>
  );
}
