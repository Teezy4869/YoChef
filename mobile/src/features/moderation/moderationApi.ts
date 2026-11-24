// Minimal moderation (Phase 3.6, migration 20261114060039_phase3_moderation).
// A moderator's own role row tells the app to show the screen; the database
// decides everything else: RLS lets moderators read every comment and photo,
// and only the RPC moderate_community_content (which checks is_moderator())
// changes a status.
import {
  PHOTO_BUCKET,
  SIGNED_URL_SECONDS,
} from "@/features/community/cookingPhotosApi";
import { asText, fail, one } from "@/features/recipes/recipeApi";
import type { YoChefClient } from "@/lib/supabase";

export const PENDING_LIMIT = 50;
export const REASON_MAX = 500;

export type PendingItem = {
  table: "comments" | "cooking_photos";
  id: string;
  text: string | null;
  recipeName: string | null;
  authorName: string | null;
  createdAt: string;
  /** Photos only: a signed URL, or null when it could not be signed. */
  url: string | null;
};

/** Moderators and super admins (is_moderator() counts both). */
export async function canModerate(
  client: YoChefClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) fail(error, "Không kiểm tra được quyền duyệt nội dung.");
  return ((data ?? []) as { role?: unknown }[]).some(
    (r) => r.role === "moderator" || r.role === "super_admin",
  );
}

type Row = Record<string, unknown>;
const toItem = (
  table: PendingItem["table"],
  row: Row,
  text: unknown,
  url: string | null,
): PendingItem => ({
  table,
  id: String(row.id),
  text: asText(text),
  recipeName: asText(one(row.recipe)?.name),
  authorName: asText(one(row.author)?.display_name),
  createdAt: String(row.created_at),
  url,
});

/** Oldest first: what has waited longest is reviewed first. At most PENDING_LIMIT of each kind. */
export async function fetchPending(
  client: YoChefClient,
): Promise<PendingItem[]> {
  const [comments, photos] = await Promise.all([
    client
      .from("comments")
      .select(
        "id,content,created_at,recipe:recipes(name),author:profiles!comments_user_id_fkey(display_name)",
      )
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(PENDING_LIMIT),
    client
      .from("cooking_photos")
      .select(
        "id,storage_path,caption,created_at,recipe:recipes(name),author:profiles!cooking_photos_user_id_fkey(display_name)",
      )
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(PENDING_LIMIT),
  ]);
  if (comments.error || photos.error)
    fail(comments.error ?? photos.error, "Không tải được nội dung chờ duyệt.");
  const commentRows = (comments.data ?? []) as unknown as Row[];
  const photoRows = (photos.data ?? []) as unknown as Row[];

  const urls = new Map<string, string>();
  if (photoRows.length > 0) {
    const signed = await client.storage.from(PHOTO_BUCKET).createSignedUrls(
      photoRows.map((r) => String(r.storage_path)),
      SIGNED_URL_SECONDS,
    );
    if (signed.error) fail(signed.error, "Không tải được ảnh chờ duyệt.");
    for (const s of signed.data ?? [])
      if (s.path && s.signedUrl && !s.error) urls.set(s.path, s.signedUrl);
  }

  return [
    ...commentRows.map((r) => toItem("comments", r, r.content, null)),
    ...photoRows.map((r) =>
      toItem(
        "cooking_photos",
        r,
        r.caption,
        urls.get(String(r.storage_path)) ?? null,
      ),
    ),
  ].sort((a, b) =>
    a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
  );
}

export async function moderate(
  client: YoChefClient,
  item: Pick<PendingItem, "table" | "id">,
  status: "approved" | "rejected",
  reasonText: string,
): Promise<void> {
  const reason = reasonText.trim();
  if (Array.from(reason).length > REASON_MAX)
    throw new Error(`Lý do tối đa ${REASON_MAX} ký tự.`);
  const { error } = await client.rpc("moderate_community_content", {
    p_table: item.table,
    p_id: item.id,
    p_status: status,
    p_reason: reason === "" ? null : reason,
  });
  if (error?.code === "42501")
    throw new Error("Bạn không có quyền duyệt nội dung.");
  if (error?.code === "P0002") throw new Error("Nội dung này không còn nữa.");
  if (error) fail(error, "Không lưu được quyết định duyệt.");
}
