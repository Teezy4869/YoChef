import { useAudioPlayer } from 'expo-audio';
import { useKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Vibration, View } from 'react-native';

import type { RootStackScreenProps } from '@/app/navigation/types';
import { AppText } from '@/components/AppText';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/features/auth/AuthProvider';
import { DeductPantryModal } from '@/features/pantry/DeductPantryModal';
import { usePantry } from '@/features/pantry/usePantry';
import { formatClock, formatSeconds } from '@/features/recipes/format';
import { IngredientRows } from '@/features/recipes/IngredientRows';
import { clearSession, FRESH_SESSION, loadSession, saveSession, type CookingSession } from '@/features/recipes/cookingSession';
import { clampServings } from '@/features/recipes/servings';
import { MAX_TIMER_SECONDS, MIN_TIMER_SECONDS, remainingSeconds } from '@/features/recipes/timer';
import { TimerEditModal } from '@/features/recipes/TimerEditModal';
import type { RecipeDetail } from '@/features/recipes/types';
import { useRecipeDetail } from '@/features/recipes/useRecipeDetail';
import { useStepTimers } from '@/features/recipes/useStepTimers';
import { useSupabase } from '@/lib/supabase';
import { colors, radius, spacing } from '@/theme/tokens';

const ALARM_PATTERN = [0, 500, 250, 500, 250, 500];

export function CookingModeScreen({ route, navigation }: RootStackScreenProps<'CookingMode'>) {
  const supabase = useSupabase();
  const { loading, error, recipe, notFound, retry } = useRecipeDetail(supabase, route.params.slug);

  if (loading) {
    return (
      <Screen centered testID="cooking-loading">
        <ActivityIndicator color={colors.primary} size="large" accessibilityLabel="Đang tải công thức" />
      </Screen>
    );
  }
  if (error) {
    return (
      <Screen centered testID="cooking-error">
        <Banner tone="error" message={error} />
        <Button title="Thử lại" onPress={retry} />
      </Screen>
    );
  }
  if (notFound || !recipe || recipe.steps.length === 0) {
    return (
      <Screen centered testID="cooking-empty">
        <AppText variant="title">Chưa thể nấu theo công thức này</AppText>
        <AppText tone="muted">Công thức không tồn tại, chưa công bố hoặc chưa có các bước thực hiện.</AppText>
        <Button title="Quay lại" variant="secondary" onPress={() => navigation.goBack()} />
      </Screen>
    );
  }
  return <CookingView recipe={recipe} servings={route.params.servings} onExit={() => navigation.goBack()} />;
}

type Phase = { kind: 'loading' } | { kind: 'ask'; saved: CookingSession } | { kind: 'cook'; from: CookingSession };

/** Offers to resume an unfinished session of this recipe (spec 21) before cooking. */
function CookingView(props: { recipe: RecipeDetail; servings: number | undefined; onExit: () => void }) {
  const { slug, steps } = props.recipe;
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });

  useEffect(() => {
    let active = true;
    loadSession(slug, steps.map((s) => s.stepNumber), Date.now()).then((saved) => {
      if (active) setPhase(saved ? { kind: 'ask', saved } : { kind: 'cook', from: FRESH_SESSION });
    });
    return () => {
      active = false;
    };
  }, [slug, steps]);

  if (phase.kind === 'loading') {
    return (
      <Screen centered testID="cooking-restoring">
        <ActivityIndicator color={colors.primary} size="large" accessibilityLabel="Đang mở phiên nấu" />
      </Screen>
    );
  }
  if (phase.kind === 'ask') {
    const { saved } = phase;
    const startOver = () => {
      clearSession(slug);
      setPhase({ kind: 'cook', from: FRESH_SESSION });
    };
    return (
      <Screen centered testID="cooking-resume">
        <AppText variant="title">Bạn đang nấu dở món này</AppText>
        <AppText tone="muted">
          {`Đang ở bước ${saved.stepIndex + 1}/${steps.length}, đã xong ${saved.completed.length} bước.`}
        </AppText>
        <Button title="Tiếp tục nấu" onPress={() => setPhase({ kind: 'cook', from: saved })} />
        <Button title="Nấu lại từ đầu" variant="secondary" onPress={startOver} />
      </Screen>
    );
  }
  return <CookingRun {...props} from={phase.from} />;
}

