import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { Vibration } from 'react-native';

import App from '@/app/App';
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

    it('cancels the alarms when leaving cooking mode', async () => {
      await toTimerStep();
      fireEvent.press(screen.getByRole('button', { name: 'Bắt đầu hẹn giờ' }));
      await waitFor(() => expect(notif.scheduleNotificationAsync).toHaveBeenCalledTimes(1));
      fireEvent.press(screen.getByRole('button', { name: 'Bước tiếp' }));
      fireEvent.press(screen.getByRole('button', { name: 'Hoàn thành' }));
      await waitFor(() => expect(notif.cancelScheduledNotificationAsync).toHaveBeenCalledWith(ALARM_1));
    });
  });

  it('refuses a recipe with no steps', async () => {
    const fake = await openCooking(detailRow({ recipe_steps: [] }));
    expect(fake).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Bắt đầu nấu' })).toBeNull(); // hidden when there is nothing to cook
  });
});
