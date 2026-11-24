import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import type { IngredientAvailability } from '@/features/pantry/pantryApi';
import { colors, radius, spacing } from '@/theme/tokens';

import { joinMeta } from './format';
import { formatQuantity, quantityText } from './servings';
import type { IngredientLine } from './types';

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
  if (ingredients.length === 0) return <AppText tone="muted">Chưa có danh sách nguyên liệu.</AppText>;

  const availBySort = new Map<number, IngredientAvailability>();
  if (availability) {
    for (const a of availability) availBySort.set(a.line.sortOrder, a);
  }

  return (
    <>
      {ingredients.map((i) => {
        const note = joinMeta([i.preparationNote, i.quantityNote]);
        const av = availBySort.get(i.sortOrder);

        return (
          <View key={i.sortOrder} style={styles.row} testID="ingredient-row">
            <AppText style={styles.qty} testID="ingredient-qty">
              {quantityText(i.quantity, i.unit, i.basis, defaultServings, servings)}
            </AppText>
            <View style={styles.text}>
              <AppText>
                {i.name}
                {i.isOptional ? ' (tùy chọn)' : ''}
              </AppText>
              {note ? (
                <AppText variant="caption" tone="muted">
                  {note}
                </AppText>
              ) : null}
              {av ? (
                <View style={styles.pantryRow}>
                  {av.status === 'available' ? (
                    <View style={[styles.badge, styles.badgeOk]}>
                      <AppText variant="caption" tone="success">
                        {av.pantryItem
                          ? `Đã có trong tủ (${formatQuantity(av.pantryItem.quantity, true)} ${av.pantryItem.unit})`
                          : 'Đã có trong tủ'}
                      </AppText>
                    </View>
                  ) : av.status === 'insufficient' ? (
                    <View style={[styles.badge, styles.badgeWarn]}>
                      <AppText variant="caption" tone="primary">
                        {av.pantryItem
                          ? `Thiếu (tủ còn ${formatQuantity(av.pantryItem.quantity, true)} ${av.pantryItem.unit})`
                          : 'Không đủ'}
                      </AppText>
                    </View>
                  ) : av.status === 'missing' ? (
                    <View style={[styles.badge, styles.badgeWarn]}>
                      <AppText variant="caption" tone="primary">
                        Thiếu
                      </AppText>
                    </View>
                  ) : null}

                  {(av.status === 'missing' || av.status === 'insufficient') && onAddMissing ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Thêm ${i.name} vào đi chợ`}
                      onPress={() => onAddMissing(i)}
                      style={styles.addBtn}
                    >
                      <AppText variant="caption" tone="primary">
                        + Đi chợ
                      </AppText>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.xs },
  qty: { width: 112, fontWeight: '600' },
  text: { flex: 1, gap: spacing.xxs },
  pantryRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs, marginTop: 2 },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm },
  badgeOk: { backgroundColor: colors.successSoft },
  badgeWarn: { backgroundColor: colors.primarySoft },
  addBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
  },
});
