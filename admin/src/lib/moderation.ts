// Moderation data for the admin (4.2). RLS lets moderators and super admins read
// every comment, photo and report; only the RPCs change a status.
import { errorMessage, type AdminClient } from './supabase';

export type ContentTable = 'comments' | 'cooking_photos';
export type ContentStatus = 'pending' | 'approved' | 'rejected';
export type ReportStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed';

export type Content = {
  table: ContentTable;
  id: string;
  text: string | null;
  status: ContentStatus;
  authorName: string | null;
  createdAt: string;
  url: string | null;
};
export type Report = {
  id: string;
  target: { table: ContentTable; id: string };
  reason: string;
  details: string | null;
  status: ReportStatus;
  note: string | null;
  reporterName: string | null;
  createdAt: string;
  content: Content | null; // null: the item was deleted
};

export const REASON_LABEL: Record<string, string> = {
  spam: 'Spam / Quảng cáo',
  offensive: 'Nội dung xúc phạm',
  irrelevant: 'Lạc đề / Vô nghĩa',
  inappropriate_image: 'Hình ảnh không phù hợp',
  copyright: 'Vi phạm bản quyền',
  other: 'Lý do khác',
};
export const LIMIT = 50;
const BUCKET = 'cooking-photos';

type Row = Record<string, unknown>;
const one = (v: unknown) => (Array.isArray(v) ? v[0] : v) as Row | null | undefined;
const COLUMNS: Record<ContentTable, string> = {
  comments: 'id,content,status,created_at,author:profiles!comments_user_id_fkey(display_name)',
  cooking_photos: 'id,storage_path,caption,status,created_at,author:profiles!cooking_photos_user_id_fkey(display_name)',
};

function fail(error: { message?: string; code?: string } | null, fallback: string): never {
  throw new Error(errorMessage(error, fallback));
}

async function signed(client: AdminClient, rows: Row[]): Promise<Map<string, string>> {
  const paths = rows.map((r) => r.storage_path).filter((p): p is string => typeof p === 'string');
  const urls = new Map<string, string>();
  if (paths.length === 0) return urls;
  const { data, error } = await client.storage.from(BUCKET).createSignedUrls(paths, 3600);
  if (error) fail(error, 'Không tải được ảnh.');
  for (const s of data ?? []) if (s.path && s.signedUrl && !s.error) urls.set(s.path, s.signedUrl);
  return urls;
}

const toContent = (table: ContentTable, r: Row, urls: Map<string, string>): Content => ({
  table,
  id: String(r.id),
  text: (table === 'comments' ? r.content : r.caption) as string | null,
  status: r.status as ContentStatus,
  authorName: (one(r.author)?.display_name as string | null | undefined) ?? null,
  createdAt: String(r.created_at),
  url: table === 'cooking_photos' ? (urls.get(String(r.storage_path)) ?? null) : null,
});

async function load(client: AdminClient, table: ContentTable, filter: { status?: ContentStatus; ids?: string[] }) {
  let q = client.from(table).select(COLUMNS[table]);
  if (filter.status) q = q.eq('status', filter.status);
  if (filter.ids) q = q.in('id', filter.ids);
  const { data, error } = await q.order('created_at', { ascending: true }).limit(LIMIT);
  if (error) fail(error, 'Không tải được nội dung.');
  const rows = (data ?? []) as unknown as Row[];
  const urls = table === 'cooking_photos' ? await signed(client, rows) : new Map<string, string>();
  return rows.map((r) => toContent(table, r, urls));
}

/** Pending comments and photos, oldest first, at most LIMIT of each. */
export async function fetchQueue(client: AdminClient): Promise<Content[]> {
  const [comments, photos] = await Promise.all([
    load(client, 'comments', { status: 'pending' }),
    load(client, 'cooking_photos', { status: 'pending' }),
  ]);
  return [...comments, ...photos].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Reports in the given statuses, oldest first, with the item they are about. */
export async function fetchReports(client: AdminClient, statuses: ReportStatus[]): Promise<Report[]> {
  const { data, error } = await client
    .from('content_reports')
    .select('id,target_table,target_id,reason,details,status,internal_note,created_at,reporter:profiles!content_reports_reporter_id_fkey(display_name)')
    .in('status', statuses)
    .order('created_at', { ascending: true })
    .limit(LIMIT);
  if (error) fail(error, 'Không tải được báo cáo.');
  const rows = (data ?? []) as unknown as Row[];
  const idsOf = (table: ContentTable) => [...new Set(rows.filter((r) => r.target_table === table).map((r) => String(r.target_id)))];
  const content = new Map<string, Content>();
  for (const table of ['comments', 'cooking_photos'] as const) {
    const ids = idsOf(table);
    if (ids.length) for (const c of await load(client, table, { ids })) content.set(`${table}:${c.id}`, c);
  }
  return rows.map((r) => ({
    id: String(r.id),
    target: { table: r.target_table as ContentTable, id: String(r.target_id) },
    reason: String(r.reason),
    details: (r.details as string | null) ?? null,
    status: r.status as ReportStatus,
    note: (r.internal_note as string | null) ?? null,
    reporterName: (one(r.reporter)?.display_name as string | null | undefined) ?? null,
    createdAt: String(r.created_at),
    content: content.get(`${r.target_table}:${r.target_id}`) ?? null,
  }));
}

export async function moderate(client: AdminClient, item: { table: ContentTable; id: string }, status: ContentStatus, reason: string) {
  const { error } = await client.rpc('moderate_community_content', {
    p_table: item.table,
    p_id: item.id,
    p_status: status,
    p_reason: reason.trim() || null,
  });
  if (error?.code === 'P0002') throw new Error('Nội dung này không còn nữa.');
  if (error) fail(error, 'Không lưu được quyết định duyệt.');
}

export async function updateReport(client: AdminClient, id: string, status: ReportStatus, note: string) {
  const { error } = await client.rpc('update_report_workflow', { p_id: id, p_status: status, p_note: note.trim() || null });
  if (error) fail(error, 'Không cập nhật được báo cáo.');
}
