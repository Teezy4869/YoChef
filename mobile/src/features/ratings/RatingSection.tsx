import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import type { RootStackParamList } from "@/app/navigation/types";
import { AppIcon } from "@/components/AppIcon";
import { AppText } from "@/components/AppText";
import { Banner } from "@/components/Banner";
import { Button } from "@/components/Button";
import { useAuth } from "@/features/auth/AuthProvider";
import { triggerHaptic } from "@/lib/haptics";
import { useSupabase } from "@/lib/supabase";
import { colors, radius, spacing, touchTarget } from "@/theme/tokens";

import {
  fetchMyScore,
  fetchRatingSummary,
  formatAverage,
  removeScore,
  saveScore,
  type RatingSummary,
} from "./ratingsApi";

type Loaded = {
  key: string;
  summary: RatingSummary;
  mine: number | null;
  error: string | null;
};
const messageOf = (e: unknown) =>
  e instanceof Error ? e.message : "Có lỗi xảy ra. Vui lòng thử lại.";
const STARS = [1, 2, 3, 4, 5];

/** Average and count for everyone; signed-in users set, change or remove their own 1–5 score. */
export function RatingSection({ recipeId }: { recipeId: string }) {
  const supabase = useSupabase();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [pending, setPending] = useState<{
    key: string;
    score: number | null;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = `${recipeId}#${userId ?? "guest"}#${attempt}`;
  const userKey = `${recipeId}#${userId ?? "guest"}`;

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchRatingSummary(supabase, recipeId),
      userId ? fetchMyScore(supabase, userId, recipeId) : Promise.resolve(null),
    ]).then(
      ([summary, mine]) =>
        active && setLoaded({ key, summary, mine, error: null }),
      (e: unknown) =>
        active &&
        setLoaded({
          key,
          summary: { count: 0, average: null },
          mine: null,
          error: messageOf(e),
        }),
    );
    return () => {
      active = false;
    };
  }, [supabase, recipeId, userId, key]);

  // Keep the last result of this user while a refresh runs, so the stars do not flicker.
  const current =
    loaded && loaded.key.startsWith(`${userKey}#`) ? loaded : null;
  const mine =
    pending && pending.key === userKey
      ? pending.score
      : (current?.mine ?? null);

  const choose = async (score: number | null) => {
    if (!userId) {
      navigation.navigate("SignIn");
      return;
    }
    triggerHaptic("light");
    setActionError(null);
    setBusy(true);
    setPending({ key: userKey, score });
    try {
      if (score === null) await removeScore(supabase, userId, recipeId);
      else await saveScore(supabase, userId, recipeId, score);
      setAttempt((n) => n + 1); // refresh the average
    } catch (e) {
      setPending(null);
      setActionError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const summary = current?.summary;
  return (
    <View style={styles.root} testID="ratings">
      <View style={styles.head}>
        <AppIcon name="star-outline" size={20} tone="primary" />
        <AppText variant="title">Đánh giá</AppText>
      </View>
      {current?.error ? <Banner tone="error" message={current.error} /> : null}
      {summary ? (
        <View style={styles.summaryPill}>
          <AppText variant="label" testID="rating-summary">
            {summary.average !== null
              ? `★ ${formatAverage(summary.average)} · ${summary.count} lượt đánh giá`
              : "Chưa có đánh giá"}
          </AppText>
        </View>
      ) : null}
      <AppText tone="muted">
        {userId
          ? mine
            ? `Bạn chấm ${mine} sao`
            : "Bạn chấm món này mấy sao?"
          : "Đăng nhập để chấm điểm."}
      </AppText>
      <View
        style={styles.stars}
        accessibilityRole="radiogroup"
        accessibilityLabel="Chấm điểm"
      >
        {STARS.map((n) => {
          const on = mine !== null && n <= mine;
          return (
            <Pressable
              key={n}
              accessibilityRole="radio"
              accessibilityLabel={`${n} sao`}
              accessibilityState={{ checked: mine === n, disabled: busy }}
              disabled={busy}
              hitSlop={4}
              onPress={() => choose(n)}
              style={({ pressed }) => [
                styles.star,
                on ? styles.starActive : null,
                pressed ? styles.starPressed : null,
              ]}
            >
              <AppIcon
                name={on ? "star" : "star-outline"}
                size={26}
                tone={on ? "star" : "muted"}
              />
            </Pressable>
          );
        })}
      </View>
      {userId && mine !== null ? (
        <Button
          title="Xóa đánh giá của tôi"
          variant="ghost"
          size="sm"
          fullWidth={false}
          disabled={busy}
          onPress={() => choose(null)}
        />
      ) : null}
      {actionError ? <Banner tone="error" message={actionError} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  summaryPill: {
    alignSelf: "flex-start",
    backgroundColor: colors.starSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  stars: { flexDirection: "row", gap: spacing.xs },
  star: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  starActive: { backgroundColor: colors.starSoft },
  starPressed: { transform: [{ scale: 0.92 }] },
});
