// Step timers as pure functions over wall-clock time. A running timer stores
// the instant it ends (not a counter), so it stays correct when the app is
// throttled or briefly backgrounded.

export type TimerState =
  | { status: 'idle' }
  | { status: 'running'; endsAt: number }
  | { status: 'paused'; remainingMs: number }
  | { status: 'done' };

export const IDLE: TimerState = { status: 'idle' };

export function start(durationSeconds: number, now: number): TimerState {
  return { status: 'running', endsAt: now + durationSeconds * 1000 };
}

export function pause(state: TimerState, now: number): TimerState {
  return state.status === 'running' ? { status: 'paused', remainingMs: Math.max(0, state.endsAt - now) } : state;
}

export function resume(state: TimerState, now: number): TimerState {
  if (state.status !== 'paused') return state;
  return state.remainingMs <= 0 ? { status: 'done' } : { status: 'running', endsAt: now + state.remainingMs };
}

/** A running timer whose end has passed becomes done. */
export function settle(state: TimerState, now: number): TimerState {
  return state.status === 'running' && now >= state.endsAt ? { status: 'done' } : state;
}

export function remainingSeconds(state: TimerState, durationSeconds: number, now: number): number {
  switch (state.status) {
    case 'idle':
      return durationSeconds;
    case 'running':
      return Math.max(0, (state.endsAt - now) / 1000);
    case 'paused':
      return state.remainingMs / 1000;
    case 'done':
      return 0;
  }
}

export function isActive(state: TimerState): boolean {
  return state.status === 'running';
}

export const MIN_TIMER_SECONDS = 5;
export const MAX_TIMER_SECONDS = 180 * 60; // 3 hours

/**
 * Adjusts the remaining time of a running or paused timer by deltaSeconds.
 * Never drops below minSeconds. Idle and done timers are unchanged.
 */
export function adjustRemaining(
  state: TimerState,
  deltaSeconds: number,
  now: number,
  minSeconds = MIN_TIMER_SECONDS,
): TimerState {
  if (state.status === 'running') {
    const curRemainingMs = Math.max(0, state.endsAt - now);
    const newRemainingMs = Math.max(minSeconds * 1000, curRemainingMs + deltaSeconds * 1000);
    return { status: 'running', endsAt: now + newRemainingMs };
  }
  if (state.status === 'paused') {
    const newRemainingMs = Math.max(minSeconds * 1000, state.remainingMs + deltaSeconds * 1000);
    return { status: 'paused', remainingMs: newRemainingMs };
  }
  return state;
}

/**
 * Sets the exact remaining time of a running or paused timer to newSeconds.
 * Clamped to at least minSeconds. Idle and done timers are unchanged.
 */
export function setRemaining(
  state: TimerState,
  newSeconds: number,
  now: number,
  minSeconds = MIN_TIMER_SECONDS,
): TimerState {
  const safeSeconds = Math.max(minSeconds, newSeconds);
  if (state.status === 'running') {
    return { status: 'running', endsAt: now + safeSeconds * 1000 };
  }
  if (state.status === 'paused') {
    return { status: 'paused', remainingMs: safeSeconds * 1000 };
  }
  return state;
}
