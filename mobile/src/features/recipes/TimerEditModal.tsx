import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { colors, radius, spacing } from '@/theme/tokens';
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
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={props.onClose}
      testID="timer-edit-modal"
    >
      <TimerEditContent
        key={`${props.stepNumber}-${props.initialSeconds}`}
        {...props}
      />
    </Modal>
  );
}

function TimerEditContent({
  stepNumber,
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
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.backdrop}
    >
      <Pressable style={styles.dismissOverlay} onPress={onClose} accessibilityRole="none" />
      <View style={styles.card}>
        <AppText variant="title">{`Hẹn giờ bước ${stepNumber}`}</AppText>
        <AppText variant="caption" tone="muted">
          Nhập thời gian nấu cho bước này (từ 5 giây đến 180 phút)
        </AppText>

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
          <Button title="+1 phút" variant="ghost" fullWidth={false} onPress={() => addMinutes(1)} />
          <Button title="+3 phút" variant="ghost" fullWidth={false} onPress={() => addMinutes(3)} />
          <Button title="+5 phút" variant="ghost" fullWidth={false} onPress={() => addMinutes(5)} />
        </View>

        {error ? (
          <AppText variant="caption" tone="danger" testID="timer-modal-error">
            {error}
          </AppText>
        ) : null}

        <View style={styles.actions}>
          <Button title="Lưu" onPress={handleSave} testID="timer-save-btn" />
          <Button title="Hủy" variant="secondary" onPress={onClose} testID="timer-cancel-btn" />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  dismissOverlay: {
    ...StyleSheet.absoluteFill,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  inputCol: {
    flex: 1,
  },
  colon: {
    marginTop: spacing.xl,
    fontSize: 24,
  },
  quickChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
