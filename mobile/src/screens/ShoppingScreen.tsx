import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { SignInPrompt } from '@/components/SignInPrompt';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/features/auth/AuthProvider';
import { MoveToPantryModal } from '@/features/pantry/MoveToPantryModal';
import { PantryTab } from '@/features/pantry/PantryTab';
import { usePantry } from '@/features/pantry/usePantry';
import { formatQuantity } from '@/features/recipes/servings';
import type { ManualErrors, ShoppingItem } from '@/features/shopping/shoppingApi';
import { useShoppingList } from '@/features/shopping/useShoppingList';
import { useSupabase } from '@/lib/supabase';
import { colors, radius, spacing, touchTarget } from '@/theme/tokens';

type Segment = 'shopping' | 'pantry';

export function ShoppingScreen() {
  const { status, session } = useAuth();
  if (status !== 'signedIn' || !session) {
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
export function itemQuantity(item: Pick<ShoppingItem, 'quantity' | 'unit'>): string {
  if (item.quantity === null) return '';
  const q = formatQuantity(item.quantity, true);
  return item.unit ? `${q} ${item.unit}` : q;
}

function ShoppingView({ userId }: { userId: string }) {
  const supabase = useSupabase();
  const list = useShoppingList(supabase, userId);
  const pantry = usePantry(supabase, userId);
  const { reload: reloadList } = list;
  const { reload: reloadPantry } = pantry;

  // Items added from a recipe page or deducted in cooking appear when the tab comes back into view.
  useFocusEffect(
    useCallback(() => {
      reloadList();
      reloadPantry();
    }, [reloadList, reloadPantry]),
  );

  const [segment, setSegment] = useState<Segment>('shopping');
  const [label, setLabel] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [errors, setErrors] = useState<ManualErrors>({});
  const [saving, setSaving] = useState(false);

  // Track bought items unchecked by the user from being moved to pantry
  const [deselectedForPantry, setDeselectedForPantry] = useState<Set<string>>(() => new Set());
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [movedNotice, setMovedNotice] = useState<string | null>(null);

  const toBuy = useMemo(() => list.items.filter((i) => !i.isChecked), [list.items]);
  const bought = useMemo(() => list.items.filter((i) => i.isChecked), [list.items]);
  const selectedForPantry = useMemo(
    () => bought.filter((i) => !deselectedForPantry.has(i.id)),
    [bought, deselectedForPantry],
  );

  const toggleMoveSelect = (id: string) => {
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
    setErrors({});
    setLabel('');
    setQuantity('');
    setUnit('');
  };

  const header = (
    <>
      <AppText variant="title">Đi chợ & Tủ lạnh</AppText>
      <View style={styles.segments} testID="shopping-segments">
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: segment === 'shopping' }}
          onPress={() => setSegment('shopping')}
          style={[styles.segmentBtn, segment === 'shopping' ? styles.segmentActive : null]}
          testID="segment-shopping"
        >
          <AppText variant="label" tone={segment === 'shopping' ? 'onPrimary' : 'default'}>
            {`Cần mua (${toBuy.length})`}
          </AppText>
        </Pressable>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: segment === 'pantry' }}
          onPress={() => setSegment('pantry')}
          style={[styles.segmentBtn, segment === 'pantry' ? styles.segmentActive : null]}
          testID="segment-pantry"
        >
          <AppText variant="label" tone={segment === 'pantry' ? 'onPrimary' : 'default'}>
            {`Tủ lạnh (${pantry.items.length})`}
          </AppText>
        </Pressable>
      </View>
    </>
  );

  if (segment === 'pantry') {
    return (
      <Screen testID="shopping">
        {header}
        <PantryTab pantry={pantry} />
      </Screen>
    );
  }

  if (list.loading) {
    return (
      <Screen centered testID="shopping-loading">
        <ActivityIndicator color={colors.primary} size="large" accessibilityLabel="Đang tải danh sách đi chợ" />
      </Screen>
    );
  }
  if (list.error && list.items.length === 0) {
    return (
      <Screen centered testID="shopping-error">
        <Banner tone="error" message={list.error} />
        <Button title="Thử lại" onPress={list.reload} />
      </Screen>
    );
  }

  return (
    <Screen testID="shopping">
      {header}
      {list.items.length > 0 ? (
        <AppText tone="muted" testID="shopping-progress">{`Đã mua ${bought.length}/${list.items.length}`}</AppText>
      ) : null}
      {movedNotice ? <Banner tone="success" message={movedNotice} /> : null}
      {list.actionError ? <Banner tone="error" message={list.actionError} /> : null}

      <View style={styles.form}>
        <TextField label="Món cần mua" value={label} onChangeText={setLabel} error={errors.label} maxLength={100} />
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
            <TextField label="Đơn vị" value={unit} onChangeText={setUnit} error={errors.unit} maxLength={50} />
          </View>
        </View>
        <Button title="Thêm vào danh sách" onPress={submit} loading={saving} />
      </View>

      {list.items.length === 0 ? (
        <AppText tone="muted" testID="shopping-empty">
          Danh sách đang trống. Thêm món ở trên, hoặc bấm “Thêm vào đi chợ” trên trang công thức.
        </AppText>
      ) : null}

      {toBuy.length > 0 ? (
        <View style={styles.section} testID="shopping-to-buy">
          <AppText variant="heading">Cần mua</AppText>
          {toBuy.map((i) => (
            <ItemRow key={i.id} item={i} onToggle={() => list.toggle(i)} onRemove={() => list.remove(i)} />
          ))}
        </View>
      ) : null}

      {bought.length > 0 ? (
        <View style={styles.section} testID="shopping-bought">
          <AppText variant="heading">Đã mua</AppText>
          <AppText variant="caption" tone="muted">
            Chọn các món muốn cất rồi nhấn “Cất vào tủ lạnh”.
          </AppText>
          {bought.map((i) => (
            <View key={i.id} style={styles.boughtRow}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: !deselectedForPantry.has(i.id) }}
                accessibilityLabel={`Chọn cất ${i.label} vào tủ lạnh`}
                onPress={() => toggleMoveSelect(i.id)}
                style={styles.movePick}
              >
                <View style={[styles.smallBox, !deselectedForPantry.has(i.id) ? styles.smallBoxOn : null]}>
                  {!deselectedForPantry.has(i.id) ? (
                    <AppText variant="caption" tone="onPrimary">
                      ✓
                    </AppText>
                  ) : null}
                </View>
              </Pressable>
              <View style={styles.boughtMain}>
                <ItemRow item={i} onToggle={() => list.toggle(i)} onRemove={() => list.remove(i)} />
              </View>
            </View>
          ))}
          <Button
            title={`Cất vào tủ lạnh (${selectedForPantry.length})`}
            disabled={selectedForPantry.length === 0}
            onPress={() => setShowMoveModal(true)}
            testID="move-to-pantry-btn"
          />
          <Button title={`Xóa các món đã mua (${bought.length})`} variant="secondary" onPress={list.clearChecked} />
        </View>
      ) : null}

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

