import { Pressable, StyleSheet, View } from "react-native";

import { AppIcon } from "@/components/AppIcon";
import { AppText } from "@/components/AppText";
import type { IngredientAvailability } from "@/features/pantry/pantryApi";
import { colors, radius, spacing } from "@/theme/tokens";

import { joinMeta } from "./format";
import { formatQuantity, quantityText } from "./servings";
import type { IngredientLine } from "./types";

/** Ingredient list scaled to `servings`. Shared by the detail and cooking screens. */
export function IngredientRows({
  ingredients,
  defaultServings,
  servings,
  availability,
  onAddMissing,
}: {
  ingredients: IngredientLine[];
  defaultServings: number | null;
  servings: number;
  availability?: IngredientAvailability[];
  onAddMissing?: (line: IngredientLine) => void;
}) {
  if (ingredients.length === 0)
    return <AppText tone="muted">Chưa có danh sách nguyên liệu.</AppText>;

  const availBySort = new Map<number, IngredientAvailability>();
  if (availability) {
    for (const a of availability) availBySort.set(a.line.sortOrder, a);
  }

  return (
    <View style={styles.list}>
      {ingredients.map((i, idx) => {
        const note = joinMeta([i.preparationNote, i.quantityNote]);
        const av = availBySort.get(i.sortOrder);
        const isLast = idx === ingredients.length - 1;

        return (
          <View
            key={i.sortOrder}
            style={[styles.row, !isLast ? styles.rowDivider : null]}
            testID="ingredient-row"
          >
            <View style={styles.main}>
              <AppText style={styles.name}>
                {i.name}
                {i.isOptional ? " (tùy chọn)" : ""}
              </AppText>
              <AppText
                tone="primary"
                tabularNums
                style={styles.qty}
                testID="ingredient-qty"
              >
                {quantityText(
                  i.quantity,
                  i.unit,
                  i.basis,
                  defaultServings,
                  servings,
                )}
              </AppText>
            </View>
            {note ? (
              <AppText variant="caption" tone="muted">
                {note}
              </AppText>
            ) : null}
            {av ? (
              <View style={styles.pantryRow}>
                {av.status === "available" ? (
                  <View style={[styles.badge, styles.badgeOk]}>
                    <AppIcon name="checkmark-circle" size={14} tone="success" />
                    <AppText variant="caption" tone="success">
                      {av.pantryItem
                        ? `Đã có trong tủ (${formatQuantity(av.pantryItem.quantity, true)} ${av.pantryItem.unit})`
                        : "Đã có trong tủ"}
                    </AppText>
                  </View>
                ) : av.status === "insufficient" ? (
                  <View style={[styles.badge, styles.badgeWarn]}>
                    <AppIcon name="alert-circle" size={14} tone="primary" />
                    <AppText variant="caption" tone="primary">
                      {av.pantryItem
                        ? `Thiếu (tủ còn ${formatQuantity(av.pantryItem.quantity, true)} ${av.pantryItem.unit})`
                        : "Không đủ"}
                    </AppText>
                  </View>
                ) : av.status === "missing" ? (
                  <View style={[styles.badge, styles.badgeWarn]}>
                    <AppIcon
                      name="alert-circle-outline"
                      size={14}
                      tone="primary"
                    />
                    <AppText variant="caption" tone="primary">
                      Thiếu
                    </AppText>
                  </View>
                ) : null}

                {(av.status === "missing" || av.status === "insufficient") &&
                onAddMissing ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Thêm ${i.name} vào đi chợ`}
                    onPress={() => onAddMissing(i)}
                    style={({ pressed }) => [
                      styles.addBtn,
                      pressed ? styles.addBtnPressed : null,
                    ]}
                  >
                    <AppIcon name="add" size={14} tone="primary" />
                    <AppText
                      variant="caption"
                      tone="primary"
                      style={styles.addBtnText}
                    >
                      Đi chợ
                    </AppText>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.xs },
  row: { gap: spacing.xs, paddingVertical: spacing.sm },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  main: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  name: { flex: 1 },
  qty: { fontWeight: "600", textAlign: "right" },
  pantryRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs + 1,
    borderRadius: radius.pill,
  },
  badgeOk: { backgroundColor: colors.successSoft },
  badgeWarn: { backgroundColor: colors.primarySoft },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs + 1,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  addBtnPressed: { backgroundColor: colors.primarySoft },
  addBtnText: { fontWeight: "600" },
});
