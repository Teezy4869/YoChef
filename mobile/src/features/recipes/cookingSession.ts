// An unfinished cooking session (spec 21): current step, completed steps and
// step timers, kept on this device for 24 hours so leaving the screen or
// closing the app does not lose them. Nothing is written to Supabase.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { settle, type TimerState } from './timer';

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const sessionKey = (slug: string) => `@yochef/cooking-session/${slug}`;

export type CookingSession = {
  stepIndex: number;
  completed: number[]; // step numbers
  timers: Record<number, TimerState>;
};

export const FRESH_SESSION: CookingSession = { stepIndex: 0, completed: [], timers: {} };

function isTimer(t: unknown): t is TimerState {
  if (typeof t !== 'object' || t === null) return false;
  const s = t as Record<string, unknown>;
  switch (s.status) {
    case 'idle':
    case 'done':
      return true;
    case 'running':
      return typeof s.endsAt === 'number' && Number.isFinite(s.endsAt);
    case 'paused':
      return typeof s.remainingMs === 'number' && Number.isFinite(s.remainingMs) && s.remainingMs >= 0;
    default:
      return false;
  }
}

/**
 * Validates a stored session against the recipe as it is now (spec 21 §3):
 * stale (> 24 h either way, so a changed clock cannot keep it alive), unreadable
 * or empty sessions give null; unknown steps are dropped; the current step is
 * clamped; timers that ended while away are already done.
 */
export function parseSession(raw: string | null, stepNumbers: number[], now: number): CookingSession | null {
  if (!raw || stepNumbers.length === 0) return null;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null || data.v !== 1) return null;
  if (typeof data.savedAt !== 'number' || Math.abs(now - data.savedAt) > SESSION_TTL_MS) return null;

  const known = new Set(stepNumbers);
  const stepNumber = typeof data.stepNumber === 'number' ? data.stepNumber : stepNumbers[0];
  const found = stepNumbers.indexOf(stepNumber);
  const stepIndex = found >= 0 ? found : stepNumber > stepNumbers[stepNumbers.length - 1] ? stepNumbers.length - 1 : 0;

  const completed = Array.isArray(data.completed)
    ? [...new Set(data.completed.filter((n): n is number => typeof n === 'number' && known.has(n)))]
    : [];

  const timers: Record<number, TimerState> = {};
  if (typeof data.timers === 'object' && data.timers !== null) {
    for (const [k, t] of Object.entries(data.timers)) {
      if (known.has(Number(k)) && isTimer(t) && t.status !== 'idle') timers[Number(k)] = settle(t, now);
    }
  }

  if (stepIndex === 0 && completed.length === 0 && Object.keys(timers).length === 0) return null;
  return { stepIndex, completed, timers };
}

export async function loadSession(slug: string, stepNumbers: number[], now: number): Promise<CookingSession | null> {
  try {
    return parseSession(await AsyncStorage.getItem(sessionKey(slug)), stepNumbers, now);
  } catch {
    return null;
  }
}

export function saveSession(slug: string, stepNumber: number, completed: number[], timers: Record<number, TimerState>, now: number) {
  const payload = JSON.stringify({ v: 1, stepNumber, completed, timers, savedAt: now });
  AsyncStorage.setItem(sessionKey(slug), payload).catch(() => undefined); // best effort: cooking goes on without it
}

export function clearSession(slug: string) {
  AsyncStorage.removeItem(sessionKey(slug)).catch(() => undefined);
}
