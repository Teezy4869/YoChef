import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { spacing } from '@/theme/tokens';

import { joinMeta } from './format';
import { quantityText } from './servings';
import type { IngredientLine } from './types';

/** Ingredient list scaled to `servings`. Shared by the detail and cooking screens. */
export function IngredientRows({
  ingredients,
  defaultServings,
  servings,
}: {
  ingredients: IngredientLine[];
  defaultServings: number | null;
  servings: number;
}) {
  if (ingredients.length === 0) return <AppText tone="muted">Chưa có danh sách nguyên liệu.</AppText>;
  return (
    <>
      {ingredients.map((i) => {
        const note = joinMeta([i.preparationNote, i.quantityNote]);
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
});
