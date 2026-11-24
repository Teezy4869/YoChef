import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { AppIcon, type IconName } from "@/components/AppIcon";
import { AppText } from "@/components/AppText";
import { Banner } from "@/components/Banner";
import { BottomSheetModal } from "@/components/BottomSheetModal";
import { Button } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { EmptyState } from "@/components/EmptyState";
import { ListRowSkeleton } from "@/components/Skeleton";
import { TextField } from "@/components/TextField";
import { formatQuantity } from "@/features/recipes/servings";
import { triggerHaptic } from "@/lib/haptics";
import { useSupabase } from "@/lib/supabase";
import { colors, radius, shadows, spacing, touchTarget } from "@/theme/tokens";

import {
  availableUnitsFor,
  fetchCatalogIngredients,
  foldVi,
  PANTRY_GROUP_LABEL,
  PANTRY_GROUP_ORDER,
  type CatalogIngredient,
  type PantryGroup,
  type PantryItem,
} from "./pantryApi";
import type { usePantry } from "./usePantry";

type PantryState = ReturnType<typeof usePantry>;

const GROUP_ICON: Record<PantryGroup, IconName> = {
  meat_seafood: "fish-outline",
  vegetables: "leaf-outline",
  spices: "flask-outline",
  dry_other: "cube-outline",
};

