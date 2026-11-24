import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { BottomSheetModal } from '@/components/BottomSheetModal';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { spacing } from '@/theme/tokens';

import { MAX_TIMER_SECONDS, MIN_TIMER_SECONDS } from './timer';

export type TimerEditModalProps = {
  visible: boolean;
  stepNumber: number;
  initialSeconds: number;
  onSave: (seconds: number) => void;
  onClose: () => void;
};

export function TimerEditModal(props: TimerEditModalProps) {
  if (!props.visible) return null;

  return (
    <BottomSheetModal
      visible
      title={`Hẹn giờ bước ${props.stepNumber}`}
      subtitle="Nhập thời gian nấu cho bước này (từ 5 giây đến 180 phút)"
      onClose={props.onClose}
      testID="timer-edit-modal"
    >
      <TimerEditContent key={`${props.stepNumber}-${props.initialSeconds}`} {...props} />
    </BottomSheetModal>
  );
}

function TimerEditContent({
  initialSeconds,
  onSave,
  onClose,
}: TimerEditModalProps) {
  const safe = Math.max(0, initialSeconds);
  const [minutesStr, setMinutesStr] = useState(() => Math.floor(safe / 60).toString());
  const [secondsStr, setSecondsStr] = useState(() => (safe % 60).toString());
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    const m = parseInt(minutesStr, 10) || 0;
    const s = parseInt(secondsStr, 10) || 0;
    const total = m * 60 + s;

    if (total < MIN_TIMER_SECONDS) {
      setError(`Thời gian tối thiểu là ${MIN_TIMER_SECONDS} giây.`);
      return;
    }
    if (total > MAX_TIMER_SECONDS) {
      setError('Thời gian tối đa là 180 phút (3 giờ).');
      return;
    }

    onSave(total);
  };

  const addMinutes = (delta: number) => {
    const cur = parseInt(minutesStr, 10) || 0;
    const next = Math.max(0, cur + delta);
    setMinutesStr(next.toString());
    setError(null);
  };

  return (
    <View style={styles.content}>
      <View style={styles.inputRow}>
        <View style={styles.inputCol}>
          <TextField
            label="Phút"
            value={minutesStr}
            onChangeText={(val) => {
              setMinutesStr(val.replace(/[^0-9]/g, ''));
              setError(null);
            }}
            keyboardType="number-pad"
            maxLength={3}
            placeholder="0"
            testID="timer-input-minutes"
          />
        </View>
        <AppText variant="title" style={styles.colon}>
          :
        </AppText>
        <View style={styles.inputCol}>
          <TextField
            label="Giây"
            value={secondsStr}
            onChangeText={(val) => {
              setSecondsStr(val.replace(/[^0-9]/g, ''));
              setError(null);
            }}
            keyboardType="number-pad"
            maxLength={2}
            placeholder="00"
            testID="timer-input-seconds"
          />
        </View>
      </View>

      <View style={styles.quickChips}>
        <Button title="+1 phút" variant="soft" size="sm" fullWidth={false} onPress={() => addMinutes(1)} />
        <Button title="+3 phút" variant="soft" size="sm" fullWidth={false} onPress={() => addMinutes(3)} />
        <Button title="+5 phút" variant="soft" size="sm" fullWidth={false} onPress={() => addMinutes(5)} />
      </View>

      {error ? (
        <AppText variant="caption" tone="danger" testID="timer-modal-error">
          {error}
        </AppText>
      ) : null}

      <View style={styles.actions}>
        <Button title="Lưu" icon="checkmark" onPress={handleSave} testID="timer-save-btn" />
        <Button title="Hủy" variant="secondary" onPress={onClose} testID="timer-cancel-btn" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  inputRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  inputCol: { flex: 1 },
  colon: { marginTop: spacing.xl, fontSize: 24 },
  quickChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actions: { gap: spacing.sm, marginTop: spacing.xs },
});
