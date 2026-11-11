import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/theme/tokens';

import { AppText } from './AppText';

type Tone = 'error' | 'success' | 'info';

const palette: Record<Tone, { bg: string; border: string; text: 'danger' | 'success' | 'default' }> = {
  error: { bg: colors.dangerSoft, border: colors.danger, text: 'danger' },
  success: { bg: colors.successSoft, border: colors.success, text: 'success' },
  info: { bg: colors.infoSoft, border: colors.info, text: 'default' },
};

export function Banner({ tone, message, testID }: { tone: Tone; message: string; testID?: string }) {
  const p = palette[tone];
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
      style={[styles.box, { backgroundColor: p.bg, borderLeftColor: p.border }]}
    >
      <AppText tone={p.text}>{message}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignSelf: 'stretch',
    borderLeftWidth: 4,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
});
