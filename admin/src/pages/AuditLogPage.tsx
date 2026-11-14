import { useEffect, useState } from 'react';

import { useAdminAuth } from '@/auth/AdminAuth';
import { errorMessage } from '@/lib/supabase';

type Entry = {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  reason: string | null;
  details: Record<string, unknown>;
  created_at: string;
};
const PAGE = 50;

/** Read-only, newest first; "Tải thêm" pages back by time (list_admin_audit_logs). */
export function AuditLogPage() {
  const { client } = useAdminAuth();
  const [before, setBefore] = useState<string | null>(null);
  const [pages, setPages] = useState<{ before: string | null; rows: Entry[]; error: string | null }[]>([]);

  useEffect(() => {
    let active = true;
    client.rpc('list_admin_audit_logs', { p_limit: PAGE, p_before: before }).then(({ data, error }) => {
      if (!active) return;
      const page = { before, rows: (data ?? []) as Entry[], error: error ? errorMessage(error, 'Không tải được nhật ký.') : null };
      setPages((prev) => [...prev.filter((p) => p.before !== before), page]);
    });
    return () => {
      active = false;
    };
  }, [client, before]);

  const rows = pages.flatMap((p) => p.rows);
  const last = pages[pages.length - 1];
  const error = pages.find((p) => p.error)?.error;
  const loading = !last || last.before !== before;

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Nhật ký quản trị</h1>
      <p className="text-sm text-slate-600">Chỉ đọc. Không ai sửa hay xóa được nhật ký này.</p>
      {error ? (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      ) : null}
      <table className="w-full border-collapse bg-white text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-600">
            <th className="p-2">Thời điểm</th>
            <th className="p-2">Người làm</th>
            <th className="p-2">Hành động</th>
            <th className="p-2">Đối tượng</th>
            <th className="p-2">Lý do</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-slate-100 align-top">
              <td className="p-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString('vi-VN')}</td>
              <td className="p-2">{r.actor_id ? (r.actor_name ?? r.actor_id.slice(0, 8)) : 'Hệ thống'}</td>
              <td className="p-2">
                <code>{r.action}</code>
                {Object.keys(r.details ?? {}).length ? <div className="text-xs text-slate-500">{JSON.stringify(r.details)}</div> : null}
              </td>
              <td className="p-2">{r.target_table ? `${r.target_table} ${r.target_id?.slice(0, 8) ?? ''}` : '—'}</td>
              <td className="p-2">{r.reason ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {loading ? <p role="status">Đang tải…</p> : null}
      {!loading && !error && last.rows.length === PAGE ? (
        <button type="button" className="self-start rounded border border-slate-300 px-3 py-2 text-sm" onClick={() => setBefore(last.rows[PAGE - 1].created_at)}>
          Tải thêm
        </button>
      ) : null}
      {!loading && rows.length === 0 && !error ? <p className="text-slate-600">Chưa có mục nào.</p> : null}
    </section>
  );
}
