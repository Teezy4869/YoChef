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
