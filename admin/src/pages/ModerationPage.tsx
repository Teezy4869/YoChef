import { useEffect, useState } from 'react';

import { useAdminAuth } from '@/auth/AdminAuth';
import {
  fetchQueue,
  fetchReports,
  moderate,
  REASON_LABEL,
  updateReport,
  type Content,
  type ContentStatus,
  type Report,
  type ReportStatus,
} from '@/lib/moderation';

const STATUS_LABEL: Record<ContentStatus, string> = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Đã từ chối' };
const REPORT_LABEL: Record<ReportStatus, string> = { open: 'Mới', reviewing: 'Đang xem', resolved: 'Đã xử lý', dismissed: 'Bỏ qua' };
const KIND: Record<Content['table'], string> = { comments: 'Bình luận', cooking_photos: 'Ảnh' };
const OPEN: ReportStatus[] = ['open', 'reviewing'];
const CLOSED: ReportStatus[] = ['resolved', 'dismissed'];
const btn = 'rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50';
const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Có lỗi xảy ra.');

function Preview({ c }: { c: Content | null }) {
  if (!c) return <p className="text-sm text-slate-500">Nội dung đã bị xóa.</p>;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-slate-500">
        {KIND[c.table]} của {c.authorName ?? 'người dùng YoChef'} · {STATUS_LABEL[c.status]}
      </p>
      {c.table === 'cooking_photos' ? (
        c.url ? <img src={c.url} alt={c.text ?? 'Ảnh chờ duyệt'} className="max-h-48 w-auto rounded" /> : <p className="text-sm text-slate-500">Không tải được ảnh.</p>
      ) : null}
      {c.text ? <p className="whitespace-pre-wrap">{c.text}</p> : null}
    </div>
  );
}

