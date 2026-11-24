import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Screen } from '@/components/Screen';
import { colors, radius, spacing } from '@/theme/tokens';

// Shown instead of the app when the environment is not safe to use (fail-closed).
// No Supabase client exists while this screen is up, so nothing touches the network.
export function ConfigErrorScreen({ problems }: { problems: string[] }) {
  return (
    <Screen centered testID="config-error">
      <AppText variant="title">Chưa cấu hình xong</AppText>
      <AppText tone="muted">
        YoChef không kết nối tới máy chủ khi cấu hình chưa hợp lệ. Người phát triển cần sửa file app/.env rồi
        khởi động lại.
      </AppText>
      <View style={styles.list}>
        {problems.map((p) => (
          <AppText key={p} tone="danger">
            • {p}
          </AppText>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
  },
});
