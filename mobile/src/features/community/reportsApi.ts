// User reports (Phase 4.2, migration 20261114155100_phase4_content_reports).
// A user only inserts: the database checks the target is someone else's item the
// user can see, and that it is reported once. Reports are never read back.
import { fail } from '@/features/recipes/recipeApi';
import type { YoChefClient } from '@/lib/supabase';

export type ReportTarget = 'comments' | 'cooking_photos';
export type ReportReason = 'spam' | 'offensive' | 'irrelevant' | 'inappropriate_image' | 'copyright' | 'other';

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam / Quảng cáo' },
  { value: 'offensive', label: 'Nội dung xúc phạm' },
  { value: 'irrelevant', label: 'Lạc đề / Vô nghĩa' },
  { value: 'inappropriate_image', label: 'Hình ảnh không phù hợp' },
  { value: 'copyright', label: 'Vi phạm bản quyền' },
  { value: 'other', label: 'Lý do khác' },
];
export const REPORT_DETAILS_MAX = 500;

export async function submitReport(
  client: YoChefClient,
  userId: string,
  table: ReportTarget,
  targetId: string,
  reason: ReportReason,
  detailsText: string,
): Promise<void> {
  const details = detailsText.trim();
  if (reason === 'other' && details === '') throw new Error('Hãy mô tả lý do báo cáo.');
  if (Array.from(details).length > REPORT_DETAILS_MAX) throw new Error(`Mô tả tối đa ${REPORT_DETAILS_MAX} ký tự.`);
  const { error } = await client.from('content_reports').insert({
    reporter_id: userId,
    target_table: table,
    target_id: targetId,
    reason,
    details: details === '' ? null : details,
  });
  if (error?.code === '23505') throw new Error('Bạn đã báo cáo nội dung này rồi. Chúng tôi đang xử lý.');
  if (error) fail(error, 'Không gửi được báo cáo.');
}
