import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, cleanupAsync, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { Vibration } from 'react-native';

import App from '@/app/App';
import { parseSession, SESSION_TTL_MS, sessionKey } from '@/features/recipes/cookingSession';
import { IDLE, pause, remainingSeconds, resume, settle, start } from '@/features/recipes/timer';

import { createFakeSupabase } from './helpers/fakeSupabase';
import { detailRow } from './helpers/recipeFixtures';

const ENV = { url: 'https://bdhphjwhagygbwtfhhxn.supabase.co', key: 'sb_publishable_test' };

describe('timer logic', () => {
  it('runs, pauses, resumes and finishes by wall-clock time', () => {
    const t0 = 1_000_000;
    const running = start(60, t0);
    expect(running).toEqual({ status: 'running', endsAt: t0 + 60_000 });
    expect(remainingSeconds(running, 60, t0 + 15_000)).toBe(45);

    const paused = pause(running, t0 + 20_000);
    expect(paused).toEqual({ status: 'paused', remainingMs: 40_000 });
    // Time passing while paused changes nothing.
    expect(remainingSeconds(paused, 60, t0 + 500_000)).toBe(40);

    const again = resume(paused, t0 + 100_000);
    expect(again).toEqual({ status: 'running', endsAt: t0 + 140_000 });
    expect(settle(again, t0 + 139_999)).toBe(again);
    expect(settle(again, t0 + 140_000)).toEqual({ status: 'done' });
  });

  it('never goes negative and ignores impossible transitions', () => {
    expect(remainingSeconds(start(10, 0), 10, 99_000)).toBe(0);
    expect(pause(IDLE, 5)).toBe(IDLE);
    expect(resume(IDLE, 5)).toBe(IDLE);
    expect(resume({ status: 'paused', remainingMs: 0 }, 5)).toEqual({ status: 'done' });
    expect(remainingSeconds(IDLE, 90, 0)).toBe(90);
    expect(remainingSeconds({ status: 'done' }, 90, 0)).toBe(0);
  });
});

describe('cooking session parsing', () => {
  const steps = [1, 2, 3];
  const now = 1_000_000_000;
  const raw = (o: Record<string, unknown> = {}) =>
    JSON.stringify({ v: 1, savedAt: now - 1000, stepNumber: 2, completed: [1], timers: {}, ...o });

  it('restores a recent session', () => {
    expect(parseSession(raw(), steps, now)).toEqual({ stepIndex: 1, completed: [1], timers: {} });
  });

  it('drops stale, unreadable, unknown-version and empty sessions', () => {
    expect(parseSession(raw({ savedAt: now - SESSION_TTL_MS - 1 }), steps, now)).toBeNull();
    expect(parseSession(raw({ savedAt: now + SESSION_TTL_MS + 1 }), steps, now)).toBeNull(); // clock moved back
    expect(parseSession('{oops', steps, now)).toBeNull();
    expect(parseSession(raw({ v: 2 }), steps, now)).toBeNull();
    expect(parseSession(null, steps, now)).toBeNull();
    expect(parseSession(raw({ stepNumber: 1, completed: [], timers: { 1: { status: 'idle' } } }), steps, now)).toBeNull();
  });

  it('fits the session to the recipe as it is now', () => {
    expect(parseSession(raw({ stepNumber: 9, completed: [1, 1, 7] }), steps, now)).toEqual({
      stepIndex: 2, // clamped to the last step
      completed: [1],
      timers: {},
    });
    const s = parseSession(
      raw({
        timers: {
          1: { status: 'running', endsAt: now - 1 },
          2: { status: 'running', endsAt: now + 5000 },
          3: { status: 'paused', remainingMs: -1 },
          7: { status: 'done' },
        },
      }),
      steps,
      now,
    );
    expect(s?.timers).toEqual({ 1: { status: 'done' }, 2: { status: 'running', endsAt: now + 5000 } });
  });
});

const SESSION_KEY = sessionKey('001-thit-kho');
const progressNow = () => screen.getByTestId('cooking-progress').props.accessibilityValue.now;

async function reopenAndResume(row: Record<string, unknown>) {
  await openCooking(row);
  fireEvent.press(screen.getByRole('button', { name: 'Bắt đầu nấu' }));
  fireEvent.press(await screen.findByRole('button', { name: 'Tiếp tục nấu' }));
  await screen.findByTestId('cooking-mode');
}

