import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { fail } from '@/features/recipes/recipeApi';
import { useSupabase, type YoChefClient } from '@/lib/supabase';
import { colors, radius, shadows, spacing } from '@/theme/tokens';

// Phase 4.3: the public reads VERIFIED results of published recipes only (RLS), so a
// missing row means "not available yet". Unknown values show as "—", never 0.
const NUTRIENTS = [
  ['energy_kcal', 'Năng lượng', 'kcal', '#FF5E36'],
  ['protein_g', 'Chất đạm', 'g', '#10B981'],
  ['fat_g', 'Chất béo', 'g', '#F59E0B'],
  ['carbs_g', 'Tinh bột, đường', 'g', '#6366F1'],
  ['sodium_mg', 'Natri', 'mg', '#8B5CF6'],
  ['saturated_fat_g', 'Chất béo bão hòa', 'g', '#EC4899'],
  ['fiber_g', 'Chất xơ', 'g', '#14B8A6'],
  ['sugar_g', 'Đường', 'g', '#F43F5E'],
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

  const top4 = [
    { key: 'energy_kcal', label: 'Calo', unit: 'kcal', color: '#FF5E36' },
    { key: 'protein_g', label: 'Đạm', unit: 'g', color: '#10B981' },
    { key: 'fat_g', label: 'Chất béo', unit: 'g', color: '#F59E0B' },
    { key: 'carbs_g', label: 'Carbs', unit: 'g', color: '#6366F1' },
  ] as const;

  return (
    <View style={styles.root} testID="nutrition">
      <AppText variant="title" style={styles.title}>
        Dinh dưỡng mỗi phần
      </AppText>
      {current.error ? (
        <AppText tone="danger">{current.error}</AppText>
      ) : !current.value ? (
        <View style={styles.emptyCard}>
          <AppText tone="muted">Chưa có thông tin dinh dưỡng cho món này.</AppText>
        </View>
      ) : (
        <View style={styles.container}>
          {/* Top 4 Highlights Nutrition Bar */}
          <View style={styles.top4Row}>
            {top4.map((item) => {
              const val = current.value?.[item.key];
              return (
                <View key={item.key} style={styles.top4Card}>
                  <View style={[styles.colorBar, { backgroundColor: item.color }]} />
                  <AppText variant="caption" tone="muted" style={styles.top4Label}>
                    {item.label}
                  </AppText>
                  <AppText variant="heading" style={styles.top4Value}>
                    {val === null || val === undefined ? '—' : String(val).replace('.', ',')}
                  </AppText>
                  <AppText variant="caption" tone="muted" style={styles.top4Unit}>
                    {item.unit}
                  </AppText>
                </View>
              );
            })}
          </View>

          {/* Full nutrient rows for details & screen-readers */}
          <View style={styles.table}>
            {NUTRIENTS.map(([key, label, unit]) => (
              <View key={key} style={styles.row} accessible accessibilityLabel={`${label}: ${show(current.value?.[key], unit)}`}>
                <AppText style={styles.rowLabel}>{label}</AppText>
                <AppText style={styles.rowValue}>{show(current.value?.[key], unit)}</AppText>
              </View>
            ))}
          </View>
          <AppText variant="caption" tone="muted" style={styles.disclaimer}>
            Ước tính từ dữ liệu USDA cho nguyên liệu theo sách, chỉ để tham khảo. “—” là chưa rõ.
          </AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md, marginVertical: spacing.sm },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  emptyCard: {
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  container: {
    gap: spacing.md,
  },
  top4Row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  top4Card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm + 2,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.subtle,
  },
  colorBar: {
    width: 24,
    height: 4,
    borderRadius: radius.pill,
    marginBottom: spacing.xs,
  },
  top4Label: {
    fontSize: 11,
    fontWeight: '600',
  },
  top4Value: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginTop: 2,
  },
  top4Unit: {
    fontSize: 10,
  },
  table: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    ...shadows.subtle,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  rowLabel: {
    fontSize: 14,
    color: colors.text,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  disclaimer: {
    fontSize: 12,
    lineHeight: 16,
    paddingHorizontal: spacing.xs,
  },
});
