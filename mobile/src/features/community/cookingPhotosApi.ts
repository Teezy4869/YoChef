// Cooking photos (Phase 3.5, migration 20261114054707_phase3_cooking_photos).
// The file sits in the private bucket cooking-photos under <user id>/; the row
// carries the review status. RLS on the rows and on storage decides who sees
// what, so a signed URL is only issued for a photo the reader may see.
import { asText, fail, one } from '@/features/recipes/recipeApi';
import { base64ToArrayBuffer } from '@/lib/base64';
import type { YoChefClient } from '@/lib/supabase';

import type { CommentStatus } from './commentsApi';
import type { PickedPhoto } from './pickCookingPhoto';

export const PHOTO_BUCKET = 'cooking-photos';
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024; // bucket file_size_limit
export const CAPTION_MAX = 250;
export const PHOTOS_PAGE = 12;
export const SIGNED_URL_SECONDS = 60 * 60;

export type CookingPhoto = {
  id: string;
  userId: string;
  storagePath: string;
  caption: string | null;
  status: CommentStatus;
  createdAt: string;
  authorName: string | null;
  /** Null when the file could not be signed (missing, or not readable). */
  url: string | null;
};

const SELECT = 'id,user_id,storage_path,caption,status,created_at,author:profiles!cooking_photos_user_id_fkey(display_name)';

/** Newest first, the first `limit` photos with signed URLs; one extra row tells whether more exist. */
export async function fetchCookingPhotos(
  client: YoChefClient,
  recipeId: string,
  limit: number,
): Promise<{ photos: CookingPhoto[]; hasMore: boolean }> {
  const { data, error } = await client
    .from('cooking_photos')
    .select(SELECT)
    .eq('recipe_id', recipeId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(0, limit);
  if (error) fail(error, 'Không tải được ảnh món đã nấu.');
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const shown = rows.slice(0, limit);

  const urls = new Map<string, string>();
  if (shown.length > 0) {
    const paths = shown.map((r) => String(r.storage_path));
    const signed = await client.storage.from(PHOTO_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
    if (signed.error) fail(signed.error, 'Không tải được ảnh món đã nấu.');
    for (const s of signed.data ?? []) {
      if (s.path && s.signedUrl && !s.error) {
        urls.set(s.path, s.signedUrl);
      } else if (__DEV__) {
        console.warn('[cookingPhotos] sign failed:', s.path, s.error);
      }
    }
  }

  const photos = shown.map((row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    storagePath: String(row.storage_path),
    caption: asText(row.caption),
    status: row.status as CommentStatus,
    createdAt: String(row.created_at),
    authorName: asText(one(row.author)?.display_name),
    url: urls.get(String(row.storage_path)) ?? null,
  }));
  return { photos, hasMore: rows.length > limit };
}

/** Unknown is NULL: a blank caption is no caption. */
export function cleanCaption(text: string): string | null {
  const caption = text.trim();
  if (Array.from(caption).length > CAPTION_MAX) throw new Error(`Chú thích tối đa ${CAPTION_MAX} ký tự.`);
  return caption === '' ? null : caption;
}

const defaultReadBytes = (uri: string) => fetch(uri).then((r) => r.arrayBuffer());

/** Uploads the file, then adds its row; if the row fails, the file is removed again. */
export async function addCookingPhoto(
  client: YoChefClient,
  userId: string,
  recipeId: string,
  photo: PickedPhoto,
  captionText: string,
  readBytes: (uri: string) => Promise<ArrayBuffer> = defaultReadBytes,
): Promise<void> {
  const caption = cleanCaption(captionText);
  let bytes: ArrayBuffer;
  try {
    bytes = photo.base64 ? base64ToArrayBuffer(photo.base64) : await readBytes(photo.uri);
  } catch {
    throw new Error('Không đọc được ảnh đã chọn.');
  }
  if (bytes.byteLength === 0) throw new Error('Không đọc được ảnh đã chọn.');
  if (bytes.byteLength > PHOTO_MAX_BYTES) throw new Error('Ảnh lớn hơn 5 MB. Hãy chọn ảnh khác.');

  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
  const bucket = client.storage.from(PHOTO_BUCKET);
  const { error: uploadError } = await bucket.upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (uploadError) fail(uploadError, 'Không tải ảnh lên được.');

  const { error } = await client
    .from('cooking_photos')
    .insert({ user_id: userId, recipe_id: recipeId, storage_path: path, caption });
  if (error) {
    await bucket.remove([path]).catch(() => undefined); // no orphan file behind a failed row
    fail(error, 'Không lưu được ảnh.');
  }
}

/** The row goes first (storage refuses to remove a file a row still points at), then the file. */
export async function deleteCookingPhoto(client: YoChefClient, photo: CookingPhoto): Promise<void> {
  const { data, error } = await client.from('cooking_photos').delete().eq('id', photo.id).select('id');
  if (error) fail(error, 'Không xóa được ảnh.');
  if ((data ?? []).length !== 1) throw new Error('Ảnh này không còn xóa được.');
  // Best effort: the photo is already gone from every list.
  await client.storage.from(PHOTO_BUCKET).remove([photo.storagePath]).catch(() => undefined);
}