function ItemRow({ item, onToggle, onRemove }: { item: ShoppingItem; onToggle: () => void; onRemove: () => void }) {
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
          {item.isChecked ? <AppText tone="onPrimary">✓</AppText> : null}
        </View>
        <View style={styles.text}>
          <AppText style={item.isChecked ? styles.done : null}>{item.label}</AppText>
          {qty ? <AppText tone="muted">{qty}</AppText> : null}
          {item.note ? (
            <AppText variant="caption" tone="muted">
              {item.note}
            </AppText>
          ) : null}
        </View>
      </Pressable>
      <Button title="Xóa" accessibilityLabel={`Xóa ${item.label}`} variant="ghost" fullWidth={false} onPress={onRemove} />
    </View>
  );
}

const styles = StyleSheet.create({
  segments: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.xxs,
    gap: spacing.xxs,
  },
  segmentBtn: {
    flex: 1,
    minHeight: touchTarget - 6,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: { backgroundColor: colors.primary },
  form: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  cell: { flex: 1 },
  section: { gap: spacing.sm },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  boughtRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  movePick: {
    minWidth: 36,
    minHeight: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallBox: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallBoxOn: { backgroundColor: colors.success, borderColor: colors.success },
  boughtMain: { flex: 1 },
  check: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: touchTarget },
  box: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.primary },
  text: { flex: 1, gap: spacing.xxs },
  done: { textDecorationLine: 'line-through', color: colors.textMuted },
});