export function PantryTab({
  pantry,
  addSheetOpen,
  onOpenAddSheet,
  onCloseAddSheet,
}: {
  pantry: PantryState;
  addSheetOpen: boolean;
  onOpenAddSheet: () => void;
  onCloseAddSheet: () => void;
}) {
  const supabase = useSupabase();
  const [catalog, setCatalog] = useState<CatalogIngredient[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // Add-item form state: strictly selects from catalog ingredients & standard units
  const [ingQuery, setIngQuery] = useState("");
  const [selectedIng, setSelectedIng] = useState<CatalogIngredient | null>(
    null,
  );
  const [qtyText, setQtyText] = useState("");
  const [selectedUnit, setSelectedUnit] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Pantry search & detail modal state
  const [filterQuery, setFilterQuery] = useState("");
  const [editing, setEditing] = useState<PantryItem | null>(null);

  useEffect(() => {
    let active = true;
    fetchCatalogIngredients(supabase).then(
      (rows) => active && setCatalog(rows),
      (e: unknown) =>
        active &&
        setCatalogError(
          e instanceof Error
            ? e.message
            : "Không tải được danh mục nguyên liệu.",
        ),
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
    setSelectedUnit(units[0] ?? "g");
    setFormError(null);
  };

  const clearPickedIngredient = () => {
    setSelectedIng(null);
    setIngQuery("");
    setSelectedUnit("");
  };

  const submitAdd = async () => {
    if (!selectedIng) {
      setFormError("Vui lòng chọn một nguyên liệu từ danh sách gợi ý.");
      return;
    }
    const parsedQty = Number(qtyText.trim().replace(",", "."));
    if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
      setFormError("Số lượng phải là số lớn hơn 0.");
      return;
    }
    if (!selectedUnit) {
      setFormError("Vui lòng chọn đơn vị chuẩn.");
      return;
    }
    setFormError(null);
    setSaving(true);
    const ok = await pantry.addItem({
      ingredientId: selectedIng.id,
      quantity: parsedQty,
      unit: selectedUnit,
    });
    setSaving(false);
    if (ok) {
      triggerHaptic("success");
      setSelectedIng(null);
      setIngQuery("");
      setQtyText("");
      setSelectedUnit("");
      onCloseAddSheet();
    }
  };

  const grouped = useMemo(() => {
    const q = foldVi(filterQuery);
    const filtered = q
      ? pantry.items.filter((i) => foldVi(i.name).includes(q))
      : pantry.items;
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
    return <ListRowSkeleton count={4} testID="pantry-loading" />;
  }

  if (pantry.error && pantry.items.length === 0) {
    return (
      <View style={styles.center} testID="pantry-error">
        <EmptyState
          icon="cloud-offline-outline"
          tone="danger"
          title="Không tải được tủ lạnh"
          message={pantry.error}
          action={
            <Button title="Thử lại" icon="refresh" onPress={pantry.reload} />
          }
        />
      </View>
    );
  }

  return (
    <View style={styles.root} testID="pantry-tab">
      {pantry.actionError ? (
        <Banner tone="error" message={pantry.actionError} />
      ) : null}
      {catalogError ? <Banner tone="error" message={catalogError} /> : null}

      {pantry.items.length > 0 ? (
        <TextField
          label="Tìm trong tủ lạnh"
          leftIcon="search-outline"
          value={filterQuery}
          onChangeText={setFilterQuery}
          placeholder="Lọc nguyên liệu đang có..."
        />
      ) : null}

      {pantry.items.length === 0 ? (
        <EmptyState
          icon="snow-outline"
          title="Tủ lạnh của bạn đang trống"
          message="Thêm nguyên liệu đang có hoặc cất từ danh sách Đi chợ sau khi mua xong."
          action={
            <Button
              title="Thêm nguyên liệu vào tủ"
              icon="add"
              onPress={onOpenAddSheet}
            />
          }
          testID="pantry-empty"
        />
      ) : (
        PANTRY_GROUP_ORDER.map((group) => {
          const groupItems = grouped[group];
          if (groupItems.length === 0) return null;
          return (
            <View
              key={group}
              style={styles.groupCard}
              testID={`pantry-group-${group}`}
            >
              <View style={styles.groupHead}>
                <AppIcon name={GROUP_ICON[group]} size={18} tone="primary" />
                <AppText variant="heading">{`${PANTRY_GROUP_LABEL[group]} (${groupItems.length})`}</AppText>
              </View>
              {groupItems.map((item, idx) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name}, ${formatQuantity(item.quantity, true)} ${item.unit}`}
                  onPress={() => setEditing(item)}
                  style={({ pressed }) => [
                    styles.itemRow,
                    idx < groupItems.length - 1 ? styles.itemDivider : null,
                    pressed ? styles.itemPressed : null,
                  ]}
                  testID="pantry-item"
                >
                  <AppText style={styles.itemName}>{item.name}</AppText>
                  <View style={styles.qtyPill}>
                    <AppText variant="label" tone="primary" tabularNums>
                      {`${formatQuantity(item.quantity, true)} ${item.unit}`}
                    </AppText>
                  </View>
                </Pressable>
              ))}
            </View>
          );
        })
      )}

      <BottomSheetModal
        visible={addSheetOpen}
        title="Thêm vào tủ lạnh"
        subtitle="Chỉ chọn từ danh mục nguyên liệu của YoChef"
        onClose={onCloseAddSheet}
        testID="pantry-add-modal"
      >
        <View style={styles.sheetForm}>
          <TextField
            label="Chọn nguyên liệu chuẩn"
            leftIcon="search-outline"
            value={ingQuery}
            onChangeText={(text) => {
              setIngQuery(text);
              if (selectedIng && text !== selectedIng.name)
                setSelectedIng(null);
            }}
            placeholder="Gõ tên nguyên liệu (vd: Thịt bò, Trứng)..."
          />
          {selectedIng ? (
            <View style={styles.pickedRow}>
              <View style={styles.pickedBadge}>
                <AppIcon name="checkmark-circle" size={16} tone="success" />
                <AppText variant="caption" tone="success">
                  {`Đã chọn: ${selectedIng.name}`}
                </AppText>
              </View>
              <Button
                title="Đổi món"
                variant="ghost"
                size="sm"
                fullWidth={false}
                onPress={clearPickedIngredient}
              />
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
                  <AppIcon name="add-circle-outline" size={18} tone="primary" />
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
                    <Chip
                      key={u}
                      label={u}
                      selected={selectedUnit === u}
                      onPress={() => setSelectedUnit(u)}
                    />
                  ))}
                </View>
              </View>
            </>
          ) : null}

          {formError ? <Banner tone="error" message={formError} /> : null}
          <Button
            title="Thêm vào tủ lạnh"
            icon="add"
            onPress={submitAdd}
            loading={saving}
          />
        </View>
      </BottomSheetModal>

      {editing ? (
        <PantryEditModal
          item={editing}
          onClose={() => setEditing(null)}
          onSave={async (qty, unit) => {
            const ok = await pantry.updateItem(editing.id, {
              quantity: qty,
              unit,
            });
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
  const [qtyText, setQtyText] = useState(
    String(item.quantity).replace(".", ","),
  );
  const units = useMemo(() => {
    const base = availableUnitsFor(item.commonUnits);
    return base.includes(item.unit) ? base : [item.unit, ...base];
  }, [item.commonUnits, item.unit]);
  const [unit, setUnit] = useState(item.unit);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    const parsed = Number(qtyText.trim().replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Số lượng phải lớn hơn 0.");
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
    <BottomSheetModal
      visible
      title={item.name}
      onClose={onClose}
      testID="pantry-edit-modal"
      footer={
        <View style={styles.modalActions}>
          <Button
            title="Lưu thay đổi"
            icon="checkmark"
            onPress={handleSave}
            loading={busy}
          />
          <Button
            title="Xóa khỏi tủ lạnh"
            icon="trash-outline"
            variant="secondary"
            onPress={handleDelete}
            disabled={busy}
          />
          <Button
            title="Đóng"
            variant="ghost"
            onPress={onClose}
            disabled={busy}
          />
        </View>
      }
    >
      <View style={styles.modalBody}>
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
              <Chip
                key={u}
                label={u}
                selected={unit === u}
                onPress={() => setUnit(u)}
              />
            ))}
          </View>
        </View>
        {error ? <Banner tone="error" message={error} /> : null}
      </View>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  center: { paddingVertical: spacing.lg },
  sheetForm: { gap: spacing.md },
  pickedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pickedBadge: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  suggestionBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    overflow: "hidden",
  },
  suggestionRow: {
    minHeight: touchTarget,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  unitBlock: { gap: spacing.xs },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  groupCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    padding: spacing.md,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  groupHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  itemRow: {
    minHeight: touchTarget,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
  },
  itemDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemPressed: { opacity: 0.75 },
  itemName: { flex: 1, paddingRight: spacing.md },
  qtyPill: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  modalBody: { gap: spacing.md },
  modalActions: { gap: spacing.xs },
});
