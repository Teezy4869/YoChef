import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, View } from "react-native";

import { AppIcon } from "@/components/AppIcon";
import { AppText } from "@/components/AppText";
import { Banner } from "@/components/Banner";
import { BottomSheetModal } from "@/components/BottomSheetModal";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { Screen } from "@/components/Screen";
import { SignInPrompt } from "@/components/SignInPrompt";
import { ListRowSkeleton } from "@/components/Skeleton";
import { TextField } from "@/components/TextField";
import { useAuth } from "@/features/auth/AuthProvider";
import { MoveToPantryModal } from "@/features/pantry/MoveToPantryModal";
import { PantryTab } from "@/features/pantry/PantryTab";
import { usePantry } from "@/features/pantry/usePantry";
import { formatQuantity } from "@/features/recipes/servings";
import type {
  ManualErrors,
  ShoppingItem,
} from "@/features/shopping/shoppingApi";
import { useShoppingList } from "@/features/shopping/useShoppingList";
import { triggerHaptic } from "@/lib/haptics";
import { useSupabase } from "@/lib/supabase";
import { colors, radius, shadows, spacing, touchTarget } from "@/theme/tokens";

type Segment = "shopping" | "pantry";

export function ShoppingScreen() {
  const { status, session } = useAuth();
  if (status !== "signedIn" || !session) {
    return (
      <SignInPrompt
        title="Đi chợ"
        message="Đăng nhập để lưu nguyên liệu cần mua từ công thức và quản lý tủ lạnh của bạn."
        testID="shopping-guest"
      />
    );
  }
  // key: a different user starts from a clean list and pantry.
  return <ShoppingView key={session.user.id} userId={session.user.id} />;
}

/** "500 g", "2⅓ quả", or "" when the quantity is unknown. */
export function itemQuantity(
  item: Pick<ShoppingItem, "quantity" | "unit">,
): string {
  if (item.quantity === null) return "";
  const q = formatQuantity(item.quantity, true);
  return item.unit ? `${q} ${item.unit}` : q;
}

