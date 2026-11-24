import { Image, type ImageContentFit } from 'expo-image';
import { StyleSheet, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';

import { colors } from '@/theme/tokens';

import { AppIcon, type IconName } from './AppIcon';
import { AppText } from './AppText';

export type AppImageProps = {
  uri: string | null | undefined;
  style?: StyleProp<ImageStyle & ViewStyle>;
  contentFit?: ImageContentFit;
  accessibilityLabel?: string;
  testID?: string;
  fallbackTestID?: string;
  fallbackIcon?: IconName;
  fallbackText?: string;
};

export function AppImage({
  uri,
  style,
  contentFit = 'cover',
  accessibilityLabel,
  testID,
  fallbackTestID,
  fallbackIcon = 'restaurant-outline',
  fallbackText,
}: AppImageProps) {
  if (!uri) {
    return (
      <View
        style={[styles.fallback, style]}
        testID={fallbackTestID}
        accessible={Boolean(accessibilityLabel)}
        accessibilityLabel={accessibilityLabel}
      >
        <AppIcon name={fallbackIcon} size={28} tone="muted" />
        {fallbackText ? (
          <AppText variant="caption" tone="muted" align="center">
            {fallbackText}
          </AppText>
        ) : null}
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={[styles.image, style]}
      contentFit={contentFit}
      transition={200}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: colors.surfaceMuted,
  },
  fallback: {
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: 8,
  },
});
