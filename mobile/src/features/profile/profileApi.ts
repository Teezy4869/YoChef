// Profile data access (Phase 1.5). The owner reads their full row, bio
// included, through get_my_profile() (migration 20261111120000); the public
// profiles columns never include bio.
import type { YoChefClient } from '@/lib/supabase';

export const AVATAR_BUCKET = 'avatars';
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // bucket file_size_limit
export const AVATAR_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const BIO_MAX = 500; // profiles.bio CHECK

export type MyProfile = {
  id: string;
  display_name: string | null;
  avatar_path: string | null;
  bio: string | null;
  created_at: string;
};

export class ProfileError extends Error {}

const NETWORK = 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';

function fail(error: { message?: string } | null | undefined, fallback: string): never {
  if (error?.message && /network|fetch/i.test(error.message)) throw new ProfileError(NETWORK);
  throw new ProfileError(fallback);
}

/** "Unknown" is NULL, never an empty string (AGENTS.md rule 6). */
export function blankToNull(value: string): string | null {
  const v = value.trim();
  return v ? v : null;
}

export async function fetchMyProfile(client: YoChefClient): Promise<MyProfile | null> {
  const { data, error } = await client.rpc('get_my_profile');
  if (error) fail(error, 'Không tải được hồ sơ.');
  const rows = (data ?? []) as MyProfile[];
  return rows[0] ?? null;
}

export async function updateMyProfile(
  client: YoChefClient,
  userId: string,
  input: { displayName: string; bio: string },
): Promise<void> {
  const { data, error } = await client
    .from('profiles')
    .update({ display_name: blankToNull(input.displayName), bio: blankToNull(input.bio) })
    .eq('id', userId)
    .select('id');
  if (error) fail(error, 'Không lưu được hồ sơ.');
  if (!data || data.length !== 1) throw new ProfileError('Không tìm thấy hồ sơ để lưu.');
}

export type PickedImage = { uri: string; mimeType?: string | null; fileSize?: number | null };

const EXT_BY_MIME: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MIME_BY_EXT: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export function resolveAvatarMime(image: PickedImage): string | null {
  const declared = image.mimeType?.toLowerCase();
  if (declared) return declared in EXT_BY_MIME ? declared : null;
  const ext = image.uri.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXT[ext] ?? null;
}

export function avatarPublicUrl(client: YoChefClient, path: string | null): string | null {
  if (!path) return null;
  return client.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
}

const defaultReadBytes = (uri: string) => fetch(uri).then((r) => r.arrayBuffer());

/**
 * Uploads a new avatar under <user id>/, points the profile at it, then
 * removes the previous file. Returns the new storage path.
 */
export async function replaceAvatar(
  client: YoChefClient,
  userId: string,
  image: PickedImage,
  previousPath: string | null,
  readBytes: (uri: string) => Promise<ArrayBuffer> = defaultReadBytes,
): Promise<string> {
  const mime = resolveAvatarMime(image);
  if (!mime) throw new ProfileError('Chỉ nhận ảnh JPEG, PNG hoặc WebP.');
  if (image.fileSize != null && image.fileSize > AVATAR_MAX_BYTES) {
    throw new ProfileError('Ảnh lớn hơn 5 MB. Hãy chọn ảnh nhỏ hơn.');
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await readBytes(image.uri);
  } catch {
    throw new ProfileError('Không đọc được ảnh đã chọn.');
  }
  if (bytes.byteLength > AVATAR_MAX_BYTES) throw new ProfileError('Ảnh lớn hơn 5 MB. Hãy chọn ảnh nhỏ hơn.');

  const path = `${userId}/${Date.now()}.${EXT_BY_MIME[mime]}`;
  const bucket = client.storage.from(AVATAR_BUCKET);
  const { error: uploadError } = await bucket.upload(path, bytes, { contentType: mime, upsert: false });
  if (uploadError) fail(uploadError, 'Không tải ảnh lên được.');

  const { data, error } = await client.from('profiles').update({ avatar_path: path }).eq('id', userId).select('id');
  if (error || !data || data.length !== 1) {
    await bucket.remove([path]); // do not leave an orphan behind
    fail(error, 'Không cập nhật được ảnh đại diện.');
  }

  if (previousPath && previousPath !== path && previousPath.startsWith(`${userId}/`)) {
    // Best effort: the profile already points at the new file.
    await bucket.remove([previousPath]).catch(() => undefined);
  }
  return path;
}
