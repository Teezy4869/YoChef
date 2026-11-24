import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { colors, radius, shadows, spacing, touchTarget } from '@/theme/tokens';

import { AppIcon } from './AppIcon';
import { AppText } from './AppText';

export type BottomSheetModalProps = {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  testID?: string;
};

export function BottomSheetModal({
  visible,
  title,
  subtitle,
  onClose,
  children,
  footer,
  scroll = true,
  testID,
}: BottomSheetModalProps) {
  const { width } = useWindowDimensions();
  const isWide = width >= 600;

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} testID={testID}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.backdrop, isWide ? styles.backdropWide : null]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="none" />
        <View style={[styles.sheet, isWide ? styles.sheetWide : null]}>
          {!isWide ? <View style={styles.handle} /> : null}
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <AppText variant="title">{title}</AppText>
              {subtitle ? (
                <AppText variant="caption" tone="muted">
                  {subtitle}
                </AppText>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đóng"
              onPress={onClose}
              hitSlop={6}
              style={styles.closeBtn}
            >
              <AppIcon name="close" size={20} tone="muted" />
            </Pressable>
          </View>

          {scroll ? (
            <ScrollView
              contentContainerStyle={styles.body}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          ) : (
            <View style={styles.body}>{children}</View>
          )}

          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.backdrop,
    justifyContent: 'flex-end',
  },
  backdropWide: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderCurve: 'continuous',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    maxHeight: '88%',
    gap: spacing.md,
    ...shadows.sheet,
  },
  sheetWide: {
    width: '100%',
    maxWidth: 480,
    borderRadius: radius.xl,
    paddingTop: spacing.lg,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    marginBottom: spacing.xxs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  closeBtn: {
    width: touchTarget - 10,
    height: touchTarget - 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    gap: spacing.md,
    paddingBottom: spacing.xs,
  },
  footer: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
