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

// Mock expo-haptics (no native feedback engine in Jest)
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

// Mock expo-linear-gradient as a View container
jest.mock('expo-linear-gradient', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    LinearGradient: ({ children, ...props }) => React.createElement(View, props, children),
  };
});

// Mock expo-font and @expo-google-fonts/be-vietnam-pro so tests render immediately
jest.mock('expo-font', () => ({
  useFonts: jest.fn(() => [true, null]),
  isLoaded: jest.fn(() => true),
}));

jest.mock('@expo-google-fonts/be-vietnam-pro', () => ({
  useFonts: jest.fn(() => [true, null]),
  BeVietnamPro_400Regular: 'BeVietnamPro_400Regular',
  BeVietnamPro_500Medium: 'BeVietnamPro_500Medium',
  BeVietnamPro_600SemiBold: 'BeVietnamPro_600SemiBold',
  BeVietnamPro_700Bold: 'BeVietnamPro_700Bold',
}));

// Mock expo-image with React Native Image so testID and accessibilityLabel behave identically
jest.mock('expo-image', () => {
  const React = require('react');
  const { Image } = require('react-native');
  return {
    Image: ({ contentFit, transition: _transition, placeholder: _placeholder, ...props }) =>
      React.createElement(Image, { resizeMode: contentFit === 'contain' ? 'contain' : 'cover', ...props }),
  };
});

// Mock @expo/vector-icons synchronously so vector icons do not trigger async font loads in tests
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const createIcon = (displayName) => {
    const Icon = ({ name, testID, accessibilityLabel, style }) =>
      React.createElement(
        Text,
        {
          testID: testID ?? `icon-${String(name)}`,
          accessibilityLabel,
          accessible: Boolean(accessibilityLabel),
          style,
        },
        null,
      );
    Icon.displayName = displayName;
    return Icon;
  };
  return {
    Ionicons: createIcon('Ionicons'),
  };
});

// The first test of a suite on a cold Jest cache needs well over the default 1 s for findBy*/waitFor.
require('@testing-library/react-native/pure').configure({ asyncUtilTimeout: 5000 });
jest.setTimeout(15000);

// Safe-area provider renders nothing without native metrics; use the library's own Jest mock.
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