/** Content queue and user reports (moderator, super_admin). The in-app screen stays as a fallback. */
export function ModerationPage() {
  const { client } = useAdminAuth();
  const [tab, setTab] = useState<'queue' | 'reports'>('queue');
  const [showClosed, setShowClosed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const key = `${tab}#${showClosed}#${attempt}`;
  const [loaded, setLoaded] = useState<{ key: string; queue: Content[]; reports: Report[]; error: string | null } | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    (tab === 'queue'
      ? fetchQueue(client).then((queue) => ({ queue, reports: [] as Report[] }))
      : fetchReports(client, showClosed ? CLOSED : OPEN).then((reports) => ({ queue: [] as Content[], reports }))
    ).then(
      (r) => active && setLoaded({ key, ...r, error: null }),
      (e: unknown) => active && setLoaded({ key, queue: [], reports: [], error: messageOf(e) }),
    );
    return () => {
      active = false;
    };
  }, [client, tab, showClosed, key]);

  const act = async (id: string, work: () => Promise<void>, done: string) => {
    setNotice(null);
    setBusy(id);
    try {
      await work();
      setNotice({ ok: true, text: done });
      setNotes((n) => ({ ...n, [id]: '' }));
      setAttempt((a) => a + 1);
    } catch (e) {
      setNotice({ ok: false, text: messageOf(e) });
    } finally {
      setBusy(null);
    }
  };

  const current = loaded?.key === key ? loaded : null;
  const noteField = (id: string, label: string) => (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <input
        className="rounded border border-slate-300 px-2 py-1"
        value={notes[id] ?? ''}
        maxLength={1000}
        onChange={(e) => setNotes((n) => ({ ...n, [id]: e.target.value }))}
      />
    </label>
  );

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Kiểm duyệt</h1>
      <div role="tablist" className="flex gap-2">
        {(['queue', 'reports'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={`${btn} ${tab === t ? 'bg-orange-700 text-white' : 'border border-slate-300'}`}
            onClick={() => setTab(t)}
          >
            {t === 'queue' ? 'Hàng chờ duyệt' : 'Báo cáo vi phạm'}
          </button>
        ))}
      </div>
      {notice ? (
        <p role={notice.ok ? 'status' : 'alert'} className={notice.ok ? 'text-green-800' : 'text-red-700'}>
          {notice.text}
        </p>
      ) : null}
      {!current ? (
        <p role="status">Đang tải…</p>
      ) : current.error ? (
        <p role="alert" className="text-red-700">
          {current.error}
        </p>
      ) : tab === 'queue' ? (
        current.queue.length === 0 ? (
          <p className="text-slate-600">Không còn nội dung chờ duyệt.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {current.queue.map((c) => (
              <li key={`${c.table}:${c.id}`} className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4" aria-label={`${KIND[c.table]} chờ duyệt`}>
                <Preview c={c} />
                {noteField(c.id, 'Lý do (không bắt buộc)')}
                <div className="flex gap-2">
                  <button
                    className={`${btn} bg-green-700 text-white`}
                    disabled={busy !== null}
                    onClick={() => act(c.id, () => moderate(client, c, 'approved', notes[c.id] ?? ''), `Đã duyệt ${KIND[c.table].toLowerCase()}.`)}
                  >
                    Duyệt
                  </button>
                  <button
                    className={`${btn} bg-red-700 text-white`}
                    disabled={busy !== null}
                    onClick={() => act(c.id, () => moderate(client, c, 'rejected', notes[c.id] ?? ''), `Đã từ chối ${KIND[c.table].toLowerCase()}.`)}
                  >
                    Từ chối
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
            Xem báo cáo đã đóng
          </label>
          {current.reports.length === 0 ? (
            <p className="text-slate-600">{showClosed ? 'Chưa có báo cáo đã đóng.' : 'Không có báo cáo nào đang mở.'}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {current.reports.map((r) => (
                <li key={r.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4" aria-label={`Báo cáo: ${REASON_LABEL[r.reason] ?? r.reason}`}>
                  <p className="text-sm">
                    <strong>{REASON_LABEL[r.reason] ?? r.reason}</strong> · {REPORT_LABEL[r.status]} · bởi {r.reporterName ?? 'người dùng YoChef'}
                  </p>
                  {r.details ? <p className="text-sm italic text-slate-700">“{r.details}”</p> : null}
                  {r.note ? <p className="text-sm text-slate-600">Ghi chú: {r.note}</p> : null}
                  <Preview c={r.content} />
                  {noteField(r.id, 'Ghi chú nội bộ (không bắt buộc)')}
                  <div className="flex flex-wrap gap-2">
                    {r.status === 'open' ? (
                      <button className={`${btn} border border-slate-300`} disabled={busy !== null} onClick={() => act(r.id, () => updateReport(client, r.id, 'reviewing', notes[r.id] ?? ''), 'Đã chuyển sang đang xem.')}>
                        Đang xem
                      </button>
                    ) : null}
                    {r.content && r.content.status !== 'rejected' && !showClosed ? (
                      <button
                        className={`${btn} bg-red-700 text-white`}
                        disabled={busy !== null}
                        onClick={() =>
                          act(
                            r.id,
                            async () => {
                              await moderate(client, r.content!, 'rejected', notes[r.id] || `Báo cáo: ${REASON_LABEL[r.reason] ?? r.reason}`);
                              await updateReport(client, r.id, 'resolved', notes[r.id] ?? '');
                            },
                            'Đã ẩn nội dung và đóng báo cáo.',
                          )
                        }
                      >
                        Ẩn nội dung
                      </button>
                    ) : null}
                    {!showClosed ? (
                      <>
                        <button className={`${btn} border border-slate-300`} disabled={busy !== null} onClick={() => act(r.id, () => updateReport(client, r.id, 'resolved', notes[r.id] ?? ''), 'Đã đóng báo cáo.')}>
                          Đã xử lý
                        </button>
                        <button className={`${btn} border border-slate-300`} disabled={busy !== null} onClick={() => act(r.id, () => updateReport(client, r.id, 'dismissed', notes[r.id] ?? ''), 'Đã bỏ qua báo cáo.')}>
                          Bỏ qua
                        </button>
                      </>
                    ) : (
                      <button className={`${btn} border border-slate-300`} disabled={busy !== null} onClick={() => act(r.id, () => updateReport(client, r.id, 'open', notes[r.id] ?? ''), 'Đã mở lại báo cáo.')}>
                        Mở lại
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
