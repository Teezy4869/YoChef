// Comments (Phase 3.4, migration 20261114051346_phase3_comments). RLS decides
// what a reader sees: approved comments of published recipes, plus the signed-in
// user's own comments unless rejected. Status is never sent: new and edited
// comments wait for review, which the database enforces.
import { asText, fail, one } from '@/features/recipes/recipeApi';
import type { YoChefClient } from '@/lib/supabase';

export const COMMENT_MAX = 1000;
export const COMMENTS_PAGE = 20;

export type CommentStatus = 'pending' | 'approved' | 'rejected';
export type Comment = {
  id: string;
  userId: string;
  content: string;
  status: CommentStatus;
  createdAt: string;
  authorName: string | null;
  authorAvatarPath: string | null;
};

// The FK name keeps the embed unambiguous once moderated_by also points at profiles (3.6).
const SELECT = 'id,user_id,content,status,created_at,author:profiles!comments_user_id_fkey(display_name,avatar_path)';

function toComment(row: Record<string, unknown>): Comment {
  const author = one(row.author);
  return {
    id: String(row.id),
    userId: String(row.user_id),
    content: String(row.content),
    status: row.status as CommentStatus,
    createdAt: String(row.created_at),
    authorName: asText(author?.display_name),
    authorAvatarPath: asText(author?.avatar_path),
  };
}

/** Newest first, the first `limit` comments; one extra row tells whether more exist. */
export async function fetchComments(
  client: YoChefClient,
  recipeId: string,
  limit: number,
): Promise<{ comments: Comment[]; hasMore: boolean }> {
  const { data, error } = await client
    .from('comments')
    .select(SELECT)
    .eq('recipe_id', recipeId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(0, limit);
  if (error) fail(error, 'Không tải được bình luận.');
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return { comments: rows.slice(0, limit).map(toComment), hasMore: rows.length > limit };
}

/** Code points, as the database's char_length counts them. */
export const commentLength = (text: string) => Array.from(text.trim()).length;

function clean(text: string): string {
  const content = text.trim();
  if (content === '') throw new Error('Bình luận không được để trống.');
  if (commentLength(content) > COMMENT_MAX) throw new Error(`Bình luận tối đa ${COMMENT_MAX} ký tự.`);
  return content;
}

export async function postComment(client: YoChefClient, userId: string, recipeId: string, text: string): Promise<CommentStatus> {
  const content = clean(text);
  const { data, error } = await client
    .from('comments')
    .insert({ user_id: userId, recipe_id: recipeId, content })
    .select('status');
  if (error) fail(error, 'Không gửi được bình luận.');
  const row = (data as { status?: unknown }[] | null)?.[0];
  return row?.status === 'approved' ? 'approved' : 'pending';
}

export async function editComment(client: YoChefClient, id: string, text: string): Promise<CommentStatus> {
  const content = clean(text);
  const { data, error } = await client.from('comments').update({ content }).eq('id', id).select('id,status');
  if (error) fail(error, 'Không sửa được bình luận.');
  // No row: it was rejected or removed meanwhile.
  const rows = (data ?? []) as { status?: unknown }[];
  if (rows.length !== 1) throw new Error('Bình luận này không còn sửa được.');
  return rows[0]?.status === 'approved' ? 'approved' : 'pending';
}

export async function deleteComment(client: YoChefClient, id: string): Promise<void> {
  const { error } = await client.from('comments').delete().eq('id', id);
  if (error) fail(error, 'Không xóa được bình luận.');
}

/** "14/11/2026" */
export function formatCommentDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}
