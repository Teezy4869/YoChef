// Background alarm for step timers (spec 20): a local notification scheduled at
// the timer's end, so it still rings with the screen off or the app closed.
// The id comes from recipe + step, so an alarm is replaced or cancelled without
// storing its id anywhere.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const CHANNEL_ID = 'cooking-timers';
const ASKED_KEY = '@yochef/notifications-asked';

export const alarmId = (slug: string, stepNumber: number) => `cook:${slug}:${stepNumber}`;

let ready: Promise<void> | null = null;

function setup(): Promise<void> {
  ready ??= (async () => {
    // Spec 20 §3: also show and sound in the foreground, e.g. when the user went back to the recipe page.
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    if (Platform.OS === 'android') {
      // Android 13+ shows the permission prompt only once a channel exists.
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Hẹn giờ nấu ăn',
        // eslint-disable-next-line import/namespace -- the enum exists (tsc checks it); the plugin cannot parse its compiled export
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 500, 250, 500],
      });
    }
  })().catch(() => {
    ready = null; // try again next time
  });
  return ready;
}

/** Asks just in time and only once ever; never nags after a refusal (spec 20 §1). */
async function allowAlarms(): Promise<boolean> {
  await setup();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain || (await AsyncStorage.getItem(ASKED_KEY)) !== null) return false;
  await AsyncStorage.setItem(ASKED_KEY, '1');
  return (await Notifications.requestPermissionsAsync()).granted;
}

// One queue for every alarm call, so "start then pause" during the permission prompt still ends cancelled.
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(op: () => Promise<T>): Promise<T> {
  const run = queue.then(op, op);
  queue = run.catch(() => undefined);
  return run;
}

/** Rings at `endsAt`; the same recipe and step replaces any earlier alarm. False: the timer rings only inside the app. */
export function scheduleAlarm(slug: string, stepNumber: number, recipeName: string, endsAt: number): Promise<boolean> {
  return enqueue(async () => {
    try {
      if (!(await allowAlarms())) return false;
      await Notifications.scheduleNotificationAsync({
        identifier: alarmId(slug, stepNumber),
        content: { title: `Hết giờ bước ${stepNumber}`, body: recipeName, sound: 'default' },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: endsAt, channelId: CHANNEL_ID },
      });
      return true;
    } catch {
      return false;
    }
  });
}

export function cancelAlarm(slug: string, stepNumber: number): Promise<void> {
  return enqueue(() => Notifications.cancelScheduledNotificationAsync(alarmId(slug, stepNumber)).catch(() => undefined));
}
