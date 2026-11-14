import { useEffect, useState, type FormEvent } from 'react';

import { useAdminAuth } from '@/auth/AdminAuth';
import { errorMessage, type AdminClient } from '@/lib/supabase';

type StoredVideo = {
  youtube_video_id: string; title: string | null; channel_title: string | null; is_primary: boolean;
  verification_status: 'unverified' | 'verified' | 'unavailable'; unavailable_reason: string | null; last_verified_at: string | null;
};
type Candidate = { id: string; title: string; channelTitle: string; thumbnailUrl: string | null };
type Check = { id: string; verificationStatus: 'verified'; title: string } | { id: string; verificationStatus: 'unavailable'; reason: string };

const REASON: Record<string, string> = {
  not_public: 'video không công khai', not_processed: 'video chưa xử lý xong', not_embeddable: 'video không cho nhúng',
  region_blocked: 'video bị chặn ở Việt Nam', not_found_or_private: 'video đã bị xóa hoặc chuyển riêng tư',
};
const EDGE: Record<string, string> = {
  forbidden: 'Chỉ biên tập viên được quản lý video.', quota_exceeded: 'Hết hạn mức YouTube hôm nay. Thử lại sau.',
  config_error: 'Máy chủ chưa cấu hình khóa YouTube.', invalid_input: 'Từ khóa hoặc mã video không hợp lệ.',
  provider_timeout: 'YouTube không phản hồi kịp.', provider_error: 'YouTube đang lỗi.',
};
const btn = 'rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50';

async function invoke<T>(client: AdminClient, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.functions.invoke('youtube-search', { body });
  if (error) {
    let code = '';
    try {
      code = (await (error as { context?: Response }).context?.json())?.error?.code ?? '';
    } catch {
      code = '';
    }
    throw new Error(EDGE[code] ?? 'Không gọi được dịch vụ YouTube.');
  }
  return data as T;
}

/** Search candidates, verify with videos.list (writes a receipt), then assign as the primary video. */
export function RecipeVideoSection({ recipeId, recipeName }: { recipeId: string; recipeName: string }) {
  const { client } = useAdminAuth();
  const [attempt, setAttempt] = useState(0);
  const [stored, setStored] = useState<StoredVideo[] | null>(null);
  const [query, setQuery] = useState(recipeName);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [checks, setChecks] = useState<Record<string, Check>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    client
      .from('recipe_videos')
      .select('youtube_video_id,title,channel_title,is_primary,verification_status,unavailable_reason,last_verified_at')
      .eq('recipe_id', recipeId)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setNotice({ ok: false, text: errorMessage(error, 'Không tải được video.') });
        setStored((data ?? []) as StoredVideo[]);
      });
    return () => {
      active = false;
    };
  }, [client, recipeId, attempt]);

  const act = async (work: () => Promise<void>) => {
    setNotice(null);
    setBusy(true);
    try {
      await work();
    } catch (e) {
      setNotice({ ok: false, text: e instanceof Error ? e.message : 'Có lỗi xảy ra.' });
    } finally {
      setBusy(false);
    }
  };
  const search = (e: FormEvent) => {
    e.preventDefault();
    void act(async () => setCandidates((await invoke<{ items: Candidate[] }>(client, { action: 'search', query })).items));
  };
  const verify = (id: string) =>
    act(async () => {
      const { item } = await invoke<{ item: Check }>(client, { action: 'verify', videoId: id });
      setChecks((c) => ({ ...c, [id]: item }));
    });
  const assign = (id: string) =>
    act(async () => {
      const { error } = await client.rpc('assign_recipe_video', { p_recipe_id: recipeId, p_video_id: id });
      if (error?.code === '22023') throw new Error('Kết quả xác minh đã hết hạn (15 phút) hoặc đã dùng. Xác minh lại.');
      if (error) throw new Error(errorMessage(error, 'Không gắn được video.'));
      setNotice({ ok: true, text: 'Đã gắn video chính.' });
      setChecks({});
      setAttempt((a) => a + 1);
    });
  const remove = (id: string) =>
    act(async () => {
      const { error } = await client.rpc('remove_recipe_video', { p_recipe_id: recipeId, p_video_id: id });
      if (error) throw new Error(errorMessage(error, 'Không gỡ được video.'));
      setNotice({ ok: true, text: 'Đã gỡ video.' });
      setAttempt((a) => a + 1);
    });

  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <legend className="px-1 font-medium">Video YouTube</legend>
      <p className="text-xs text-slate-500">
        Video chỉ hiện trong app khi là video chính, đã xác minh trong 30 ngày qua và công thức đã công bố. Quá 30 ngày không làm mới được thì video bị xóa.
      </p>
      {notice ? <p role={notice.ok ? 'status' : 'alert'} className={notice.ok ? 'text-green-800' : 'text-red-700'}>{notice.text}</p> : null}
      {stored === null ? <p role="status">Đang tải…</p> : stored.length === 0 ? <p className="text-sm text-slate-600">Chưa có video.</p> : (
        <ul className="flex flex-col gap-1 text-sm">
          {stored.map((v) => (
            <li key={v.youtube_video_id} className="flex flex-wrap items-center gap-2">
              <span className="font-mono">{v.youtube_video_id}</span>
              <span>{v.title ?? '—'}</span>
              <span className="text-xs text-slate-500">
                {v.is_primary ? 'Video chính · ' : ''}
                {v.verification_status === 'verified' ? `đã xác minh ${v.last_verified_at ? new Date(v.last_verified_at).toLocaleDateString('vi-VN') : ''}` : v.verification_status === 'unavailable' ? `không dùng được (${REASON[v.unavailable_reason ?? ''] ?? v.unavailable_reason})` : 'chưa xác minh'}
              </span>
              <button type="button" className={`${btn} text-red-700`} disabled={busy} aria-label={`Gỡ video ${v.youtube_video_id}`} onClick={() => void remove(v.youtube_video_id)}>Gỡ</button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={search} className="flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Tìm video
          <input className="rounded border border-slate-300 px-2 py-1 text-sm" value={query} maxLength={100} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <button type="submit" className={`${btn} border border-slate-300`} disabled={busy || !query.trim()}>Tìm trên YouTube</button>
      </form>
      {candidates ? (
        <ul className="flex flex-col gap-2">
          {candidates.map((c) => {
            const check = checks[c.id];
            return (
              <li key={c.id} className="flex items-center gap-3 rounded border border-slate-200 p-2 text-sm" aria-label={`Ứng viên ${c.id}`}>
                {c.thumbnailUrl ? <img src={c.thumbnailUrl} alt="" className="h-12 w-20 rounded object-cover" /> : null}
                <div className="flex flex-1 flex-col">
                  <span className="font-medium">{c.title}</span>
                  <span className="text-xs text-slate-500">{c.channelTitle}</span>
                  {check?.verificationStatus === 'unavailable' ? <span className="text-xs text-red-700">Không dùng được: {REASON[check.reason] ?? check.reason}</span> : null}
                </div>
                {check?.verificationStatus === 'verified' ? (
                  <button type="button" className={`${btn} bg-orange-700 text-white`} disabled={busy} onClick={() => void assign(c.id)}>Gắn làm video chính</button>
                ) : (
                  <button type="button" className={`${btn} border border-slate-300`} disabled={busy || check?.verificationStatus === 'unavailable'} onClick={() => void verify(c.id)}>Xác minh</button>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </fieldset>
  );
}
