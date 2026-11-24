// Official AsyncStorage mock for Jest unit tests
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Local notifications have no native side under Jest; tests drive these fakes (permission undetermined by default).
jest.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 6 },
  SchedulableTriggerInputTypes: { DATE: 'date', TIME_INTERVAL: 'timeInterval' },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: true, status: 'undetermined' })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true, status: 'granted' })),
  scheduleNotificationAsync: jest.fn(async (request) => request.identifier),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
}));

// The first test of a suite on a cold Jest cache needs well over the default 1 s for findBy*/waitFor.
require('@testing-library/react-native/pure').configure({ asyncUtilTimeout: 5000 });

// Safe-area provider renders nothing without native metrics; use the library's own Jest mock.
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
