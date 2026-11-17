import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { SignInPrompt } from '@/components/SignInPrompt';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatQuantity } from '@/features/recipes/servings';
import type { ManualErrors, ShoppingItem } from '@/features/shopping/shoppingApi';
import { useShoppingList } from '@/features/shopping/useShoppingList';
import { useSupabase } from '@/lib/supabase';
import { colors, radius, shadows, spacing, touchTarget } from '@/theme/tokens';

export function ShoppingScreen() {
  const { status, session } = useAuth();
  if (status !== 'signedIn' || !session) {
    return (
      <SignInPrompt
        title="Đi chợ"
        message="Đăng nhập để lưu nguyên liệu cần mua từ công thức và tự thêm món."
        testID="shopping-guest"
      />
    );
  }
  // key: a different user starts from a clean list.
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
  const { reload } = list;
  // Items added from a recipe page appear when the tab comes back into view.
  useFocusEffect(reload);

  const [label, setLabel] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [errors, setErrors] = useState<ManualErrors>({});
  const [saving, setSaving] = useState(false);

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

  const toBuy = list.items.filter((i) => !i.isChecked);
  const bought = list.items.filter((i) => i.isChecked);

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

  return (
    <Screen testID="shopping">
      <View style={styles.header}>
        <AppText variant="title" style={styles.title}>
          Danh sách đi chợ
        </AppText>
        {list.items.length > 0 ? (
          <View style={styles.progressBadge}>
            <Ionicons name="basket-outline" size={14} color={colors.primary} />
            <AppText tone="primary" testID="shopping-progress" style={styles.progressText}>
              {`Đã mua ${bought.length}/${list.items.length}`}
            </AppText>
          </View>
        ) : null}
      </View>

      {list.actionError ? <Banner tone="error" message={list.actionError} /> : null}

      {/* Modern Add Item Card */}
      <View style={styles.formCard}>
        <AppText variant="heading" style={styles.formTitle}>
          Thêm nguyên liệu cần mua
        </AppText>
        <TextField label="Món cần mua" value={label} onChangeText={setLabel} error={errors.label} maxLength={100} placeholder="Ví dụ: Thịt ba chỉ, Hành lá..." />
        <View style={styles.row}>
          <View style={styles.cell}>
            <TextField
              label="Số lượng"
              value={quantity}
              onChangeText={setQuantity}
              error={errors.quantity}
              keyboardType="decimal-pad"
              hint="Để trống nếu không rõ"
              placeholder="300"
            />
          </View>
          <View style={styles.cell}>
            <TextField label="Đơn vị" value={unit} onChangeText={setUnit} error={errors.unit} maxLength={50} placeholder="g, kg, quả..." />
          </View>
        </View>
        <Button title="Thêm vào danh sách" onPress={submit} loading={saving} />
      </View>

      {list.items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="cart-outline" size={48} color={colors.textMuted} />
          <AppText tone="muted" align="center" testID="shopping-empty">
            Danh sách đang trống. Thêm món ở trên, hoặc bấm “Thêm vào đi chợ” trên trang công thức.
          </AppText>
        </View>
      ) : null}

      {toBuy.length > 0 ? (
        <View style={styles.section} testID="shopping-to-buy">
          <View style={styles.sectionHeaderRow}>
            <AppText variant="heading" style={styles.sectionTitle}>Cần mua</AppText>
            <View style={styles.countBadge}>
              <AppText variant="caption" style={styles.countText}>{toBuy.length}</AppText>
            </View>
          </View>
          <View style={styles.itemsList}>
            {toBuy.map((i) => (
              <ItemRow key={i.id} item={i} onToggle={() => list.toggle(i)} onRemove={() => list.remove(i)} />
            ))}
          </View>
        </View>
      ) : null}

      {bought.length > 0 ? (
        <View style={styles.section} testID="shopping-bought">
          <View style={styles.sectionHeaderRow}>
            <AppText variant="heading" style={styles.sectionTitle}>Đã mua</AppText>
            <View style={[styles.countBadge, styles.boughtCountBadge]}>
              <AppText variant="caption" style={styles.boughtCountText}>{bought.length}</AppText>
            </View>
          </View>
          <View style={styles.itemsList}>
            {bought.map((i) => (
              <ItemRow key={i.id} item={i} onToggle={() => list.toggle(i)} onRemove={() => list.remove(i)} />
            ))}
          </View>
          <Button title={`Xóa các món đã mua (${bought.length})`} variant="secondary" onPress={list.clearChecked} />
        </View>
      ) : null}
    </Screen>
  );
}

function ItemRow({ item, onToggle, onRemove }: { item: ShoppingItem; onToggle: () => void; onRemove: () => void }) {
  const qty = itemQuantity(item);
  return (
    <View style={styles.itemCard} testID="shopping-item">
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.isChecked }}
        accessibilityLabel={qty ? `${item.label}, ${qty}` : item.label}
        onPress={onToggle}
        style={styles.check}
      >
        <View style={[styles.box, item.isChecked ? styles.boxOn : null]}>
          {item.isChecked ? <Ionicons name="checkmark" size={16} color={colors.textOnPrimary} /> : null}
        </View>
        <View style={styles.text}>
          <AppText style={item.isChecked ? styles.done : styles.itemLabel}>{item.label}</AppText>
          {qty ? <AppText tone="muted" style={styles.itemQty}>{qty}</AppText> : null}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
  },
  progressBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  progressText: {
    fontWeight: '700',
    fontSize: 12,
  },
  formCard: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: spacing.sm,
    ...shadows.card,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  row: { flexDirection: 'row', gap: spacing.sm },
  cell: { flex: 1 },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.md,
  },
  section: { gap: spacing.sm, marginTop: spacing.sm },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  countBadge: {
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  countText: {
    fontWeight: '700',
    fontSize: 12,
    color: colors.text,
  },
  boughtCountBadge: {
    backgroundColor: colors.successSoft,
  },
  boughtCountText: {
    fontWeight: '700',
    fontSize: 12,
    color: colors.success,
  },
  itemsList: {
    gap: spacing.xs,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.subtle,
  },
  check: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: touchTarget },
  box: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  text: { flex: 1, gap: spacing.xxs },
  itemLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
  },
  itemQty: {
    fontSize: 13,
  },
  done: { textDecorationLine: 'line-through', color: colors.textMuted },
});
