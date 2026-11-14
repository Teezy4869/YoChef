import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { fail } from '@/features/recipes/recipeApi';
import { useSupabase, type YoChefClient } from '@/lib/supabase';
import { colors, spacing } from '@/theme/tokens';

// Phase 4.3: the public reads VERIFIED results of published recipes only (RLS), so a
// missing row means "not available yet". Unknown values show as "—", never 0.
const NUTRIENTS = [
  ['energy_kcal', 'Năng lượng', 'kcal'],
  ['protein_g', 'Chất đạm', 'g'],
  ['fat_g', 'Chất béo', 'g'],
  ['carbs_g', 'Tinh bột, đường', 'g'],
  ['sodium_mg', 'Natri', 'mg'],
  ['saturated_fat_g', 'Chất béo bão hòa', 'g'],
  ['fiber_g', 'Chất xơ', 'g'],
  ['sugar_g', 'Đường', 'g'],
] as const;
type PerServing = Partial<Record<(typeof NUTRIENTS)[number][0], number | null>>;

export async function fetchNutrition(client: YoChefClient, recipeId: string): Promise<PerServing | null> {
  const { data, error } = await client.from('recipe_nutrition').select('per_serving').eq('recipe_id', recipeId).maybeSingle();
  if (error) fail(error, 'Không tải được thông tin dinh dưỡng.');
  return ((data as { per_serving?: PerServing | null } | null)?.per_serving ?? null) || null;
}

const show = (v: number | null | undefined, unit: string) =>
  v === null || v === undefined ? '—' : `${String(v).replace('.', ',')} ${unit}`;

export function NutritionSection({ recipeId }: { recipeId: string }) {
  const supabase = useSupabase();
  const [loaded, setLoaded] = useState<{ recipeId: string; value: PerServing | null; error: string | null } | null>(null);

  useEffect(() => {
    let active = true;
    fetchNutrition(supabase, recipeId).then(
      (value) => active && setLoaded({ recipeId, value, error: null }),
      (e: unknown) => active && setLoaded({ recipeId, value: null, error: e instanceof Error ? e.message : 'Có lỗi xảy ra.' }),
    );
    return () => {
      active = false;
    };
  }, [supabase, recipeId]);

  const current = loaded?.recipeId === recipeId ? loaded : null;
  if (!current) return null;
  return (
    <View style={styles.root} testID="nutrition">
      <AppText variant="title">Dinh dưỡng mỗi phần</AppText>
      {current.error ? (
        <AppText tone="danger">{current.error}</AppText>
      ) : !current.value ? (
        <AppText tone="muted">Chưa có thông tin dinh dưỡng cho món này.</AppText>
      ) : (
        <>
          {NUTRIENTS.map(([key, label, unit]) => (
            <View key={key} style={styles.row} accessible accessibilityLabel={`${label}: ${show(current.value?.[key], unit)}`}>
              <AppText>{label}</AppText>
              <AppText>{show(current.value?.[key], unit)}</AppText>
            </View>
          ))}
          <AppText variant="caption" tone="muted">
            Ước tính từ dữ liệu USDA cho nguyên liệu theo sách, chỉ để tham khảo. “—” là chưa rõ.
          </AppText>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2, borderBottomWidth: 1, borderBottomColor: colors.border },
});
