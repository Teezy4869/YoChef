import { useEffect, useState } from "react";
import {
  Animated,
  StyleSheet,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { colors, radius, shadows, spacing } from "@/theme/tokens";

export function SkeletonBlock({
  width = "100%",
  height = 16,
  borderRadius = radius.sm,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [pulse] = useState(() => new Animated.Value(0.55));

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.55,
          duration: 750,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        styles.block,
        { width, height, borderRadius, opacity: pulse },
        style,
      ]}
    />
  );
}

export function RecipeCardSkeleton() {
  return (
    <View style={styles.card}>
      <SkeletonBlock height={176} borderRadius={radius.md} />
      <View style={styles.cardBody}>
        <SkeletonBlock width="72%" height={20} />
        <SkeletonBlock width="48%" height={14} />
      </View>
    </View>
  );
}

export function RecipeListSkeleton({
  count = 3,
  testID,
}: {
  count?: number;
  testID?: string;
}) {
  return (
    <View
      style={styles.list}
      testID={testID}
      accessibilityLabel="Đang tải công thức"
    >
      {Array.from({ length: count }, (_, i) => (
        <RecipeCardSkeleton key={i} />
      ))}
    </View>
  );
}

export function ListRowSkeleton({
  count = 4,
  testID,
}: {
  count?: number;
  testID?: string;
}) {
  return (
    <View style={styles.list} testID={testID}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.rowCard}>
          <SkeletonBlock width={24} height={24} borderRadius={radius.sm} />
          <View style={styles.rowLines}>
            <SkeletonBlock width="65%" height={16} />
            <SkeletonBlock width="35%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: colors.surfaceMuted,
  },
  list: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    padding: spacing.sm,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  cardBody: {
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.xs,
    gap: spacing.sm,
  },
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowLines: {
    flex: 1,
    gap: spacing.xs,
  },
});
