import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { TextField } from '@/components/TextField';
import { formatQuantity } from '@/features/recipes/servings';
import { useSupabase } from '@/lib/supabase';
import { colors, radius, spacing, touchTarget } from '@/theme/tokens';

import {
  availableUnitsFor,
  fetchCatalogIngredients,
  foldVi,
  PANTRY_GROUP_LABEL,
  PANTRY_GROUP_ORDER,
  type CatalogIngredient,
  type PantryGroup,
  type PantryItem,
} from './pantryApi';
import type { usePantry } from './usePantry';

type PantryState = ReturnType<typeof usePantry>;

export function PantryTab({ pantry }: { pantry: PantryState }) {
  const supabase = useSupabase();
  const [catalog, setCatalog] = useState<CatalogIngredient[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // Add-item form state: strictly selects from catalog ingredients & standard units
  const [ingQuery, setIngQuery] = useState('');
  const [selectedIng, setSelectedIng] = useState<CatalogIngredient | null>(null);
  const [qtyText, setQtyText] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Pantry search & detail modal state
  const [filterQuery, setFilterQuery] = useState('');
  const [editing, setEditing] = useState<PantryItem | null>(null);

  useEffect(() => {
    let active = true;
    fetchCatalogIngredients(supabase).then(
      (rows) => active && setCatalog(rows),
      (e: unknown) => active && setCatalogError(e instanceof Error ? e.message : 'Không tải được danh mục nguyên liệu.'),
    );
    return () => {
      active = false;
    };
  }, [supabase]);

  const suggestions = useMemo(() => {
    const q = foldVi(ingQuery);
    if (!q || selectedIng) return [];
    return catalog
      .filter((c) => {
        if (foldVi(c.name).includes(q)) return true;
        return c.aliases.some((a) => foldVi(a).includes(q));
      })
      .slice(0, 8);
  }, [catalog, ingQuery, selectedIng]);

  const unitChoices = useMemo(
    () => (selectedIng ? availableUnitsFor(selectedIng.commonUnits) : []),
    [selectedIng],
  );

  const pickIngredient = (ing: CatalogIngredient) => {
    setSelectedIng(ing);
    setIngQuery(ing.name);
    const units = availableUnitsFor(ing.commonUnits);
    setSelectedUnit(units[0] ?? 'g');
    setFormError(null);
  };

  const clearPickedIngredient = () => {
    setSelectedIng(null);
    setIngQuery('');
    setSelectedUnit('');
  };

  const submitAdd = async () => {
    if (!selectedIng) {
      setFormError('Vui lòng chọn một nguyên liệu từ danh sách gợi ý.');
      return;
    }
    const parsedQty = Number(qtyText.trim().replace(',', '.'));
    if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
      setFormError('Số lượng phải là số lớn hơn 0.');
      return;
    }
    if (!selectedUnit) {
      setFormError('Vui lòng chọn đơn vị chuẩn.');
      return;
    }
    setFormError(null);
    setSaving(true);
    const ok = await pantry.addItem({ ingredientId: selectedIng.id, quantity: parsedQty, unit: selectedUnit });
    setSaving(false);
    if (ok) {
      setSelectedIng(null);
      setIngQuery('');
      setQtyText('');
      setSelectedUnit('');
    }
  };

  const grouped = useMemo(() => {
    const q = foldVi(filterQuery);
    const filtered = q ? pantry.items.filter((i) => foldVi(i.name).includes(q)) : pantry.items;
    const map: Record<PantryGroup, PantryItem[]> = {
      meat_seafood: [],
      vegetables: [],
      spices: [],
      dry_other: [],
    };
    for (const item of filtered) {
      map[item.group].push(item);
    }
    return map;
  }, [pantry.items, filterQuery]);

  if (pantry.loading) {
    return (
      <View style={styles.center} testID="pantry-loading">
        <ActivityIndicator color={colors.primary} size="large" accessibilityLabel="Đang tải tủ lạnh" />
      </View>
    );
  }

  if (pantry.error && pantry.items.length === 0) {
    return (
      <View style={styles.center} testID="pantry-error">
        <Banner tone="error" message={pantry.error} />
        <Button title="Thử lại" onPress={pantry.reload} />
      </View>
    );
  }

  return (
    <View style={styles.root} testID="pantry-tab">
      {pantry.actionError ? <Banner tone="error" message={pantry.actionError} /> : null}
      {catalogError ? <Banner tone="error" message={catalogError} /> : null}

      <View style={styles.card}>
        <AppText variant="heading">Thêm vào tủ lạnh</AppText>
        <TextField
          label="Chọn nguyên liệu chuẩn"
          value={ingQuery}
          onChangeText={(text) => {
            setIngQuery(text);
            if (selectedIng && text !== selectedIng.name) setSelectedIng(null);
          }}
          placeholder="Gõ tên nguyên liệu (vd: Thịt bò, Trứng)..."
          hint="Chỉ chọn từ danh mục nguyên liệu của YoChef"
        />
        {selectedIng ? (
          <View style={styles.pickedRow}>
            <AppText variant="caption" tone="success">
              {`Đã chọn: ${selectedIng.name}`}
            </AppText>
            <Button title="Đổi món" variant="ghost" fullWidth={false} onPress={clearPickedIngredient} />
          </View>
        ) : null}

        {suggestions.length > 0 ? (
          <View style={styles.suggestionBox} testID="pantry-suggestions">
            {suggestions.map((ing) => (
              <Pressable
                key={ing.id}
                accessibilityRole="button"
                accessibilityLabel={`Chọn ${ing.name}`}
                onPress={() => pickIngredient(ing)}
                style={styles.suggestionRow}
              >
                <AppText>{ing.name}</AppText>
              </Pressable>
            ))}
          </View>
        ) : null}

        {selectedIng ? (
          <>
            <TextField
              label="Số lượng trong tủ"
              value={qtyText}
              onChangeText={setQtyText}
              keyboardType="decimal-pad"
              placeholder="Ví dụ: 500"
            />
            <View style={styles.unitBlock}>
              <AppText variant="label">Đơn vị chuẩn</AppText>
              <View style={styles.chipWrap}>
                {unitChoices.map((u) => (
                  <Chip key={u} label={u} selected={selectedUnit === u} onPress={() => setSelectedUnit(u)} />
                ))}
              </View>
            </View>
          </>
        ) : null}

        {formError ? <Banner tone="error" message={formError} /> : null}
        <Button title="Thêm vào tủ lạnh" onPress={submitAdd} loading={saving} />
      </View>

      {pantry.items.length > 0 ? (
        <TextField
          label="Tìm trong tủ lạnh"
          value={filterQuery}
          onChangeText={setFilterQuery}
          placeholder="Lọc nguyên liệu đang có..."
        />
      ) : null}

      {pantry.items.length === 0 ? (
        <AppText tone="muted" testID="pantry-empty">
          Tủ lạnh của bạn đang trống. Thêm nguyên liệu ở trên hoặc cất từ danh sách Đi chợ sau khi mua xong.
        </AppText>
      ) : (
        PANTRY_GROUP_ORDER.map((group) => {
          const groupItems = grouped[group];
          if (groupItems.length === 0) return null;
          return (
            <View key={group} style={styles.groupSection} testID={`pantry-group-${group}`}>
              <AppText variant="heading">{`${PANTRY_GROUP_LABEL[group]} (${groupItems.length})`}</AppText>
              {groupItems.map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name}, ${formatQuantity(item.quantity, true)} ${item.unit}`}
                  onPress={() => setEditing(item)}
                  style={styles.itemRow}
                  testID="pantry-item"
                >
                  <AppText style={styles.itemName}>{item.name}</AppText>
                  <AppText variant="label" tone="primary">
                    {`${formatQuantity(item.quantity, true)} ${item.unit}`}
                  </AppText>
                </Pressable>
              ))}
            </View>
          );
        })
      )}

      {editing ? (
        <PantryEditModal
          item={editing}
          onClose={() => setEditing(null)}
          onSave={async (qty, unit) => {
            const ok = await pantry.updateItem(editing.id, { quantity: qty, unit });
            if (ok) setEditing(null);
          }}
          onDelete={async () => {
            const ok = await pantry.removeItem(editing.id);
            if (ok) setEditing(null);
          }}
        />
      ) : null}
    </View>
  );
}

function PantryEditModal({
  item,
  onClose,
  onSave,
  onDelete,
}: {
  item: PantryItem;
  onClose: () => void;
  onSave: (quantity: number, unit: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [qtyText, setQtyText] = useState(String(item.quantity).replace('.', ','));
  const units = useMemo(() => {
    const base = availableUnitsFor(item.commonUnits);
    return base.includes(item.unit) ? base : [item.unit, ...base];
  }, [item.commonUnits, item.unit]);
  const [unit, setUnit] = useState(item.unit);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    const parsed = Number(qtyText.trim().replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Số lượng phải lớn hơn 0.');
      return;
    }
    setError(null);
    setBusy(true);
    await onSave(parsed, unit);
    setBusy(false);
  };

  const handleDelete = async () => {
    setBusy(true);
    await onDelete();
    setBusy(false);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} testID="pantry-edit-modal">
      <View style={styles.backdrop}>
        <View style={styles.modalCard}>
          <AppText variant="title">{item.name}</AppText>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <TextField
              label="Số lượng hiện có"
              value={qtyText}
              onChangeText={setQtyText}
              keyboardType="decimal-pad"
            />
            <View style={styles.unitBlock}>
              <AppText variant="label">Đơn vị chuẩn</AppText>
              <View style={styles.chipWrap}>
                {units.map((u) => (
                  <Chip key={u} label={u} selected={unit === u} onPress={() => setUnit(u)} />
                ))}
              </View>
            </View>
            {error ? <Banner tone="error" message={error} /> : null}
          </ScrollView>
          <View style={styles.modalActions}>
            <Button title="Lưu thay đổi" onPress={handleSave} loading={busy} />
            <Button title="Xóa khỏi tủ lạnh" variant="secondary" onPress={handleDelete} disabled={busy} />
            <Button title="Đóng" variant="ghost" onPress={onClose} disabled={busy} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  center: { paddingVertical: spacing.xxl, alignItems: 'center', gap: spacing.md },
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  suggestionBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  suggestionRow: {
    minHeight: touchTarget,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  unitBlock: { gap: spacing.xs },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  groupSection: { gap: spacing.xs },
  itemRow: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemName: { flex: 1, paddingRight: spacing.md },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: '85%',
    gap: spacing.md,
  },
  modalBody: { gap: spacing.md },
  modalActions: { gap: spacing.xs },
});
