// Official AsyncStorage mock for Jest unit tests
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock expo-audio for Jest unit tests
jest.mock('expo-audio', () => ({
  useAudioPlayer: jest.fn(() => ({
    play: jest.fn(),
    pause: jest.fn(),
    seekTo: jest.fn(),
    loop: false,
  })),
  createAudioPlayer: jest.fn(() => ({
    play: jest.fn(),
    pause: jest.fn(),
    seekTo: jest.fn(),
    loop: false,
  })),
}));

// The first test of a suite on a cold Jest cache needs well over the default 1 s for findBy*/waitFor.
require('@testing-library/react-native/pure').configure({ asyncUtilTimeout: 5000 });
jest.setTimeout(15000);

// Safe-area provider renders nothing without native metrics; use the library's own Jest mock.
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
