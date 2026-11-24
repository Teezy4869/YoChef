import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { TextField } from '@/components/TextField';
import { useSupabase } from '@/lib/supabase';
import { colors, radius, spacing } from '@/theme/tokens';

import { REPORT_REASONS, submitReport, type ReportReason, type ReportTarget } from './reportsApi';

const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Có lỗi xảy ra. Vui lòng thử lại.');

/** "Báo cáo" under someone else's comment or photo; only rendered for a signed-in user who is not the author. */
export function ReportButton({ userId, table, targetId }: { userId: string; table: ReportTarget; targetId: string }) {
  const supabase = useSupabase();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  if (result?.ok) {
    return (
      <AppText variant="caption" tone="muted" accessibilityLiveRegion="polite">
        {result.text}
      </AppText>
    );
  }
  if (!open) {
    return (
      <Button
        title="Báo cáo"
        icon="flag-outline"
        variant="ghost"
        size="sm"
        fullWidth={false}
        accessibilityLabel={table === 'comments' ? 'Báo cáo bình luận' : 'Báo cáo ảnh'}
        onPress={() => setOpen(true)}
      />
    );
  }

  const send = async () => {
    if (!reason) return;
    setBusy(true);
    try {
      await submitReport(supabase, userId, table, targetId, reason, details);
      setResult({ ok: true, text: 'Đã gửi báo cáo. Cảm ơn bạn.' });
    } catch (e) {
      setResult({ ok: false, text: messageOf(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.box} testID="report-form">
      <AppText variant="label">Lý do báo cáo</AppText>
      <View style={styles.reasons}>
        {REPORT_REASONS.filter((r) => table === 'cooking_photos' || r.value !== 'inappropriate_image').map((r) => (
          <Chip key={r.value} label={r.label} selected={reason === r.value} onPress={() => setReason(r.value)} />
        ))}
      </View>
      <TextField
        label={reason === 'other' ? 'Mô tả (bắt buộc)' : 'Mô tả (không bắt buộc)'}
        value={details}
        onChangeText={setDetails}
        editable={!busy}
        hint={`${Array.from(details.trim()).length}/500`}
      />
      {result ? (
        <AppText tone="danger" accessibilityLiveRegion="polite">
          {result.text}
        </AppText>
      ) : null}
      <View style={styles.reasons}>
        <Button
          title="Gửi báo cáo"
          size="sm"
          fullWidth={false}
          loading={busy}
          disabled={busy || !reason || (reason === 'other' && details.trim() === '')}
          onPress={send}
        />
        <Button title="Hủy" variant="ghost" size="sm" fullWidth={false} disabled={busy} onPress={() => setOpen(false)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
