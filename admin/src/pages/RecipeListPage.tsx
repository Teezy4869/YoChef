import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { useAdminAuth } from '@/auth/AdminAuth';
import { listRecipes, PAGE, STATUS_LABEL, type ListRow, type RecipeStatus } from '@/lib/recipes';

/** Every recipe for editors (RLS), newest edit first, filtered by status and name. */
export function RecipeListPage() {
  const { client } = useAdminAuth();
  const done = (useLocation().state as { notice?: string } | null)?.notice;
  const [status, setStatus] = useState<RecipeStatus | ''>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const key = `${status}#${search}#${page}`;
  const [loaded, setLoaded] = useState<{ key: string; rows: ListRow[]; total: number; error: string | null } | null>(null);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      listRecipes(client, { status, search, page }).then(
        (r) => active && setLoaded({ key, ...r, error: null }),
        (e: unknown) => active && setLoaded({ key, rows: [], total: 0, error: e instanceof Error ? e.message : 'Có lỗi xảy ra.' }),
      );
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [client, status, search, page, key]);

  const current = loaded?.key === key ? loaded : null;
  const pages = current ? Math.max(1, Math.ceil(current.total / PAGE)) : 1;
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Công thức</h1>
        <Link to="/recipes/new" className="rounded bg-orange-700 px-3 py-2 text-sm font-medium text-white">
          Tạo công thức
        </Link>
      </div>
      {done ? <p role="status" className="text-green-800">{done}</p> : null}
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Trạng thái
          <select className="rounded border border-slate-300 px-2 py-1" value={status} onChange={(e) => (setStatus(e.target.value as RecipeStatus | ''), setPage(0))}>
            <option value="">Tất cả</option>
            {(Object.keys(STATUS_LABEL) as RecipeStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Tìm theo tên
          <input className="rounded border border-slate-300 px-2 py-1" value={search} onChange={(e) => (setSearch(e.target.value), setPage(0))} />
        </label>
      </div>
      {!current ? (
        <p role="status">Đang tải…</p>
      ) : current.error ? (
        <p role="alert" className="text-red-700">
          {current.error}
        </p>
      ) : current.rows.length === 0 ? (
        <p className="text-slate-600">Không có công thức nào.</p>
      ) : (
        <>
          <table className="w-full border-collapse bg-white text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-600">
                <th className="p-2">Tên</th>
                <th className="p-2">Slug</th>
                <th className="p-2">Trạng thái</th>
                <th className="p-2">Sửa lần cuối</th>
              </tr>
            </thead>
            <tbody>
              {current.rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="p-2">
                    <Link className="text-orange-800 underline" to={`/recipes/${r.id}/edit`}>
                      {r.name}
                    </Link>
                  </td>
                  <td className="p-2 font-mono text-xs">{r.slug}</td>
                  <td className="p-2">{STATUS_LABEL[r.status]}</td>
                  <td className="p-2">{new Date(r.updatedAt).toLocaleString('vi-VN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center gap-3 text-sm">
            <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="rounded border border-slate-300 px-2 py-1 disabled:opacity-50">
              Trang trước
            </button>
            <span>
              Trang {page + 1}/{pages} · {current.total} công thức
            </span>
            <button type="button" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} className="rounded border border-slate-300 px-2 py-1 disabled:opacity-50">
              Trang sau
            </button>
          </div>
        </>
      )}
    </section>
  );
}
