import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { AppIcon } from "@/components/AppIcon";
import { AppText } from "@/components/AppText";
import { fail } from "@/features/recipes/recipeApi";
import { useSupabase, type YoChefClient } from "@/lib/supabase";
import { colors, radius, spacing } from "@/theme/tokens";

// Phase 4.3: the public reads VERIFIED results of published recipes only (RLS), so a
// missing row means "not available yet". Unknown values show as "—", never 0.
const MACROS = [
  ["energy_kcal", "Năng lượng", "kcal"],
  ["protein_g", "Chất đạm", "g"],
  ["fat_g", "Chất béo", "g"],
  ["carbs_g", "Tinh bột, đường", "g"],
] as const;

const MICROS = [
  ["sodium_mg", "Natri", "mg"],
  ["saturated_fat_g", "Chất béo bão hòa", "g"],
  ["fiber_g", "Chất xơ", "g"],
  ["sugar_g", "Đường", "g"],
] as const;

type NutrientKey = (typeof MACROS)[number][0] | (typeof MICROS)[number][0];
type PerServing = Partial<Record<NutrientKey, number | null>>;

export async function fetchNutrition(
  client: YoChefClient,
  recipeId: string,
): Promise<PerServing | null> {
  const { data, error } = await client
    .from("recipe_nutrition")
    .select("per_serving")
    .eq("recipe_id", recipeId)
    .maybeSingle();
  if (error) fail(error, "Không tải được thông tin dinh dưỡng.");
  return (
    ((data as { per_serving?: PerServing | null } | null)?.per_serving ??
      null) ||
    null
  );
}

const show = (v: number | null | undefined, unit: string) =>
  v === null || v === undefined
    ? "—"
    : `${String(v).replace(".", ",")} ${unit}`;

export function NutritionSection({ recipeId }: { recipeId: string }) {
  const supabase = useSupabase();
  const [loaded, setLoaded] = useState<{
    recipeId: string;
    value: PerServing | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    let active = true;
    fetchNutrition(supabase, recipeId).then(
      (value) => active && setLoaded({ recipeId, value, error: null }),
      (e: unknown) =>
        active &&
        setLoaded({
          recipeId,
          value: null,
          error: e instanceof Error ? e.message : "Có lỗi xảy ra.",
        }),
    );
    return () => {
      active = false;
    };
  }, [supabase, recipeId]);

  const current = loaded?.recipeId === recipeId ? loaded : null;
  if (!current) return null;
  return (
    <View style={styles.root} testID="nutrition">
      <View style={styles.head}>
        <AppIcon name="nutrition-outline" size={20} tone="primary" />
        <AppText variant="title">Dinh dưỡng mỗi phần</AppText>
      </View>
      {current.error ? (
        <AppText tone="danger">{current.error}</AppText>
      ) : !current.value ? (
        <AppText tone="muted">
          Chưa có thông tin dinh dưỡng cho món này.
        </AppText>
      ) : (
        <>
          <View style={styles.macroGrid}>
            {MACROS.map(([key, label, unit]) => {
              const formatted = show(current.value?.[key], unit);
              return (
                <View
                  key={key}
                  style={styles.macroTile}
                  accessible
                  accessibilityLabel={`${label}: ${formatted}`}
                >
                  <AppText variant="caption" tone="muted">
                    {label}
                  </AppText>
                  <AppText variant="heading" tone="primary" tabularNums>
                    {formatted}
                  </AppText>
                </View>
              );
            })}
          </View>
          <View style={styles.microList}>
            {MICROS.map(([key, label, unit], idx) => {
              const formatted = show(current.value?.[key], unit);
              return (
                <View
                  key={key}
                  style={[
                    styles.row,
                    idx < MICROS.length - 1 ? styles.rowBorder : null,
                  ]}
                  accessible
                  accessibilityLabel={`${label}: ${formatted}`}
                >
                  <AppText tone="muted">{label}</AppText>
                  <AppText variant="label" tabularNums>
                    {formatted}
                  </AppText>
                </View>
              );
            })}
          </View>
          <AppText variant="caption" tone="muted">
            Ước tính từ dữ liệu USDA cho nguyên liệu theo sách, chỉ để tham
            khảo. “—” là chưa rõ.
          </AppText>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  macroGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  macroTile: {
    width: "48%",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    borderCurve: "continuous",
    padding: spacing.md,
    gap: spacing.xxs,
  },
  microList: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