function CookingRun({
  recipe,
  servings,
  onExit,
  from,
}: {
  recipe: RecipeDetail;
  servings: number | undefined;
  onExit: () => void;
  from: CookingSession;
}) {
  useKeepAwake(); // hands are busy: the screen stays on while cooking, released on leaving
  const supabase = useSupabase();
  const { status, session } = useAuth();
  const userId = status === 'signedIn' && session ? session.user.id : null;
  const pantry = usePantry(supabase, userId);

  const steps = recipe.steps;
  const [index, setIndex] = useState(from.stepIndex);
  const [completed, setCompleted] = useState(from.completed);
  const [showIngredients, setShowIngredients] = useState(false);
  const [showDeductModal, setShowDeductModal] = useState(false);
  const [customDurations, setCustomDurations] = useState<Record<number, number>>({});
  const [editingStep, setEditingStep] = useState<number | null>(null);
  const audioSource = require('../../assets/sounds/alarm.mp3');
  const player = useAudioPlayer(audioSource);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- expo-audio player configuration property
    player.loop = true;
    return () => {
      player.pause();
    };
  }, [player]);
  const alarm = useCallback(() => Vibration.vibrate(ALARM_PATTERN), []);
  const timers = useStepTimers(alarm, Date.now, from.timers);
  const { slug } = recipe;

  // Leaving the screen keeps the session; only finishing or starting over ends it.
  const currentStepNumber = steps[index].stepNumber;
  useEffect(() => {
    saveSession(slug, currentStepNumber, completed, timers.all, Date.now());
  }, [slug, currentStepNumber, completed, timers.all]);

  const finish = () => {
    setShowDeductModal(false);
    player.pause();
    clearSession(slug);
    onExit();
  };

  const hasPantryMatch = useMemo(() => {
    if (!userId || pantry.items.length === 0) return false;
    const owned = new Set(pantry.items.map((p) => p.ingredientId));
    return recipe.ingredients.some((i) => i.ingredientId !== null && owned.has(i.ingredientId));
  }, [userId, pantry.items, recipe.ingredients]);

  const handleFinishPress = () => {
    if (hasPantryMatch) {
      setShowDeductModal(true);
      return;
    }
    finish();
  };
  const next = () => {
    setCompleted((c) => (c.includes(currentStepNumber) ? c : [...c, currentStepNumber]));
    setIndex((i) => Math.min(steps.length - 1, i + 1));
  };
  // Spec 21 §2: a completed step can be unmarked to repeat it.
  const unmark = () => setCompleted((c) => c.filter((n) => n !== currentStepNumber));
  const stepDone = completed.includes(currentStepNumber);

  const step = steps[index];
  const isLast = index === steps.length - 1;
  const effectiveServings = clampServings(servings ?? recipe.defaultServings ?? 1);
  const state = timers.get(step.stepNumber);
  const defaultDuration = step.timerEnabled && step.durationSeconds !== null ? step.durationSeconds : null;
  const hasCustom = customDurations[step.stepNumber] !== undefined;
  const hasTimer = defaultDuration !== null || hasCustom;
  const duration = customDurations[step.stepNumber] ?? defaultDuration ?? 60;
  const isModified = defaultDuration !== null && hasCustom && customDurations[step.stepNumber] !== defaultDuration;
  const isCustomOnly = defaultDuration === null && hasCustom;

  const adjustTime = (delta: number) => {
    if (state.status === 'idle') {
      const nextDuration = Math.max(MIN_TIMER_SECONDS, Math.min(MAX_TIMER_SECONDS, duration + delta));
      setCustomDurations((prev) => ({ ...prev, [step.stepNumber]: nextDuration }));
    } else if (state.status === 'running') {
      timers.adjust(step.stepNumber, delta);
      const nextDuration = Math.max(MIN_TIMER_SECONDS, Math.min(MAX_TIMER_SECONDS, duration + delta));
      setCustomDurations((prev) => ({ ...prev, [step.stepNumber]: nextDuration }));
    } else if (state.status === 'paused') {
      timers.adjust(step.stepNumber, delta);
      const nextDuration = Math.max(MIN_TIMER_SECONDS, Math.min(MAX_TIMER_SECONDS, duration + delta));
      setCustomDurations((prev) => ({ ...prev, [step.stepNumber]: nextDuration }));
    }
  };

  const resetToDefault = () => {
    if (defaultDuration === null) return;
    setCustomDurations((prev) => {
      const next = { ...prev };
      delete next[step.stepNumber];
      return next;
    });
    if (state.status !== 'idle') {
      timers.reset(step.stepNumber);
    }
  };

  const removeCustomTimer = () => {
    timers.reset(step.stepNumber);
    setCustomDurations((prev) => {
      const next = { ...prev };
      delete next[step.stepNumber];
      return next;
    });
  };

  const handleSaveModal = (savedSeconds: number) => {
    if (editingStep === null) return;
    const sNum = editingStep;
    setCustomDurations((prev) => ({ ...prev, [sNum]: savedSeconds }));
    const sState = timers.get(sNum);
    if (sState.status === 'running' || sState.status === 'paused') {
      timers.setRemaining(sNum, savedSeconds);
    }
    setEditingStep(null);
  };

  const editingTargetStep = steps.find((s) => s.stepNumber === editingStep);
  const editingDefault = editingTargetStep?.timerEnabled && editingTargetStep.durationSeconds !== null ? editingTargetStep.durationSeconds : 60;
  const editingDuration = editingStep !== null ? (customDurations[editingStep] ?? editingDefault) : 60;
  const editingState = editingStep !== null ? timers.get(editingStep) : { status: 'idle' as const };
  const modalInitial = Math.round(remainingSeconds(editingState, editingDuration, timers.clock));

  const doneSteps = steps.filter((s) => timers.get(s.stepNumber).status === 'done');
  const activeDoneStep = doneSteps[0];

  useEffect(() => {
    if (activeDoneStep) {
      player.play();
    } else {
      player.pause();
    }
  }, [activeDoneStep, player]);

  const otherRunning = steps.filter((s) => s.stepNumber !== step.stepNumber && timers.running.includes(s.stepNumber));
  // Spec 21 §2: progress counts completed steps, not the step on screen.
  const progress = completed.length / steps.length;

  return (
    <Screen edges={['left', 'right', 'bottom']} testID="cooking-mode">
      <View
        style={styles.progress}
        testID="cooking-progress"
        accessibilityRole="progressbar"
        accessibilityLabel="Số bước đã xong"
        accessibilityValue={{ min: 0, max: steps.length, now: completed.length }}
      >
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
      <AppText variant="caption" tone="muted">
        {recipe.name}
      </AppText>
      <AppText variant="label" tone="primary" testID="step-counter">
        {`Bước ${index + 1}/${steps.length}`}
      </AppText>

      <ScrollView contentContainerStyle={styles.body}>
        <AppText style={styles.instruction} testID="step-instruction">
          {step.instruction}
        </AppText>

        {stepDone ? (
          <View style={styles.stepDone} testID="step-done">
            <AppText variant="label" tone="success">
              ✓ Bước này đã xong
            </AppText>
            <Button title="Đánh dấu chưa xong" variant="ghost" onPress={unmark} />
          </View>
        ) : null}

        {hasTimer ? (
          <View style={styles.timer} testID="timer-panel">
            <View style={styles.timerHeader}>
              <AppText variant="caption" tone="muted">
                {`Hẹn giờ ${formatSeconds(duration)}`}
              </AppText>
              {isModified && defaultDuration !== null ? (
                <Button
                  title={`Về mặc định (${formatSeconds(defaultDuration)})`}
                  variant="ghost"
                  fullWidth={false}
                  onPress={resetToDefault}
                  testID="reset-default-duration-btn"
                />
              ) : null}
              {isCustomOnly ? (
                <Button
                  title="Xóa hẹn giờ"
                  variant="ghost"
                  fullWidth={false}
                  onPress={removeCustomTimer}
                  testID="remove-custom-timer-btn"
                />
              ) : null}
            </View>

            <Pressable
              onPress={() => setEditingStep(step.stepNumber)}
              accessibilityRole="button"
              accessibilityLabel={`Thời gian: ${formatClock(remainingSeconds(state, duration, timers.clock))}. Chạm để sửa.`}
              testID="timer-clock-pressable"
              style={styles.clockTouchable}
            >
              <AppText variant="display" accessibilityRole="timer" testID="timer-clock">
                {formatClock(remainingSeconds(state, duration, timers.clock))}
              </AppText>
              <AppText variant="caption" tone="primary" style={styles.editHint}>
                ✎ Chạm để sửa thời gian
              </AppText>
            </Pressable>

            <View style={styles.quickAdjustRow} testID="quick-adjust-row">
              <Button title="-1m" variant="secondary" fullWidth={false} onPress={() => adjustTime(-60)} testID="adjust-minus-60" />
              <Button title="+30s" variant="secondary" fullWidth={false} onPress={() => adjustTime(30)} testID="adjust-plus-30" />
              <Button title="+1m" variant="secondary" fullWidth={false} onPress={() => adjustTime(60)} testID="adjust-plus-60" />
            </View>

            <View style={styles.timerButtons}>
              {state.status === 'idle' ? (
                <Button title="Bắt đầu hẹn giờ" onPress={() => timers.start(step.stepNumber, duration)} />
              ) : null}
              {state.status === 'running' ? (
                <Button title="Tạm dừng" variant="secondary" onPress={() => timers.pause(step.stepNumber)} />
              ) : null}
              {state.status === 'paused' ? (
                <Button title="Tiếp tục" onPress={() => timers.resume(step.stepNumber)} />
              ) : null}
              {state.status !== 'idle' ? (
                <Button title="Đặt lại" variant="ghost" onPress={() => timers.reset(step.stepNumber)} />
              ) : null}
            </View>
          </View>
        ) : (
          <View style={styles.addTimerContainer} testID="add-timer-section">
            <Button
              title="+ Thêm hẹn giờ cho bước này"
              variant="secondary"
              onPress={() => setEditingStep(step.stepNumber)}
              testID="add-timer-btn"
            />
          </View>
        )}

        {otherRunning.length > 0 ? (
          <View style={styles.running}>
            <AppText variant="label">Đang hẹn giờ ở bước khác</AppText>
            <View style={styles.chips}>
              {otherRunning.map((s) => {
                const sDur = customDurations[s.stepNumber] ?? s.durationSeconds ?? 0;
                return (
                  <Chip
                    key={s.stepNumber}
                    label={`Bước ${s.stepNumber} · ${formatClock(remainingSeconds(timers.get(s.stepNumber), sDur, timers.clock))}`}
                    selected={false}
                    onPress={() => setIndex(steps.indexOf(s))}
                  />
                );
              })}
            </View>
          </View>
        ) : null}

        <Button
          title={showIngredients ? 'Ẩn nguyên liệu' : 'Xem nguyên liệu'}
          variant="ghost"
          onPress={() => setShowIngredients((v) => !v)}
        />
        {showIngredients ? (
          <View testID="cooking-ingredients">
            <AppText variant="caption" tone="muted">{`Cho ${effectiveServings} người`}</AppText>
            <IngredientRows
              ingredients={recipe.ingredients}
              defaultServings={recipe.defaultServings}
              servings={effectiveServings}
            />
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.nav}>
        <View style={styles.navButton}>
          <Button
            title="Bước trước"
            variant="secondary"
            disabled={index === 0}
            onPress={() => setIndex((i) => Math.max(0, i - 1))}
          />
        </View>
        <View style={styles.navButton}>
          {isLast ? (
            <Button title="Hoàn thành" onPress={handleFinishPress} />
          ) : (
            <Button title="Bước tiếp" onPress={next} />
          )}
        </View>
      </View>

      <TimerEditModal
        visible={editingStep !== null}
        stepNumber={editingStep ?? step.stepNumber}
        initialSeconds={modalInitial}
        onSave={handleSaveModal}
        onClose={() => setEditingStep(null)}
      />

      {showDeductModal ? (
        <DeductPantryModal
          visible
          client={supabase}
          recipe={recipe}
          servings={effectiveServings}
          pantryItems={pantry.items}
          onSkip={finish}
          onDone={finish}
        />
      ) : null}

      {activeDoneStep ? (
        <Modal
          visible
          transparent
          animationType="fade"
          testID="timer-done-modal"
        >
          <View style={styles.doneModalBackdrop}>
            <View style={styles.doneModalCard}>
              <View style={styles.doneModalIcon}>
                <AppText variant="title">⏰</AppText>
              </View>
              <AppText variant="title" style={styles.doneModalTitle}>
                {`Hết giờ bước ${activeDoneStep.stepNumber}!`}
              </AppText>
              <AppText tone="muted" style={styles.doneModalDesc}>
                {activeDoneStep.instruction}
              </AppText>
              <Button
                title="Xác nhận"
                onPress={() => {
                  player.pause();
                  timers.reset(activeDoneStep.stepNumber);
                }}
                testID="timer-done-confirm-btn"
              />
            </View>
          </View>
        </Modal>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  progress: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: colors.primary },
  body: { gap: spacing.lg, paddingVertical: spacing.md },
  instruction: { fontSize: 22, lineHeight: 32 },
  timer: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  timerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  clockTouchable: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  editHint: {
    marginTop: spacing.xs,
  },
  quickAdjustRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    paddingVertical: spacing.xs,
  },
  addTimerContainer: {
    paddingVertical: spacing.sm,
  },
  timerButtons: { alignSelf: 'stretch', gap: spacing.sm },
  doneModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  doneModalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  doneModalIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  doneModalTitle: {
    textAlign: 'center',
  },
  doneModalDesc: {
    textAlign: 'center',
    lineHeight: 22,
  },
  stepDone: { gap: spacing.xs, alignItems: 'flex-start' },
  running: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  nav: { flexDirection: 'row', gap: spacing.md },
  navButton: { flex: 1 },
});
