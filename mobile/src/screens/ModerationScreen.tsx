import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { AppIcon } from "@/components/AppIcon";
import { AppImage } from "@/components/AppImage";
import { AppText } from "@/components/AppText";
import { Banner } from "@/components/Banner";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { useAuth } from "@/features/auth/AuthProvider";
import { formatCommentDate } from "@/features/community/commentsApi";
import {
  canModerate,
  fetchPending,
  moderate,
  REASON_MAX,
  type PendingItem,
} from "@/features/moderation/moderationApi";
import { joinMeta } from "@/features/recipes/format";
import { triggerHaptic } from "@/lib/haptics";
import { useSupabase } from "@/lib/supabase";
import { colors, radius, shadows, spacing } from "@/theme/tokens";

type Loaded = {
  key: string;
  allowed: boolean;
  items: PendingItem[];
  error: string | null;
};
const messageOf = (e: unknown) =>
  e instanceof Error ? e.message : "Có lỗi xảy ra. Vui lòng thử lại.";
const reasonLength = (text: string) => Array.from(text.trim()).length;

/** Pending comments and photos, oldest first, each with Approve / Reject and an optional reason. */
export function ModerationScreen() {
  const supabase = useSupabase();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const key = `${userId ?? "guest"}#${attempt}`;

  useEffect(() => {
    let active = true;
    (async () => {
      const allowed = userId ? await canModerate(supabase, userId) : false;
      return { allowed, items: allowed ? await fetchPending(supabase) : [] };
    })().then(
      (r) => active && setLoaded({ key, ...r, error: null }),
      (e: unknown) =>
        active &&
        setLoaded({ key, allowed: false, items: [], error: messageOf(e) }),
    );
    return () => {
      active = false;
    };
  }, [supabase, userId, key]);

  const current =
    loaded && loaded.key.startsWith(`${userId ?? "guest"}#`) ? loaded : null;

  const decide = async (item: PendingItem, status: "approved" | "rejected") => {
    setNotice(null);
    setBusy(item.id);
    try {
      await moderate(supabase, item, status, reasons[item.id] ?? "");
      triggerHaptic("success");
      const what = item.table === "comments" ? "bình luận" : "ảnh";
      setNotice({
        tone: "success",
        message:
          status === "approved" ? `Đã duyệt ${what}.` : `Đã từ chối ${what}.`,
      });
      setReasons((r) => {
        const next = { ...r };
        delete next[item.id];
        return next;
      });
      setAttempt((n) => n + 1);
    } catch (e) {
      setNotice({ tone: "error", message: messageOf(e) });
    } finally {
      setBusy(null);
    }
  };

  if (!current) {
    return (
      <Screen centered testID="moderation-loading">
        <ActivityIndicator
          color={colors.primary}
          size="large"
          accessibilityLabel="Đang tải nội dung chờ duyệt"
        />
      </Screen>
    );
  }
  if (current.error && current.items.length === 0) {
    return (
      <Screen centered testID="moderation-error">
        <EmptyState
          icon="cloud-offline-outline"
          tone="danger"
          title="Không tải được nội dung chờ duyệt"
          message={current.error}
          action={
            <Button
              title="Thử lại"
              icon="refresh"
              onPress={() => setAttempt((n) => n + 1)}
            />
          }
        />
      </Screen>
    );
  }
  if (!current.allowed) {
    return (
      <Screen centered testID="moderation-denied">
        <EmptyState
          icon="shield-outline"
          tone="muted"
          title="Duyệt nội dung"
          message="Bạn không có quyền duyệt nội dung."
        />
      </Screen>
    );
  }

  return (
    <Screen testID="moderation">
      <AppText tone="muted">
        {current.items.length === 0
          ? "Không còn nội dung chờ duyệt."
          : `${current.items.length} mục chờ duyệt, cũ nhất trước.`}
      </AppText>
      {notice ? <Banner tone={notice.tone} message={notice.message} /> : null}
      {current.items.length === 0 ? (
        <EmptyState
          icon="checkmark-done-circle-outline"
          title="Hàng chờ đang sạch"
          message="Mọi bình luận và ảnh nấu ăn đã được xử lý."
        />
      ) : null}
      {current.items.map((item) => {
        const reason = reasons[item.id] ?? "";
        const tooLong = reasonLength(reason) > REASON_MAX;
        const kind = item.table === "comments" ? "Bình luận" : "Ảnh";
        return (
          <View
            key={`${item.table}:${item.id}`}
            style={styles.card}
            testID="pending-item"
          >
            <View style={styles.badgeRow}>
              <View style={styles.kindPill}>
                <AppIcon
                  name={
                    item.table === "comments"
                      ? "chatbubble-outline"
                      : "image-outline"
                  }
                  size={14}
                  tone="primary"
                />
                <AppText variant="label" tone="primary">
                  {kind}
                </AppText>
              </View>
            </View>
            <AppText variant="caption" tone="muted">
              {joinMeta([
                item.recipeName,
                item.authorName ?? "Người dùng YoChef",
                formatCommentDate(item.createdAt),
              ])}
            </AppText>
            {item.table === "cooking_photos" ? (
              item.url ? (
                <AppImage
                  uri={item.url}
                  style={styles.photo}
                  accessibilityLabel={item.text ?? "Ảnh chờ duyệt"}
                />
              ) : (
                <AppText tone="muted">Không tải được ảnh.</AppText>
              )
            ) : null}
            {item.text ? <AppText>{item.text}</AppText> : null}
            <TextField
              label="Lý do (không bắt buộc)"
              value={reason}
              onChangeText={(text) =>
                setReasons((r) => ({ ...r, [item.id]: text }))
              }
              editable={busy === null}
              error={tooLong ? `Lý do tối đa ${REASON_MAX} ký tự.` : null}
            />
            <View style={styles.actions}>
              <Button
                title="Duyệt"
                icon="checkmark"
                fullWidth={false}
                accessibilityLabel={`Duyệt ${kind.toLowerCase()}`}
                loading={busy === item.id}
                disabled={busy !== null || tooLong}
                onPress={() => decide(item, "approved")}
              />
              <Button
                title="Từ chối"
                icon="close"
                variant="danger"
                fullWidth={false}
                accessibilityLabel={`Từ chối ${kind.toLowerCase()}`}
                disabled={busy !== null || tooLong}
                onPress={() => decide(item, "rejected")}
              />
            </View>
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  kindPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  photo: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
