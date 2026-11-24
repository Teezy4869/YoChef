import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import { AppIcon } from "@/components/AppIcon";
import { AppText } from "@/components/AppText";
import { Banner } from "@/components/Banner";
import { fail } from "@/features/recipes/recipeApi";
import { useSupabase, type YoChefClient } from "@/lib/supabase";
import { colors, radius, spacing } from "@/theme/tokens";

// Phase 4.4: RLS returns a video only while it is primary, verified within 30 days and its
// recipe is published; the app repeats the date check. No eligible video, no section.
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
export type RecipeVideo = { id: string; title: string; channel: string | null };

export async function fetchRecipeVideo(
  client: YoChefClient,
  recipeId: string,
  now = Date.now(),
): Promise<RecipeVideo | null> {
  const { data, error } = await client
    .from("recipe_videos")
    .select("youtube_video_id,title,channel_title,last_verified_at")
    .eq("recipe_id", recipeId)
    .eq("is_primary", true)
    .maybeSingle();
  if (error) fail(error, "Không tải được video.");
  const r = data as {
    youtube_video_id?: string;
    title?: string | null;
    channel_title?: string | null;
    last_verified_at?: string | null;
  } | null;
  const checked = r?.last_verified_at ? Date.parse(r.last_verified_at) : NaN;
  if (
    !r?.youtube_video_id ||
    !VIDEO_ID.test(r.youtube_video_id) ||
    !r.title ||
    !(now - checked < MAX_AGE_MS)
  )
    return null;
  return {
    id: r.youtube_video_id,
    title: r.title,
    channel: r.channel_title ?? null,
  };
}

/** Opens the video on YouTube (the app if installed, otherwise the browser); never plays by itself. */
export function VideoButton({ recipeId }: { recipeId: string }) {
  const supabase = useSupabase();
  const [video, setVideo] = useState<{
    recipeId: string;
    value: RecipeVideo | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchRecipeVideo(supabase, recipeId).then(
      (value) => active && setVideo({ recipeId, value }),
      () => active && setVideo({ recipeId, value: null }),
    );
    return () => {
      active = false;
    };
  }, [supabase, recipeId]);

  const current = video?.recipeId === recipeId ? video.value : null;
  if (!current) return null;
  const open = () => {
    setError(null);
    Linking.openURL(`https://www.youtube.com/watch?v=${current.id}`).catch(() =>
      setError("Không mở được YouTube."),
    );
  };
  return (
    <View style={styles.root} testID="recipe-video">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Xem video hướng dẫn"
        accessibilityHint="Mở YouTube"
        onPress={open}
        style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}
      >
        <View style={styles.playBadge}>
          <AppIcon name="logo-youtube" size={22} tone="primary" />
        </View>
        <View style={styles.copy}>
          <AppText variant="label">Xem video hướng dẫn</AppText>
          <AppText variant="caption" tone="muted" numberOfLines={2}>
            {current.channel
              ? `${current.title} · ${current.channel}`
              : current.title}
          </AppText>
        </View>
        <AppIcon name="open-outline" size={18} tone="muted" />
      </Pressable>
      {error ? <Banner tone="error" message={error} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderCurve: "continuous",
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.85 },
  playBadge: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1, gap: spacing.xxs },
});
