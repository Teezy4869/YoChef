import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { formatQuantity, shownQuantity } from '@/features/recipes/servings';
import type { RecipeDetail } from '@/features/recipes/types';
import { colors, radius, spacing, touchTarget, typography } from '@/theme/tokens';

import {
  convertPantryQty,
  deductPantryIngredients,
  type DeductPantryInput,
  type PantryItem,
} from './pantryApi';
import type { YoChefClient } from '@/lib/supabase';

type DeductRow = {
  key: string;
  ingredientId: string;
  name: string;
  pantryQty: number;
  pantryUnit: string;
  deductUnit: string;
  qtyText: string;
  selected: boolean;
};

/**
 * Confirmation modal shown when finishing Cooking Mode.
 * Lists ingredients present in the user's pantry, defaults to the recipe's
 * scaled quantities, allows editing or unchecking, and never deducts negative.
 */
export function DeductPantryModal({
  visible,
  client,
  recipe,
  servings,
  pantryItems,
  onSkip,
  onDone,
}: {
  visible: boolean;
  client: YoChefClient;
  recipe: RecipeDetail;
  servings: number;
  pantryItems: PantryItem[];
  onSkip: () => void;
  onDone: () => void;
}) {
  const initialRows = useMemo<DeductRow[]>(() => {
    const pantryByIng = new Map(pantryItems.map((p) => [p.ingredientId, p]));
    const rows: DeductRow[] = [];
    const seen = new Set<string>();

    for (const line of recipe.ingredients) {
      if (!line.ingredientId || seen.has(line.ingredientId)) continue;
      const pItem = pantryByIng.get(line.ingredientId);
      if (!pItem) continue;
      seen.add(line.ingredientId);

      const scaled = shownQuantity(line.quantity, line.basis, recipe.defaultServings, servings);
      let defaultQty = scaled;
      let deductUnit = line.unit ?? pItem.unit;

      if (scaled !== null && line.unit) {
        const converted = convertPantryQty(scaled, line.unit, pItem.unit);
        if (converted === null) {
          // Incompatible unit systems: ask user in the pantry's unit, default 0/1 capped at stock.
          deductUnit = pItem.unit;
          defaultQty = Math.min(1, pItem.quantity);
        }
      } else if (scaled === null) {
        // To taste: don't pre-fill full stock deduction; let user optionally edit.
        deductUnit = pItem.unit;
        defaultQty = 0;
      }

      const cappedQty =
        defaultQty !== null
          ? (() => {
              const inPantryUnit = convertPantryQty(defaultQty, deductUnit, pItem.unit);
              if (inPantryUnit !== null && inPantryUnit > pItem.quantity) {
                return convertPantryQty(pItem.quantity, pItem.unit, deductUnit) ?? pItem.quantity;
              }
              return defaultQty;
            })()
          : 0;

      rows.push({
        key: `${line.ingredientId}-${line.sortOrder}`,
        ingredientId: line.ingredientId,
        name: line.name,
        pantryQty: pItem.quantity,
        pantryUnit: pItem.unit,
        deductUnit,
        qtyText: cappedQty > 0 ? String(Number(cappedQty.toFixed(2))).replace('.', ',') : '',
        selected: cappedQty > 0,
      });
    }
    return rows;
  }, [recipe, servings, pantryItems]);

  const [rows, setRows] = useState<DeductRow[]>(initialRows);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleRow = (key: string) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, selected: !r.selected } : r)));
  };

  const changeQty = (key: string, text: string) => {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, qtyText: text, selected: text.trim() !== '' } : r)),
    );
  };

  const handleConfirm = async () => {
    const payload: DeductPantryInput[] = [];
    for (const r of rows) {
      if (!r.selected) continue;
      const q = Number(r.qtyText.trim().replace(',', '.'));
      if (!Number.isFinite(q) || q <= 0) {
        setError(`Số lượng trừ cho "${r.name}" phải lớn hơn 0 (hoặc bỏ chọn).`);
        return;
      }
      const inPantry = convertPantryQty(q, r.deductUnit, r.pantryUnit);
      if (inPantry !== null && inPantry > r.pantryQty + 1e-6) {
        setError(`Không thể trừ âm: "${r.name}" trong tủ chỉ còn ${formatQuantity(r.pantryQty, true)} ${r.pantryUnit}.`);
        return;
      }
      payload.push({ ingredientId: r.ingredientId, quantity: q, unit: r.deductUnit });
    }

    setError(null);
    if (payload.length === 0) {
      onDone();
      return;
    }

    setBusy(true);
    try {
      await deductPantryIngredients(client, payload);
      onDone();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (/mạng|network|fetch/i.test(msg)) {
        setError('Mất kết nối mạng, chưa thể trừ kho. Bạn có thể thử lại hoặc bỏ qua.');
      } else {
        setError(msg || 'Không trừ được nguyên liệu trong tủ lạnh.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onSkip} testID="deduct-pantry-modal">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <AppText variant="title">{`Hoàn thành món ${recipe.name}!`}</AppText>
          <AppText tone="muted">
            Chọn và điều chỉnh lượng nguyên liệu thực tế bạn đã dùng để YoChef trừ khỏi Tủ lạnh:
          </AppText>

          <ScrollView contentContainerStyle={styles.list}>
            {rows.map((r) => (
              <View key={r.key} style={styles.row}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: r.selected }}
                  accessibilityLabel={`Trừ ${r.name}`}
                  onPress={() => toggleRow(r.key)}
                  style={styles.checkArea}
                >
                  <View style={[styles.box, r.selected ? styles.boxOn : null]}>
                    {r.selected ? <AppText tone="onPrimary">✓</AppText> : null}
                  </View>
                  <View style={styles.info}>
                    <AppText variant="label">{r.name}</AppText>
                    <AppText variant="caption" tone="muted">
                      {`Trong tủ: ${formatQuantity(r.pantryQty, true)} ${r.pantryUnit}`}
                    </AppText>
                  </View>
                </Pressable>

                <View style={styles.inputWrap}>
                  <TextInput
                    accessibilityLabel={`Số lượng trừ ${r.name}`}
                    value={r.qtyText}
                    onChangeText={(t) => changeQty(r.key, t)}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                    style={styles.qtyInput}
                  />
                  <AppText variant="caption" tone="muted">
                    {r.deductUnit}
                  </AppText>
                </View>
              </View>
            ))}
          </ScrollView>

          {error ? <Banner tone="error" message={error} testID="deduct-pantry-error" /> : null}

          <View style={styles.actions}>
            <Button
              title={error ? 'Thử lại' : 'Xác nhận trừ kho'}
              onPress={handleConfirm}
              loading={busy}
              testID="confirm-deduct-btn"
            />
            <Button title="Bỏ qua trừ kho" variant="ghost" onPress={onSkip} disabled={busy} testID="skip-deduct-btn" />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: '85%',
    gap: spacing.md,
  },
  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  checkArea: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: touchTarget },
  box: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.primary },
  info: { flex: 1, gap: 2 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  qtyInput: {
    ...typography.body,
    width: 68,
    minHeight: 40,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.xs,
    textAlign: 'right',
    color: colors.text,
  },
  actions: { gap: spacing.xs },
});
