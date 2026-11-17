import { useKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Vibration, View } from 'react-native';

import type { RootStackScreenProps } from '@/app/navigation/types';
import { AppText } from '@/components/AppText';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Screen } from '@/components/Screen';
import { formatClock, formatSeconds } from '@/features/recipes/format';
import { IngredientRows } from '@/features/recipes/IngredientRows';
import { clearSession, FRESH_SESSION, loadSession, saveSession, type CookingSession } from '@/features/recipes/cookingSession';
import { clampServings } from '@/features/recipes/servings';
import { remainingSeconds, type TimerState } from '@/features/recipes/timer';
import { cancelAlarm, scheduleAlarm } from '@/features/recipes/timerAlarms';
import type { RecipeDetail } from '@/features/recipes/types';
import { useRecipeDetail } from '@/features/recipes/useRecipeDetail';
import { useStepTimers } from '@/features/recipes/useStepTimers';
import { useSupabase } from '@/lib/supabase';
import { colors, radius, shadows, spacing } from '@/theme/tokens';

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
      steps.forEach((s) => void cancelAlarm(slug, s.stepNumber));
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
  const steps = recipe.steps;
  const [index, setIndex] = useState(from.stepIndex);
  const [completed, setCompleted] = useState(from.completed);
  const [showIngredients, setShowIngredients] = useState(false);
  const alarm = useCallback(() => Vibration.vibrate(ALARM_PATTERN), []);
  const timers = useStepTimers(alarm, Date.now, from.timers);
  const [alarmsOff, setAlarmsOff] = useState(false);
  const { slug, name } = recipe;

  // Also ring in the background (spec 20); false means permission refused or unavailable.
  const ring = (stepNumber: number, s: TimerState) => {
    if (s.status === 'running') void scheduleAlarm(slug, stepNumber, name, s.endsAt).then((ok) => setAlarmsOff(!ok));
  };
  const silence = (stepNumber: number, s: TimerState) => {
    if (s.status !== 'running') void cancelAlarm(slug, stepNumber);
  };

  // Leaving the screen keeps the session and its alarms; only finishing or starting over ends them.
  const currentStepNumber = steps[index].stepNumber;
  useEffect(() => {
    saveSession(slug, currentStepNumber, completed, timers.all, Date.now());
  }, [slug, currentStepNumber, completed, timers.all]);

  const finish = () => {
    steps.forEach((s) => void cancelAlarm(slug, s.stepNumber));
    clearSession(slug);
    onExit();
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
  const hasTimer = step.timerEnabled && step.durationSeconds !== null;
  const duration = step.durationSeconds ?? 0;

  const doneSteps = steps.filter((s) => timers.get(s.stepNumber).status === 'done');
  const otherRunning = steps.filter((s) => s.stepNumber !== step.stepNumber && timers.running.includes(s.stepNumber));
  // Spec 21 §2: progress counts completed steps, not the step on screen.
  const progress = completed.length / steps.length;

  return (
    <Screen edges={['left', 'right', 'bottom']} testID="cooking-mode">
      {/* Modern Coral Progress Bar */}
      <View
        style={styles.progress}
        testID="cooking-progress"
        accessibilityRole="progressbar"
        accessibilityLabel="Số bước đã xong"
        accessibilityValue={{ min: 0, max: steps.length, now: completed.length }}
      >
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      <View style={styles.topMeta}>
        <AppText variant="caption" tone="muted" numberOfLines={1} style={styles.recipeNameText}>
          {recipe.name}
        </AppText>
        <View style={styles.counterBadge}>
          <AppText variant="label" tone="primary" testID="step-counter" style={styles.counterText}>
            {`Bước ${index + 1}/${steps.length}`}
          </AppText>
        </View>
      </View>

      {doneSteps.map((s) => (
        <View key={s.stepNumber} style={styles.alarm} testID="timer-done">
          <Banner tone="success" message={`Hết giờ bước ${s.stepNumber}!`} />
          <Button title={`Tắt báo bước ${s.stepNumber}`} variant="secondary" onPress={() => silence(s.stepNumber, timers.reset(s.stepNumber))} />
        </View>
      ))}

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Flashcard to bản phong cách cooking-recipes */}
        <View style={styles.flashcard}>
          <AppText style={styles.instruction} testID="step-instruction">
            {step.instruction}
          </AppText>

          {stepDone ? (
            <View style={styles.stepDone} testID="step-done">
              <AppText variant="label" tone="success" style={styles.stepDoneLabel}>
                ✓ Bước này đã xong
              </AppText>
              <Button title="Đánh dấu chưa xong" variant="ghost" onPress={unmark} />
            </View>
          ) : null}

          {hasTimer ? (
            <View style={styles.timer} testID="timer-panel">
              <View style={styles.timerHeader}>
                <AppText variant="caption" tone="muted" style={styles.timerTitle}>
                  {`Hẹn giờ ${formatSeconds(duration)}`}
                </AppText>
              </View>
              <AppText variant="display" accessibilityRole="timer" testID="timer-clock" style={styles.timerClock}>
                {formatClock(remainingSeconds(state, duration, timers.clock))}
              </AppText>
              <View style={styles.timerButtons}>
                {state.status === 'idle' ? (
                  <Button title="Bắt đầu hẹn giờ" onPress={() => ring(step.stepNumber, timers.start(step.stepNumber, duration))} />
                ) : null}
                {state.status === 'running' ? (
                  <Button title="Tạm dừng" variant="secondary" onPress={() => silence(step.stepNumber, timers.pause(step.stepNumber))} />
                ) : null}
                {state.status === 'paused' ? (
                  <Button title="Tiếp tục" onPress={() => ring(step.stepNumber, timers.resume(step.stepNumber))} />
                ) : null}
                {state.status !== 'idle' ? (
                  <Button title="Đặt lại" variant="ghost" onPress={() => silence(step.stepNumber, timers.reset(step.stepNumber))} />
                ) : null}
              </View>
              {alarmsOff ? (
                <AppText variant="caption" tone="muted" testID="alarm-off-hint">
                  Thông báo đang tắt: hẹn giờ chỉ báo khi YoChef đang mở.
                </AppText>
              ) : null}
            </View>
          ) : null}
        </View>

        {otherRunning.length > 0 ? (
          <View style={styles.running}>
            <AppText variant="label" style={styles.runningTitle}>
              Đang hẹn giờ ở bước khác
            </AppText>
            <View style={styles.chips}>
              {otherRunning.map((s) => (
                <Chip
                  key={s.stepNumber}
                  label={`Bước ${s.stepNumber} · ${formatClock(remainingSeconds(timers.get(s.stepNumber), s.durationSeconds ?? 0, timers.clock))}`}
                  selected={false}
                  onPress={() => setIndex(steps.indexOf(s))}
                />
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.ingredientsToggleCard}>
          <Button
            title={showIngredients ? 'Ẩn nguyên liệu' : 'Xem nguyên liệu'}
            variant="secondary"
            onPress={() => setShowIngredients((v) => !v)}
          />
          {showIngredients ? (
            <View testID="cooking-ingredients" style={styles.ingredientsBox}>
              <AppText variant="caption" tone="muted" style={styles.ingServings}>
                {`Cho ${effectiveServings} người`}
              </AppText>
              <IngredientRows
                ingredients={recipe.ingredients}
                defaultServings={recipe.defaultServings}
                servings={effectiveServings}
              />
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Modern Controls Bar */}
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
            <Button title="Hoàn thành" onPress={finish} />
          ) : (
            <Button title="Bước tiếp" onPress={next} />
          )}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  progress: { height: 6, borderRadius: 3, backgroundColor: colors.borderLight, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: colors.primary },
  topMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  recipeNameText: {
    flex: 1,
    fontSize: 13,
  },
  counterBadge: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  counterText: {
    fontWeight: '700',
    fontSize: 13,
  },
  body: { gap: spacing.lg, paddingVertical: spacing.md },
  flashcard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: spacing.lg,
    ...shadows.card,
  },
  instruction: {
    fontSize: 20,
    lineHeight: 30,
    fontWeight: '500',
    color: colors.text,
  },
  timer: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
  },
  timerHeader: {
    marginBottom: 2,
  },
  timerTitle: {
    fontWeight: '600',
    fontSize: 12,
  },
  timerClock: {
    fontSize: 36,
    lineHeight: 44,
    fontWeight: '800',
    color: colors.primary,
  },
  timerButtons: { alignSelf: 'stretch', gap: spacing.sm },
  alarm: { gap: spacing.sm },
  stepDone: {
    gap: spacing.xs,
    alignItems: 'flex-start',
    backgroundColor: colors.successSoft,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  stepDoneLabel: {
    fontWeight: '700',
  },
  running: { gap: spacing.sm },
  runningTitle: {
    fontWeight: '700',
    fontSize: 15,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  ingredientsToggleCard: {
    gap: spacing.sm,
  },
  ingredientsBox: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: spacing.sm,
    ...shadows.subtle,
  },
  ingServings: {
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  nav: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  navButton: { flex: 1 },
});
