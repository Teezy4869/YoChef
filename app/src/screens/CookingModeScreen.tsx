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

      {doneSteps.map((s) => (
        <View key={s.stepNumber} style={styles.alarm} testID="timer-done">
          <Banner tone="success" message={`Hết giờ bước ${s.stepNumber}!`} />
          <Button title={`Tắt báo bước ${s.stepNumber}`} variant="secondary" onPress={() => silence(s.stepNumber, timers.reset(s.stepNumber))} />
        </View>
      ))}

      <ScrollView contentContainerStyle={styles.body}>
        <AppText style={styles.instruction} testID="step-instruction">
          {step.instruction}
        </AppText>

        {hasTimer ? (
          <View style={styles.timer} testID="timer-panel">
            <AppText variant="caption" tone="muted">
              {`Hẹn giờ ${formatSeconds(duration)}`}
            </AppText>
            <AppText variant="display" accessibilityRole="timer" testID="timer-clock">
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

        {otherRunning.length > 0 ? (
          <View style={styles.running}>
            <AppText variant="label">Đang hẹn giờ ở bước khác</AppText>
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
  timerButtons: { alignSelf: 'stretch', gap: spacing.sm },
  alarm: { gap: spacing.sm },
  running: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  nav: { flexDirection: 'row', gap: spacing.md },
  navButton: { flex: 1 },
});
