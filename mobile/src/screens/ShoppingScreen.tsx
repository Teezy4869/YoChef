import { useFocusEffect } from '@react-navigation/native';
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
import { colors, radius, spacing, touchTarget } from '@/theme/tokens';

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
      <AppText variant="title">Đi chợ</AppText>
      {list.items.length > 0 ? (
        <AppText tone="muted" testID="shopping-progress">{`Đã mua ${bought.length}/${list.items.length}`}</AppText>
      ) : null}
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
          {bought.map((i) => (
            <ItemRow key={i.id} item={i} onToggle={() => list.toggle(i)} onRemove={() => list.remove(i)} />
          ))}
          <Button title={`Xóa các món đã mua (${bought.length})`} variant="secondary" onPress={list.clearChecked} />
        </View>
      ) : null}
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
  form: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  cell: { flex: 1 },
  section: { gap: spacing.sm },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
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
