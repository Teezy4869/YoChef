import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/AppIcon';
import { AppText } from '@/components/AppText';
import { Banner } from '@/components/Banner';
import { BottomSheetModal } from '@/components/BottomSheetModal';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/features/auth/AuthProvider';
import type { ShoppingItem } from '@/features/shopping/shoppingApi';
import { triggerHaptic } from '@/lib/haptics';
import { useSupabase } from '@/lib/supabase';
import { colors, radius, spacing, touchTarget } from '@/theme/tokens';

import {
  addOrMergePantryItems,
  availableUnitsFor,
  fetchCatalogIngredients,
  foldVi,
  type CatalogIngredient,
} from './pantryApi';

type DraftRow = {
  shoppingItemId: string;
  label: string;
  ingredient: CatalogIngredient | null;
  qtyText: string;
  unit: string;
  query: string;
};

/**
 * Confirms moving checked shopping items into the user's pantry.
 * Ensures every moved item is linked to a canonical catalog ingredient,
 * has positive quantity, and uses a standard unit.
 */
export function MoveToPantryModal({
  visible,
  items,
  onClose,
  onMoved,
}: {
  visible: boolean;
  items: ShoppingItem[];
  onClose: () => void;
  onMoved: () => void;
}) {
  const supabase = useSupabase();
  const { session } = useAuth();
  const [catalog, setCatalog] = useState<CatalogIngredient[]>([]);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    fetchCatalogIngredients(supabase).then(
      (rows) => {
        if (!active) return;
        setCatalog(rows);
        const byId = new Map(rows.map((c) => [c.id, c]));
        setDrafts(
          items.map((item) => {
            const matched =
              (item.ingredientId ? byId.get(item.ingredientId) : undefined) ??
              rows.find((c) => foldVi(c.name) === foldVi(item.label)) ??
              null;
            const units = matched ? availableUnitsFor(matched.commonUnits) : [];
            const defaultUnit = item.unit && units.includes(item.unit) ? item.unit : (units[0] ?? item.unit ?? 'g');
            return {
              shoppingItemId: item.id,
              label: item.label,
              ingredient: matched,
              qtyText: item.quantity !== null ? String(item.quantity).replace('.', ',') : '1',
              unit: defaultUnit,
              query: matched ? matched.name : item.label,
            };
          }),
        );
      },
      () => {
        if (!active) return;
        setDrafts(
          items.map((item) => ({
            shoppingItemId: item.id,
            label: item.label,
            ingredient: item.ingredientId
              ? { id: item.ingredientId, name: item.label, slug: '', aliases: [], commonUnits: item.unit ? [item.unit] : [] }
              : null,
            qtyText: item.quantity !== null ? String(item.quantity).replace('.', ',') : '1',
            unit: item.unit ?? 'g',
            query: item.label,
          })),
        );
      },
    );
    return () => {
      active = false;
    };
  }, [visible, items, supabase]);

  const byIdQuery = useMemo(() => catalog, [catalog]);

  const updateDraft = (id: string, patch: Partial<DraftRow>) => {
    setDrafts((prev) => prev.map((d) => (d.shoppingItemId === id ? { ...d, ...patch } : d)));
  };

  if (!visible) return null;

  const confirm = async () => {
    if (drafts.length === 0) return;
    const entries: { ingredientId: string; quantity: number; unit: string }[] = [];
    const shoppingIds: string[] = [];

    for (const d of drafts) {
      if (!d.ingredient) {
        setError(`Vui lòng chọn nguyên liệu chuẩn cho "${d.label}".`);
        return;
      }
      const q = Number(d.qtyText.trim().replace(',', '.'));
      if (!Number.isFinite(q) || q <= 0) {
        setError(`Số lượng của "${d.ingredient.name}" phải lớn hơn 0.`);
        return;
      }
      if (!d.unit.trim()) {
        setError(`Vui lòng chọn đơn vị cho "${d.ingredient.name}".`);
        return;
      }
      entries.push({ ingredientId: d.ingredient.id, quantity: q, unit: d.unit });
      shoppingIds.push(d.shoppingItemId);
    }

    setError(null);
    setSaving(true);
    try {
      await addOrMergePantryItems(supabase, entries, shoppingIds, session?.user.id);
      triggerHaptic('success');
      onMoved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể cất đồ vào tủ lạnh.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheetModal
      visible={visible}
      title="Cất vào tủ lạnh"
      subtitle="Kiểm tra nhanh số lượng và đơn vị chuẩn trước khi cộng vào tủ."
      onClose={onClose}
      testID="move-to-pantry-modal"
      footer={
        <View style={styles.actions}>
          {error ? <Banner tone="error" message={error} /> : null}
          <Button
            title="Xác nhận cất vào tủ"
            icon="snow-outline"
            onPress={confirm}
            loading={saving}
            testID="confirm-move-pantry-btn"
          />
          <Button title="Hủy" variant="ghost" onPress={onClose} disabled={saving} />
        </View>
      }
    >
      <View style={styles.list}>
        {drafts.map((d) => {
          const suggestions = !d.ingredient && d.query.trim()
            ? byIdQuery.filter((c) => foldVi(c.name).includes(foldVi(d.query))).slice(0, 5)
            : [];
          const units = d.ingredient ? availableUnitsFor(d.ingredient.commonUnits) : [];

          return (
            <View key={d.shoppingItemId} style={styles.rowBox}>
              <AppText variant="heading">{d.label}</AppText>

              {!d.ingredient ? (
                <View style={styles.matchBox}>
                  <TextField
                    label="Khớp nguyên liệu chuẩn"
                    value={d.query}
                    onChangeText={(text) => updateDraft(d.shoppingItemId, { query: text, ingredient: null })}
                    placeholder="Gõ để chọn nguyên liệu chuẩn..."
                  />
                  {suggestions.map((ing) => (
                    <Pressable
                      key={ing.id}
                      accessibilityRole="button"
                      onPress={() => {
                        const u = availableUnitsFor(ing.commonUnits);
                        updateDraft(d.shoppingItemId, {
                          ingredient: ing,
                          query: ing.name,
                          unit: u.includes(d.unit) ? d.unit : u[0],
                        });
                      }}
                      style={styles.suggestion}
                    >
                      <AppText>{ing.name}</AppText>
                      <AppIcon name="checkmark-circle-outline" size={18} tone="primary" />
                    </Pressable>
                  ))}
                </View>
              ) : (
                <>
                  <TextField
                    label="Số lượng"
                    value={d.qtyText}
                    onChangeText={(text) => updateDraft(d.shoppingItemId, { qtyText: text })}
                    keyboardType="decimal-pad"
                  />
                  <View style={styles.chips}>
                    {units.map((u) => (
                      <Chip
                        key={u}
                        label={u}
                        selected={d.unit === u}
                        onPress={() => updateDraft(d.shoppingItemId, { unit: u })}
                      />
                    ))}
                  </View>
                </>
              )}
            </View>
          );
        })}
      </View>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  rowBox: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    gap: spacing.xs,
  },
  matchBox: { gap: spacing.xs },
  suggestion: {
    minHeight: touchTarget - 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  actions: { gap: spacing.xs },
});