function ShoppingView({ userId }: { userId: string }) {
  const supabase = useSupabase();
  const list = useShoppingList(supabase, userId);
  const pantry = usePantry(supabase, userId);
  const { reload: reloadList } = list;
  const { reload: reloadPantry } = pantry;
  const didMountFocus = useRef(false);

  // Items added from a recipe page or deducted in cooking appear when the tab comes back into view.
  useFocusEffect(
    useCallback(() => {
      if (!didMountFocus.current) {
        didMountFocus.current = true;
        return;
      }
      reloadList();
      reloadPantry();
    }, [reloadList, reloadPantry]),
  );

  const [segment, setSegment] = useState<Segment>("shopping");
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showPantryAddSheet, setShowPantryAddSheet] = useState(false);
  const [label, setLabel] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [errors, setErrors] = useState<ManualErrors>({});
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Track bought items unchecked by the user from being moved to pantry
  const [deselectedForPantry, setDeselectedForPantry] = useState<Set<string>>(
    () => new Set(),
  );
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [movedNotice, setMovedNotice] = useState<string | null>(null);

  const toBuy = useMemo(
    () => list.items.filter((i) => !i.isChecked),
    [list.items],
  );
  const bought = useMemo(
    () => list.items.filter((i) => i.isChecked),
    [list.items],
  );
  const selectedForPantry = useMemo(
    () => bought.filter((i) => !deselectedForPantry.has(i.id)),
    [bought, deselectedForPantry],
  );

  const toggleMoveSelect = (id: string) => {
    triggerHaptic("light");
    setDeselectedForPantry((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    setSaving(true);
    const fieldErrors = await list.add({ label, quantity, unit });
    setSaving(false);
    if (fieldErrors) {
      setErrors(fieldErrors);
      return;
    }
    triggerHaptic("success");
    setErrors({});
    setLabel("");
    setQuantity("");
    setUnit("");
  };

  const handleRefresh = () => {
    setRefreshing(true);
    reloadList();
    reloadPantry();
    setTimeout(() => setRefreshing(false), 300);
  };

  const header = (
    <View style={styles.headerBlock}>
      <View style={styles.titleRow}>
        <AppText variant="title">Đi chợ & Tủ lạnh</AppText>
        <Button
          title={segment === "shopping" ? "+ Thêm món" : "+ Thêm vào tủ lạnh"}
          variant="soft"
          size="sm"
          fullWidth={false}
          onPress={() => {
            if (segment === "shopping") setShowAddSheet(true);
            else setShowPantryAddSheet(true);
          }}
          testID={
            segment === "shopping"
              ? "open-shopping-add-btn"
              : "open-pantry-add-btn"
          }
        />
      </View>

      <View style={styles.segments} testID="shopping-segments">
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: segment === "shopping" }}
          onPress={() => setSegment("shopping")}
          style={[
            styles.segmentBtn,
            segment === "shopping" ? styles.segmentActive : null,
          ]}
          testID="segment-shopping"
        >
          <AppIcon
            name="basket-outline"
            size={16}
            tone={segment === "shopping" ? "onPrimary" : "default"}
          />
          <AppText
            variant="label"
            tone={segment === "shopping" ? "onPrimary" : "default"}
          >
            {`Cần mua (${toBuy.length})`}
          </AppText>
        </Pressable>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: segment === "pantry" }}
          onPress={() => setSegment("pantry")}
          style={[
            styles.segmentBtn,
            segment === "pantry" ? styles.segmentActive : null,
          ]}
          testID="segment-pantry"
        >
          <AppIcon
            name="snow-outline"
            size={16}
            tone={segment === "pantry" ? "onPrimary" : "default"}
          />
          <AppText
            variant="label"
            tone={segment === "pantry" ? "onPrimary" : "default"}
          >
            {`Tủ lạnh (${pantry.items.length})`}
          </AppText>
        </Pressable>
      </View>
    </View>
  );

  if (segment === "pantry") {
    return (
      <Screen
        testID="shopping"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {header}
        <PantryTab
          pantry={pantry}
          addSheetOpen={showPantryAddSheet}
          onOpenAddSheet={() => setShowPantryAddSheet(true)}
          onCloseAddSheet={() => setShowPantryAddSheet(false)}
        />
      </Screen>
    );
  }

  if (list.loading) {
    return (
      <Screen scroll={false} padding="compact" testID="shopping-loading">
        <ListRowSkeleton count={4} />
      </Screen>
    );
  }
  if (list.error && list.items.length === 0) {
    return (
      <Screen centered testID="shopping-error">
        <EmptyState
          icon="cloud-offline-outline"
          tone="danger"
          title="Không tải được danh sách đi chợ"
          message={list.error}
          action={
            <Button title="Thử lại" icon="refresh" onPress={list.reload} />
          }
        />
      </Screen>
    );
  }

  const ratio = list.items.length > 0 ? bought.length / list.items.length : 0;

  return (
    <Screen
      testID="shopping"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.primary}
        />
      }
    >
      {header}

      {list.items.length > 0 ? (
        <View style={styles.progressCard}>
          <View style={styles.progressTop}>
            <AppText variant="label" testID="shopping-progress">
              {`Đã mua ${bought.length}/${list.items.length}`}
            </AppText>
            <AppText variant="caption" tone="muted" tabularNums>
              {`${Math.round(ratio * 100)}%`}
            </AppText>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${ratio * 100}%` }]} />
          </View>
        </View>
      ) : null}

      {movedNotice ? <Banner tone="success" message={movedNotice} /> : null}
      {list.actionError ? (
        <Banner tone="error" message={list.actionError} />
      ) : null}

      {list.items.length === 0 ? (
        <EmptyState
          icon="basket-outline"
          title="Danh sách đang trống"
          message="Thêm món ở nút “+ Thêm món” hoặc bấm “Thêm vào đi chợ” trên trang công thức."
          action={
            <Button
              title="Thêm món cần mua"
              icon="add"
              onPress={() => setShowAddSheet(true)}
            />
          }
          testID="shopping-empty"
        />
      ) : null}

      {toBuy.length > 0 ? (
        <View style={styles.sectionCard} testID="shopping-to-buy">
          <AppText variant="heading">Cần mua</AppText>
          {toBuy.map((i) => (
            <ItemRow
              key={i.id}
              item={i}
              onToggle={() => {
                triggerHaptic("light");
                list.toggle(i);
              }}
              onRemove={() => list.remove(i)}
            />
          ))}
        </View>
      ) : null}

      {bought.length > 0 ? (
        <View style={styles.sectionCard} testID="shopping-bought">
          <View style={styles.boughtHead}>
            <AppText variant="heading">Đã mua</AppText>
            <AppText variant="caption" tone="muted">
              Chọn các món muốn cất rồi nhấn “Cất vào tủ lạnh”.
            </AppText>
          </View>
          {bought.map((i) => (
            <View key={i.id} style={styles.boughtRow}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: !deselectedForPantry.has(i.id) }}
                accessibilityLabel={`Chọn cất ${i.label} vào tủ lạnh`}
                onPress={() => toggleMoveSelect(i.id)}
                style={styles.movePick}
              >
                <View
                  style={[
                    styles.smallBox,
                    !deselectedForPantry.has(i.id) ? styles.smallBoxOn : null,
                  ]}
                >
                  {!deselectedForPantry.has(i.id) ? (
                    <AppIcon name="checkmark" size={14} tone="onPrimary" />
                  ) : null}
                </View>
              </Pressable>
              <View style={styles.boughtMain}>
                <ItemRow
                  item={i}
                  onToggle={() => {
                    triggerHaptic("light");
                    list.toggle(i);
                  }}
                  onRemove={() => list.remove(i)}
                />
              </View>
            </View>
          ))}
          <View style={styles.boughtActions}>
            <Button
              title={`Cất vào tủ lạnh (${selectedForPantry.length})`}
              icon="snow-outline"
              disabled={selectedForPantry.length === 0}
              onPress={() => setShowMoveModal(true)}
              testID="move-to-pantry-btn"
            />
            <Button
              title={`Xóa các món đã mua (${bought.length})`}
              variant="secondary"
              onPress={list.clearChecked}
            />
          </View>
        </View>
      ) : null}

      <BottomSheetModal
        visible={showAddSheet}
        title="Thêm món cần mua"
        subtitle="Ghi nhanh món bạn cần mua ngoài chợ hoặc siêu thị."
        onClose={() => setShowAddSheet(false)}
        testID="shopping-add-modal"
      >
        <View style={styles.form}>
          <TextField
            label="Món cần mua"
            value={label}
            onChangeText={setLabel}
            error={errors.label}
            maxLength={100}
            placeholder="Ví dụ: Hành lá, Thịt ba chỉ..."
          />
          <View style={styles.row}>
            <View style={styles.cell}>
              <TextField
                label="Số lượng"
                value={quantity}
                onChangeText={setQuantity}
                error={errors.quantity}
                keyboardType="decimal-pad"
                hint="Để trống nếu không rõ"
              />
            </View>
            <View style={styles.cell}>
              <TextField
                label="Đơn vị"
                value={unit}
                onChangeText={setUnit}
                error={errors.unit}
                maxLength={50}
                placeholder="g, củ, bó..."
              />
            </View>
          </View>
          <Button
            title="Thêm vào danh sách"
            icon="add"
            onPress={submit}
            loading={saving}
          />
        </View>
      </BottomSheetModal>

      <MoveToPantryModal
        visible={showMoveModal}
        items={selectedForPantry}
        onClose={() => setShowMoveModal(false)}
        onMoved={() => {
          const count = selectedForPantry.length;
          setShowMoveModal(false);
          setDeselectedForPantry(new Set());
          setMovedNotice(`Đã cất ${count} món vào tủ lạnh.`);
          reloadList();
          reloadPantry();
        }}
      />
    </Screen>
  );
}

function ItemRow({
  item,
  onToggle,
  onRemove,
}: {
  item: ShoppingItem;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const qty = itemQuantity(item);
  return (
    <View style={styles.item} testID="shopping-item">
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.isChecked }}
        accessibilityLabel={qty ? `${item.label}, ${qty}` : item.label}
        onPress={onToggle}
        style={styles.check}
      >
        <View style={[styles.box, item.isChecked ? styles.boxOn : null]}>
          {item.isChecked ? (
            <AppIcon name="checkmark" size={16} tone="onPrimary" />
          ) : null}
        </View>
        <View style={styles.text}>
          <AppText style={item.isChecked ? styles.done : null}>
            {item.label}
          </AppText>
          {qty ? (
            <AppText variant="caption" tone="muted" tabularNums>
              {qty}
            </AppText>
          ) : null}
          {item.note ? (
            <AppText variant="caption" tone="muted">
              {item.note}
            </AppText>
          ) : null}
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Xóa ${item.label}`}
        onPress={onRemove}
        hitSlop={6}
        style={styles.removeBtn}
      >
        <AppIcon name="trash-outline" size={18} tone="muted" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  headerBlock: { gap: spacing.sm },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  segments: {
    flexDirection: "row",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    borderCurve: "continuous",
    padding: spacing.xs,
    gap: spacing.xs,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: touchTarget - 8,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentActive: { backgroundColor: colors.primary },
  progressCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderCurve: "continuous",
    padding: spacing.md,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  progressTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    overflow: "hidden",
  },
  progressFill: {
    height: 6,
    backgroundColor: colors.success,
    borderRadius: radius.pill,
  },
  form: { gap: spacing.sm },
  row: { flexDirection: "row", gap: spacing.sm },
  cell: { flex: 1 },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  boughtHead: { gap: spacing.xxs },
  boughtActions: { gap: spacing.xs, marginTop: spacing.xs },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  boughtRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  movePick: {
    minWidth: 36,
    minHeight: touchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  smallBox: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  smallBoxOn: { backgroundColor: colors.success, borderColor: colors.success },
  boughtMain: { flex: 1 },
  check: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: touchTarget,
  },
  box: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { backgroundColor: colors.primary },
  text: { flex: 1, gap: spacing.xxs },
  done: { textDecorationLine: "line-through", color: colors.textMuted },
  removeBtn: {
    width: touchTarget - 8,
    height: touchTarget - 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
});
