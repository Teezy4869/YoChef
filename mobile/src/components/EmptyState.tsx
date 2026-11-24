import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/theme/tokens';

import { AppIcon, type IconName } from './AppIcon';
import { AppText } from './AppText';

export function EmptyState({
  icon,
  tone = 'primary',
  title,
  message,
  action,
  testID,
}: {
  icon: IconName;
  tone?: 'primary' | 'danger' | 'muted';
  title: string;
  message?: string;
  action?: ReactNode;
  testID?: string;
}) {
  const circleBg =
    tone === 'danger' ? colors.dangerSoft : tone === 'muted' ? colors.surfaceMuted : colors.primarySoft;
  const iconTone = tone === 'danger' ? 'danger' : tone === 'muted' ? 'muted' : 'primary';

  return (
    <View style={styles.root} testID={testID}>
      <View style={[styles.badge, { backgroundColor: circleBg }]}>
        <AppIcon name={icon} size={30} tone={iconTone} />
      </View>
      <View style={styles.copy}>
        <AppText variant="heading" align="center">
          {title}
        </AppText>
        {message ? (
          <AppText tone="muted" align="center">
            {message}
          </AppText>
        ) : null}
      </View>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  badge: {
    width: 68,
    height: 68,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    gap: spacing.xs,
    maxWidth: 320,
  },
  action: {
    marginTop: spacing.xs,
    alignSelf: 'stretch',
    gap: spacing.sm,
  },
});
