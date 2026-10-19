import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// A daily reminder to log symptoms.
//
// This is a local scheduled notification, not a push. The reminder fires at a
// time the patient picked, on their own device — there is no server-side
// content to deliver, so involving push tokens, APNs and FCM would add three
// failure modes and an offline dependency for no benefit.

const IDENTIFIER = 'daily-symptom-reminder';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('reminders', {
    name: 'Daily reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: '#DB2777',
    sound: null,
  });
}

/**
 * Ask for permission.
 *
 * Called after the first log is saved, never on launch. A permission prompt
 * shown before the patient has seen what the app does is the reliable way to
 * get a permanent "no", and iOS only asks once.
 */
export async function requestPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  if (!existing.canAskAgain) return false;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function hasPermission(): Promise<boolean> {
  return (await Notifications.getPermissionsAsync()).granted;
}

/** Replace any existing reminder with one at `time` ("HH:MM"). */
export async function scheduleDailyReminder(time: string): Promise<void> {
  await cancelDailyReminder();
  await ensureAndroidChannel();

  const [hour, minute] = time.split(':').map(Number);

  await Notifications.scheduleNotificationAsync({
    identifier: IDENTIFIER,
    content: {
      title: 'How was today?',
      body: 'Take a minute to record your symptoms while the day is fresh.',
      ...(Platform.OS === 'android' ? { channelId: 'reminders' } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: Number.isFinite(hour) ? hour : 20,
      minute: Number.isFinite(minute) ? minute : 0,
    },
  });
}

export async function cancelDailyReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(IDENTIFIER).catch(() => {
    // Nothing scheduled under that identifier; nothing to cancel.
  });
}

/**
 * Keep the schedule honest against what has actually been logged.
 *
 * Call on app foreground. If today is already recorded, the reminder is
 * cancelled and re-armed for tomorrow, so nobody gets nagged to do something
 * they have already done — the fastest way to train someone to ignore the app.
 */
export async function reconcileReminder(options: {
  enabled: boolean;
  time: string;
  loggedToday: boolean;
}): Promise<void> {
  if (!options.enabled || !(await hasPermission())) {
    await cancelDailyReminder();
    return;
  }

  const [hour, minute] = options.time.split(':').map(Number);
  const now = new Date();
  const target = new Date();
  target.setHours(hour, minute, 0, 0);

  // Only suppress when the reminder would still fire today. A reminder whose
  // time has already passed is naturally scheduled for tomorrow anyway.
  if (options.loggedToday && target > now) {
    await cancelDailyReminder();
    const tomorrow = new Date(target.getTime() + 24 * 60 * 60 * 1000);
    await ensureAndroidChannel();
    await Notifications.scheduleNotificationAsync({
      identifier: IDENTIFIER,
      content: {
        title: 'How was today?',
        body: 'Take a minute to record your symptoms while the day is fresh.',
        ...(Platform.OS === 'android' ? { channelId: 'reminders' } : {}),
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: tomorrow },
    });
    return;
  }

  await scheduleDailyReminder(options.time);
}