async function openCooking(row: Record<string, unknown> = detailRow()) {
  const fake = createFakeSupabase();
  fake.catalog.recipes = [
    { id: 'r1', slug: '001-thit-kho', name: 'Thịt lợn kho cốt dừa', category_slug: 'mon_chinh', category_name: 'Món chính',
      difficulty: 'medium', default_servings: 4, prep_time_minutes: 15, cook_time_minutes: 60, cover_image_path: null, description: null },
  ];
  fake.catalog.details['001-thit-kho'] = row;
  render(<App rawEnv={ENV} createClient={() => fake.client} />);
  fireEvent.press(await screen.findByRole('button', { name: /^Thịt lợn kho cốt dừa\./ }));
  await screen.findByTestId('recipe-detail');
  return fake;
}

describe('cooking mode', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear(); // no session left over from another test
  });

  it('walks through the steps in order and finishes', async () => {
    await openCooking();
    fireEvent.press(screen.getByRole('button', { name: 'Bắt đầu nấu' }));
    expect(await screen.findByTestId('cooking-mode')).toBeTruthy();
    expect(screen.getByTestId('step-counter')).toHaveTextContent('Bước 1/2');
    expect(screen.getByTestId('step-instruction')).toHaveTextContent('Ướp thịt.');
    expect(screen.getByRole('button', { name: 'Bước trước' })).toBeDisabled();
    expect(screen.queryByTestId('timer-panel')).toBeNull(); // step 1 has no timer

    fireEvent.press(screen.getByRole('button', { name: 'Bước tiếp' }));
    expect(screen.getByTestId('step-counter')).toHaveTextContent('Bước 2/2');
    expect(screen.getByTestId('step-instruction')).toHaveTextContent('Kho nhỏ lửa.');
    expect(screen.getByRole('button', { name: 'Hoàn thành' })).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Hoàn thành' }));
    expect(await screen.findByTestId('recipe-detail')).toBeTruthy(); // back on the recipe
  });

  it('shows the ingredients for the servings chosen on the detail screen', async () => {
    await openCooking();
    fireEvent.press(screen.getByRole('button', { name: 'Tăng khẩu phần' }));
    fireEvent.press(screen.getByRole('button', { name: 'Tăng khẩu phần' }));
    fireEvent.press(screen.getByRole('button', { name: 'Bắt đầu nấu' }));
    await screen.findByTestId('cooking-mode');
    fireEvent.press(screen.getByRole('button', { name: 'Xem nguyên liệu' }));
    expect(screen.getByText('Cho 6 người')).toBeTruthy();
    expect(screen.getAllByTestId('ingredient-qty')[0]).toHaveTextContent('750 g');
  });

  describe('timer on the screen', () => {
    const notif = jest.mocked(Notifications);
    const ALARM_1 = 'cook:001-thit-kho:1';
    let permission: 'undetermined' | 'granted' | 'denied';
    let userAnswer: boolean;

    beforeEach(async () => {
      jest.useFakeTimers({ now: new Date('2026-11-13T10:00:00Z') });
      jest.spyOn(Vibration, 'vibrate').mockImplementation(() => undefined);
      jest.clearAllMocks();
      await AsyncStorage.clear();
      permission = 'undetermined';
      userAnswer = true;
      const status = () =>
        ({ granted: permission === 'granted', canAskAgain: permission === 'undetermined', status: permission, expires: 'never' }) as never;
      notif.getPermissionsAsync.mockImplementation(async () => status());
      notif.requestPermissionsAsync.mockImplementation(async () => {
        permission = userAnswer ? 'granted' : 'denied';
        return status();
      });
    });
    afterEach(() => {
      jest.useRealTimers();
      jest.restoreAllMocks();
    });

    async function toTimerStep() {
      await openCooking(
        detailRow({
          recipe_steps: [
            { step_number: 1, instruction: 'Luộc trứng.', timer_enabled: true, duration_seconds: 90 },
            { step_number: 2, instruction: 'Bóc vỏ.', timer_enabled: false, duration_seconds: null },
          ],
        }),
      );
      fireEvent.press(screen.getByRole('button', { name: 'Bắt đầu nấu' }));
      await screen.findByTestId('cooking-mode');
    }

    it('counts down, pauses, resumes and rings once at zero', async () => {
      await toTimerStep();
      expect(screen.getByTestId('timer-clock')).toHaveTextContent('01:30');

      fireEvent.press(screen.getByRole('button', { name: 'Bắt đầu hẹn giờ' }));
      await act(async () => {
        jest.advanceTimersByTime(30_000);
      });
      expect(screen.getByTestId('timer-clock')).toHaveTextContent('01:00');

      fireEvent.press(screen.getByRole('button', { name: 'Tạm dừng' }));
      await act(async () => {
        jest.advanceTimersByTime(60_000);
      });
      expect(screen.getByTestId('timer-clock')).toHaveTextContent('01:00'); // frozen while paused

      fireEvent.press(screen.getByRole('button', { name: 'Tiếp tục' }));
      await act(async () => {
        jest.advanceTimersByTime(60_500);
      });
      expect(screen.getByTestId('timer-clock')).toHaveTextContent('00:00');
      expect(screen.getByText('Hết giờ bước 1!')).toBeTruthy();
      expect(Vibration.vibrate).toHaveBeenCalledTimes(1);

      await act(async () => {
        jest.advanceTimersByTime(10_000);
      });
      expect(Vibration.vibrate).toHaveBeenCalledTimes(1); // not again

      fireEvent.press(screen.getByRole('button', { name: 'Tắt báo bước 1' }));
      expect(screen.queryByTestId('timer-done')).toBeNull();
      expect(screen.getByTestId('timer-clock')).toHaveTextContent('01:30');
    });

    it('keeps a timer running on its step while you move to another step', async () => {
      await toTimerStep();
      fireEvent.press(screen.getByRole('button', { name: 'Bắt đầu hẹn giờ' }));
      fireEvent.press(screen.getByRole('button', { name: 'Bước tiếp' }));
      await act(async () => {
        jest.advanceTimersByTime(10_000);
      });
      expect(screen.getByText('Đang hẹn giờ ở bước khác')).toBeTruthy();
      expect(screen.getByLabelText('Bước 1 · 01:20')).toBeTruthy();
      fireEvent.press(screen.getByLabelText('Bước 1 · 01:20'));
      expect(screen.getByTestId('step-counter')).toHaveTextContent('Bước 1/2');
    });

    it('asks for notifications at the first start and schedules the alarm at the end time', async () => {
      await toTimerStep();
      expect(notif.requestPermissionsAsync).not.toHaveBeenCalled(); // never on opening the screen

      const startedAt = Date.now();
      fireEvent.press(screen.getByRole('button', { name: 'Bắt đầu hẹn giờ' }));
      await waitFor(() => expect(notif.scheduleNotificationAsync).toHaveBeenCalledTimes(1));
      expect(notif.requestPermissionsAsync).toHaveBeenCalledTimes(1);
      expect(notif.scheduleNotificationAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          identifier: ALARM_1,
          content: expect.objectContaining({ title: 'Hết giờ bước 1', body: 'Thịt lợn kho cốt dừa' }),
          trigger: expect.objectContaining({ type: 'date', date: startedAt + 90_000 }),
        }),
      );

      fireEvent.press(screen.getByRole('button', { name: 'Tạm dừng' }));
      await waitFor(() => expect(notif.cancelScheduledNotificationAsync).toHaveBeenCalledWith(ALARM_1));

      fireEvent.press(screen.getByRole('button', { name: 'Tiếp tục' }));
      await waitFor(() => expect(notif.scheduleNotificationAsync).toHaveBeenCalledTimes(2));
      expect(notif.requestPermissionsAsync).toHaveBeenCalledTimes(1); // granted already, not asked again
      expect(screen.queryByTestId('alarm-off-hint')).toBeNull();
    });

    it('keeps the timer when notifications are refused, says so, and never asks again', async () => {
      userAnswer = false;
      await toTimerStep();
      fireEvent.press(screen.getByRole('button', { name: 'Bắt đầu hẹn giờ' }));
      expect(await screen.findByTestId('alarm-off-hint')).toBeTruthy();
      expect(notif.scheduleNotificationAsync).not.toHaveBeenCalled();

      fireEvent.press(screen.getByRole('button', { name: 'Đặt lại' }));
      fireEvent.press(screen.getByRole('button', { name: 'Bắt đầu hẹn giờ' }));
      await act(async () => {
        jest.advanceTimersByTime(1_000);
      });
      expect(screen.getByTestId('timer-clock')).toHaveTextContent('01:29');
      expect(notif.requestPermissionsAsync).toHaveBeenCalledTimes(1);
      expect(notif.scheduleNotificationAsync).not.toHaveBeenCalled();
    });

    it('cancels the alarms when the dish is finished', async () => {
      await toTimerStep();
      fireEvent.press(screen.getByRole('button', { name: 'Bắt đầu hẹn giờ' }));
      await waitFor(() => expect(notif.scheduleNotificationAsync).toHaveBeenCalledTimes(1));
      fireEvent.press(screen.getByRole('button', { name: 'Bước tiếp' }));
      fireEvent.press(screen.getByRole('button', { name: 'Hoàn thành' }));
      await waitFor(() => expect(notif.cancelScheduledNotificationAsync).toHaveBeenCalledWith(ALARM_1));
    });

    it('keeps a timer and its alarm while the app is closed, then shows it on return', async () => {
      const row = detailRow({
        recipe_steps: [
          { step_number: 1, instruction: 'Luộc trứng.', timer_enabled: true, duration_seconds: 90 },
          { step_number: 2, instruction: 'Bóc vỏ.', timer_enabled: false, duration_seconds: null },
        ],
      });
      await toTimerStep();
      fireEvent.press(screen.getByRole('button', { name: 'Bắt đầu hẹn giờ' }));
      await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(SESSION_KEY, expect.stringContaining('"running"')));
      await cleanupAsync(); // app closed
      expect(notif.cancelScheduledNotificationAsync).not.toHaveBeenCalled(); // the alarm still rings while away

      await act(async () => {
        jest.advanceTimersByTime(30_000);
      });
      await reopenAndResume(row);
      expect(screen.getByTestId('timer-clock')).toHaveTextContent('01:00');
      expect(screen.getByRole('button', { name: 'Tạm dừng' })).toBeTruthy();

      await cleanupAsync();
      await act(async () => {
        jest.advanceTimersByTime(120_000);
      });
      await reopenAndResume(row);
      expect(screen.getByText('Hết giờ bước 1!')).toBeTruthy(); // ended while away
      expect(Vibration.vibrate).not.toHaveBeenCalled(); // the notification already rang
    });
  });

  describe('saved session', () => {
    it('offers to resume where you left off; progress counts completed steps', async () => {
      await openCooking();
      fireEvent.press(screen.getByRole('button', { name: 'Bắt đầu nấu' }));
      await screen.findByTestId('cooking-mode');
      expect(progressNow()).toBe(0);
      fireEvent.press(screen.getByRole('button', { name: 'Bước tiếp' }));
      expect(progressNow()).toBe(1); // step 2 reached, but only step 1 is done
      await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(SESSION_KEY, expect.stringContaining('"stepNumber":2')));
      await cleanupAsync(); // app closed

      await openCooking();
      fireEvent.press(screen.getByRole('button', { name: 'Bắt đầu nấu' }));
      expect(await screen.findByText('Bạn đang nấu dở món này')).toBeTruthy();
      expect(screen.getByText('Đang ở bước 2/2, đã xong 1 bước.')).toBeTruthy();
      fireEvent.press(screen.getByRole('button', { name: 'Tiếp tục nấu' }));
      await screen.findByTestId('cooking-mode');
      expect(screen.getByTestId('step-counter')).toHaveTextContent('Bước 2/2');
      expect(progressNow()).toBe(1);

      fireEvent.press(screen.getByRole('button', { name: 'Hoàn thành' }));
      await screen.findByTestId('recipe-detail');
      await waitFor(() => expect(AsyncStorage.removeItem).toHaveBeenCalledWith(SESSION_KEY));
      fireEvent.press(screen.getByRole('button', { name: 'Bắt đầu nấu' }));
      await screen.findByTestId('cooking-mode'); // finished: no prompt next time
      expect(screen.getByTestId('step-counter')).toHaveTextContent('Bước 1/2');
    });

    it('starts over on request, dropping the session and its alarms', async () => {
      await openCooking();
      fireEvent.press(screen.getByRole('button', { name: 'Bắt đầu nấu' }));
      await screen.findByTestId('cooking-mode');
      fireEvent.press(screen.getByRole('button', { name: 'Bước tiếp' }));
      await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(SESSION_KEY, expect.stringContaining('"stepNumber":2')));
      await cleanupAsync();

      await openCooking();
      fireEvent.press(screen.getByRole('button', { name: 'Bắt đầu nấu' }));
      fireEvent.press(await screen.findByRole('button', { name: 'Nấu lại từ đầu' }));
      await screen.findByTestId('cooking-mode');
      expect(screen.getByTestId('step-counter')).toHaveTextContent('Bước 1/2');
      expect(progressNow()).toBe(0);
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith(SESSION_KEY);
      await waitFor(() => expect(jest.mocked(Notifications).cancelScheduledNotificationAsync).toHaveBeenCalledWith('cook:001-thit-kho:2'));
    });
  });

  it('refuses a recipe with no steps', async () => {
    const fake = await openCooking(detailRow({ recipe_steps: [] }));
    expect(fake).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Bắt đầu nấu' })).toBeNull(); // hidden when there is nothing to cook
  });
});
