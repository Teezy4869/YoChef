import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, cleanupAsync, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { Vibration } from 'react-native';

import App from '@/app/App';
import { parseSession, SESSION_TTL_MS, sessionKey } from '@/features/recipes/cookingSession';
import {
  adjustRemaining,
  IDLE,
  pause,
  remainingSeconds,
  resume,
  setRemaining,
  settle,
  start,
} from '@/features/recipes/timer';

import { createFakeSupabase } from './helpers/fakeSupabase';
import { detailRow } from './helpers/recipeFixtures';

jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));

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

  it('adjusts and sets remaining time on running and paused timers', () => {
    const t0 = 1_000_000;
    const running = start(60, t0);
    // Add 30s
    const extended = adjustRemaining(running, 30, t0);
    expect(extended).toEqual({ status: 'running', endsAt: t0 + 90_000 });
    // Subtract 60s
    const shortened = adjustRemaining(extended, -60, t0);
    expect(shortened).toEqual({ status: 'running', endsAt: t0 + 30_000 });
    // Subtract too much -> clamped to min (5s)
    const clamped = adjustRemaining(shortened, -50, t0);
    expect(clamped).toEqual({ status: 'running', endsAt: t0 + 5_000 });

    // Paused timer
    const paused = pause(running, t0 + 20_000); // 40s remaining
    const pausedExtended = adjustRemaining(paused, 20, t0 + 20_000);
    expect(pausedExtended).toEqual({ status: 'paused', remainingMs: 60_000 });

    // Set exact remaining
    const exact = setRemaining(running, 120, t0);
    expect(exact).toEqual({ status: 'running', endsAt: t0 + 120_000 });

    // Idle or done timers are unaffected by adjust/set
    expect(adjustRemaining(IDLE, 30, t0)).toBe(IDLE);
    expect(setRemaining(IDLE, 30, t0)).toBe(IDLE);
    expect(adjustRemaining({ status: 'done' }, 30, t0)).toEqual({ status: 'done' });
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
    expect(useKeepAwake).not.toHaveBeenCalled(); // the recipe page may sleep
    fireEvent.press(screen.getByRole('button', { name: 'Bắt đầu nấu' }));
    expect(await screen.findByTestId('cooking-mode')).toBeTruthy();
    expect(useKeepAwake).toHaveBeenCalled(); // cooking keeps the screen on
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
    beforeEach(async () => {
      jest.useFakeTimers({ now: new Date('2026-11-13T10:00:00Z') });
      jest.spyOn(Vibration, 'vibrate').mockImplementation(() => undefined);
      jest.clearAllMocks();
      await AsyncStorage.clear();
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
      expect(screen.getByTestId('timer-done-modal')).toBeTruthy();
      expect(screen.getByText('Hết giờ bước 1!')).toBeTruthy();
      expect(Vibration.vibrate).toHaveBeenCalledTimes(1);

      await act(async () => {
        jest.advanceTimersByTime(10_000);
      });
      expect(Vibration.vibrate).toHaveBeenCalledTimes(1); // not again

      fireEvent.press(screen.getByTestId('timer-done-confirm-btn'));
      expect(screen.queryByTestId('timer-done-modal')).toBeNull();
      expect(screen.getByTestId('timer-clock')).toHaveTextContent('01:30');
    });

    it('allows adjusting time with quick buttons in idle and resetting to default', async () => {
      await toTimerStep();
      expect(screen.getByTestId('timer-clock')).toHaveTextContent('01:30');
      expect(screen.queryByTestId('reset-default-duration-btn')).toBeNull();

      // +30s -> 02:00
      fireEvent.press(screen.getByTestId('adjust-plus-30'));
      expect(screen.getByTestId('timer-clock')).toHaveTextContent('02:00');
      expect(screen.getByTestId('reset-default-duration-btn')).toBeTruthy();

      // +1m -> 03:00
      fireEvent.press(screen.getByTestId('adjust-plus-60'));
      expect(screen.getByTestId('timer-clock')).toHaveTextContent('03:00');

      // -1m -> 02:00
      fireEvent.press(screen.getByTestId('adjust-minus-60'));
      expect(screen.getByTestId('timer-clock')).toHaveTextContent('02:00');

      // Click "Về mặc định (01:30)"
      fireEvent.press(screen.getByTestId('reset-default-duration-btn'));
      expect(screen.getByTestId('timer-clock')).toHaveTextContent('01:30');
      expect(screen.queryByTestId('reset-default-duration-btn')).toBeNull();
    });

    it('adjusts time while running', async () => {
      await toTimerStep();
      fireEvent.press(screen.getByRole('button', { name: 'Bắt đầu hẹn giờ' }));

      // Advance 30s -> 01:00 remaining
      await act(async () => {
        jest.advanceTimersByTime(30_000);
      });
      expect(screen.getByTestId('timer-clock')).toHaveTextContent('01:00');

      // Press +30s -> should become 01:30
      fireEvent.press(screen.getByTestId('adjust-plus-30'));
      expect(screen.getByTestId('timer-clock')).toHaveTextContent('01:30');
    });

    it('opens modal to enter custom time and validates input', async () => {
      await toTimerStep();
      // Press clock to open modal
      fireEvent.press(screen.getByTestId('timer-clock-pressable'));
      expect(screen.getByTestId('timer-edit-modal')).toBeTruthy();
      expect(screen.getByTestId('timer-input-minutes')).toHaveProp('value', '1');
      expect(screen.getByTestId('timer-input-seconds')).toHaveProp('value', '30');

      // Quick chip +1 phút inside modal
      fireEvent.press(screen.getByRole('button', { name: '+1 phút' }));
      expect(screen.getByTestId('timer-input-minutes')).toHaveProp('value', '2');

      // Save -> should be 2m30s (02:30)
      fireEvent.press(screen.getByTestId('timer-save-btn'));
      expect(screen.queryByTestId('timer-edit-modal')).toBeNull();
      expect(screen.getByTestId('timer-clock')).toHaveTextContent('02:30');

      // Reopen modal and test validation (< 5s)
      fireEvent.press(screen.getByTestId('timer-clock-pressable'));
      fireEvent.changeText(screen.getByTestId('timer-input-minutes'), '0');
      fireEvent.changeText(screen.getByTestId('timer-input-seconds'), '2');
      fireEvent.press(screen.getByTestId('timer-save-btn'));
      expect(screen.getByTestId('timer-modal-error')).toHaveTextContent('Thời gian tối thiểu là 5 giây.');

      // Cancel modal
      fireEvent.press(screen.getByTestId('timer-cancel-btn'));
      expect(screen.queryByTestId('timer-edit-modal')).toBeNull();
      expect(screen.getByTestId('timer-clock')).toHaveTextContent('02:30');
    });

    it('adds a timer to a step without default timer and can remove it', async () => {
      await toTimerStep();
      // Navigate to step 2 (which has duration_seconds: null)
      fireEvent.press(screen.getByRole('button', { name: 'Bước tiếp' }));
      expect(screen.getByTestId('step-counter')).toHaveTextContent('Bước 2/2');
      expect(screen.queryByTestId('timer-panel')).toBeNull();
      expect(screen.getByTestId('add-timer-btn')).toBeTruthy();

      // Click add timer
      fireEvent.press(screen.getByTestId('add-timer-btn'));
      expect(screen.getByTestId('timer-edit-modal')).toBeTruthy();

      // Set to 3 minutes
      fireEvent.changeText(screen.getByTestId('timer-input-minutes'), '3');
      fireEvent.changeText(screen.getByTestId('timer-input-seconds'), '0');
      fireEvent.press(screen.getByTestId('timer-save-btn'));

      // Timer panel should now be present on step 2
      expect(screen.getByTestId('timer-panel')).toBeTruthy();
      expect(screen.getByTestId('timer-clock')).toHaveTextContent('03:00');
      expect(screen.getByTestId('remove-custom-timer-btn')).toBeTruthy();

      // Remove custom timer
      fireEvent.press(screen.getByTestId('remove-custom-timer-btn'));
      expect(screen.queryByTestId('timer-panel')).toBeNull();
      expect(screen.getByTestId('add-timer-btn')).toBeTruthy();
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

    it('shows in-app popup with step instruction when timer completes and dismisses on confirm', async () => {
      await toTimerStep();
      fireEvent.press(screen.getByRole('button', { name: 'Bắt đầu hẹn giờ' }));
      expect(screen.queryByTestId('timer-done-modal')).toBeNull();

      await act(async () => {
        jest.advanceTimersByTime(90_500);
      });
      expect(screen.getByTestId('timer-done-modal')).toBeTruthy();
      expect(screen.getByText('Hết giờ bước 1!')).toBeTruthy();
      expect(within(screen.getByTestId('timer-done-modal')).getByText('Luộc trứng.')).toBeTruthy();

      fireEvent.press(screen.getByTestId('timer-done-confirm-btn'));
      expect(screen.queryByTestId('timer-done-modal')).toBeNull();
      expect(screen.getByTestId('timer-clock')).toHaveTextContent('01:30');
    });

    it('keeps a timer while the app is closed, then shows popup on return if ended', async () => {
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
      expect(screen.getByTestId('timer-done-modal')).toBeTruthy();
      expect(screen.getByText('Hết giờ bước 1!')).toBeTruthy(); // ended while away
      fireEvent.press(screen.getByTestId('timer-done-confirm-btn'));
      expect(screen.queryByTestId('timer-done-modal')).toBeNull();
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

    it('lets you unmark a completed step to repeat it, and remembers that', async () => {
      await openCooking();
      fireEvent.press(screen.getByRole('button', { name: 'Bắt đầu nấu' }));
      await screen.findByTestId('cooking-mode');
      expect(screen.queryByTestId('step-done')).toBeNull(); // not done yet
      fireEvent.press(screen.getByRole('button', { name: 'Bước tiếp' }));
      expect(screen.queryByTestId('step-done')).toBeNull(); // step 2 is on screen, not done

      fireEvent.press(screen.getByRole('button', { name: 'Bước trước' }));
      expect(screen.getByText('Bước này đã xong')).toBeTruthy();
      expect(progressNow()).toBe(1);
      fireEvent.press(screen.getByRole('button', { name: 'Đánh dấu chưa xong' }));
      expect(screen.queryByTestId('step-done')).toBeNull();
      expect(progressNow()).toBe(0);
      await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(SESSION_KEY, expect.stringContaining('"completed":[]')));
    });

    it('starts over on request, dropping the session', async () => {
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
    });
  });

  it('refuses a recipe with no steps', async () => {
    const fake = await openCooking(detailRow({ recipe_steps: [] }));
    expect(fake).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Bắt đầu nấu' })).toBeNull(); // hidden when there is nothing to cook
  });
});
