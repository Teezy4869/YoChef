import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { colors, spacing } from '@/theme/tokens';

export type ScreenProps = {
  children: ReactNode;
  /** Scrollable content with keyboard avoidance (forms). Default true. */
  scroll?: boolean;
  /** Vertically center the content (empty states, simple forms). */
  centered?: boolean;
  edges?: Edge[];
  testID?: string;
};

export function Screen({ children, scroll = true, centered = false, edges = ['top', 'left', 'right'], testID }: ScreenProps) {
  const content = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.content, centered ? styles.centered : null]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, styles.fill, centered ? styles.centered : null]}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.root} edges={edges} testID={testID}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {content}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  fill: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    gap: spacing.lg,
  },
  centered: { justifyContent: 'center' },
});
