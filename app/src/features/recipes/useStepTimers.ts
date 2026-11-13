import { useCallback, useEffect, useRef, useState } from 'react';

import { IDLE, isActive, pause, resume, settle, start, type TimerState } from './timer';

const TICK_MS = 250;
type Timers = Record<number, TimerState>;

/**
 * One timer per step number. `onDone(step)` fires exactly once when a running
 * timer reaches zero. `now` is injectable for tests.
 *
 * The ref is the source of truth and state mirrors it for rendering, so side
 * effects (onDone) never run inside a state updater.
 */
export function useStepTimers(onDone: (stepNumber: number) => void, now: () => number = Date.now) {
  const ref = useRef<Timers>({});
  const [timers, setTimers] = useState<Timers>({});
  const [clock, setClock] = useState(() => now());
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const commit = useCallback((next: Timers) => {
    ref.current = next;
    setTimers(next);
  }, []);

  const anyRunning = Object.values(timers).some(isActive);

  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(() => {
      const t = now();
      setClock(t);
      const finished: number[] = [];
      const next: Timers = { ...ref.current };
      for (const [k, st] of Object.entries(ref.current)) {
        const settled = settle(st, t);
        if (settled !== st) {
          next[Number(k)] = settled;
          finished.push(Number(k));
        }
      }
      if (finished.length > 0) {
        commit(next);
        finished.forEach((step) => onDoneRef.current(step));
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [anyRunning, now, commit]);

  const update = useCallback(
    (step: number, fn: (s: TimerState, t: number) => TimerState) => {
      const t = now();
      setClock(t);
      commit({ ...ref.current, [step]: fn(ref.current[step] ?? IDLE, t) });
    },
    [now, commit],
  );

  return {
    clock,
    get: (step: number): TimerState => timers[step] ?? IDLE,
    start: (step: number, durationSeconds: number) => update(step, (_s, t) => start(durationSeconds, t)),
    pause: (step: number) => update(step, (s, t) => pause(s, t)),
    resume: (step: number) => update(step, (s, t) => resume(s, t)),
    reset: (step: number) => update(step, () => IDLE),
    running: Object.entries(timers)
      .filter(([, s]) => isActive(s))
      .map(([k]) => Number(k)),
  };
}
