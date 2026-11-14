import { useEffect, useState, type FormEvent } from 'react';

import { useAdminAuth } from '@/auth/AdminAuth';
import { errorMessage, ROLE_LABEL, type StaffRole } from '@/lib/supabase';

type Person = { user_id: string; email: string; display_name: string | null; roles: StaffRole[] };
type Pending = { target: Person; role: StaffRole; action: 'assign' | 'revoke' };
const ROLES: StaffRole[] = ['editor', 'moderator', 'super_admin'];
const REASON_MAX = 500;

const input = 'rounded border border-slate-300 px-3 py-2 text-sm';
const button = 'rounded px-3 py-2 text-sm font-medium disabled:opacity-50';

/** Super admins assign and revoke staff roles; every change needs a reason and is audited (manage_user_role). */
export function StaffPage() {
  const { client, session } = useAdminAuth();
  const me = session?.user.id ?? null;
  const [attempt, setAttempt] = useState(0);
  const [staff, setStaff] = useState<{ attempt: number; rows: Person[]; error: string | null } | null>(null);
  const [email, setEmail] = useState('');
  const [found, setFound] = useState<Person | null | 'none'>(null);
  const [newRole, setNewRole] = useState<StaffRole>('editor');
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    client.rpc('list_staff').then(({ data, error }) => {
      if (active) setStaff({ attempt, rows: (data ?? []) as Person[], error: error ? errorMessage(error, 'Không tải được danh sách nhân sự.') : null });
    });
    return () => {
      active = false;
    };
  }, [client, attempt]);

  const lookup = async (e: FormEvent) => {
    e.preventDefault();
    setNotice(null);
    if (!email.trim()) return;
    setBusy(true);
    const { data, error } = await client.rpc('find_user_by_email', { p_email: email });
    setBusy(false);
    if (error) return setNotice({ ok: false, text: errorMessage(error, 'Không tìm được tài khoản.') });
    setFound(((data ?? []) as Person[])[0] ?? 'none');
  };

  const confirm = async () => {
    if (!pending) return;
    const why = reason.trim();
    if (!why) return setNotice({ ok: false, text: 'Cần ghi lý do.' });
    if (why.length > REASON_MAX) return setNotice({ ok: false, text: `Lý do tối đa ${REASON_MAX} ký tự.` });
    setBusy(true);
    const { data, error } = await client.rpc('manage_user_role', {
      p_target: pending.target.user_id,
      p_role: pending.role,
      p_action: pending.action,
      p_reason: why,
    });
    setBusy(false);
    if (error) {
      const text =
        error.code === '42501' && /last active super admin/.test(error.message)
          ? 'Không thể gỡ super admin cuối cùng.'
          : error.code === '42501' && /own super admin/.test(error.message)
            ? 'Bạn không thể tự gỡ quyền super admin của mình.'
            : errorMessage(error, 'Không lưu được thay đổi.');
      return setNotice({ ok: false, text });
    }
    const what = `${pending.action === 'assign' ? 'Đã gán' : 'Đã thu hồi'} ${ROLE_LABEL[pending.role]} cho ${pending.target.email}.`;
    setNotice({ ok: true, text: data === false ? `Không có gì thay đổi: ${pending.target.email} đã ở trạng thái đó.` : what });
    setPending(null);
    setReason('');
    setFound(null);
    setEmail('');
    setAttempt((n) => n + 1);
  };

  const ask = (target: Person, role: StaffRole, action: Pending['action']) => {
    setNotice(null);
    setReason('');
    setPending({ target, role, action });
  };

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Nhân sự</h1>
      {notice ? (
        <p role={notice.ok ? 'status' : 'alert'} className={notice.ok ? 'text-green-800' : 'text-red-700'}>
          {notice.text}
        </p>
      ) : null}

      {pending ? (
        <div className="flex flex-col gap-2 rounded-lg border border-orange-200 bg-orange-50 p-4" aria-label="Xác nhận thay đổi vai trò">
          <p>
            {pending.action === 'assign' ? 'Gán' : 'Thu hồi'} <strong>{ROLE_LABEL[pending.role]}</strong> cho {pending.target.email}
          </p>
          <label className="flex flex-col gap-1 text-sm">
            Lý do (bắt buộc, ghi vào nhật ký)
            <input className={input} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={REASON_MAX + 50} />
          </label>
          <div className="flex gap-2">
            <button type="button" className={`${button} bg-orange-700 text-white`} disabled={busy} onClick={() => void confirm()}>
              Xác nhận
            </button>
            <button type="button" className={`${button} text-slate-700`} disabled={busy} onClick={() => setPending(null)}>
              Hủy
            </button>
          </div>
        </div>
      ) : null}

      <form onSubmit={lookup} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-4">
        <label className="flex flex-col gap-1 text-sm">
          Email tài khoản
          <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <button type="submit" className={`${button} border border-slate-300`} disabled={busy}>
          Tìm
        </button>
        {found === 'none' ? <p className="w-full text-sm text-slate-600">Không có tài khoản với email này.</p> : null}
        {found && found !== 'none' ? (
          <div className="flex w-full flex-wrap items-end gap-2 text-sm">
            <span>
              {found.email} {found.display_name ? `(${found.display_name})` : ''}
              {found.roles.length ? ` · đang có: ${found.roles.map((r) => ROLE_LABEL[r]).join(', ')}` : ''}
            </span>
            <label className="flex flex-col gap-1">
              Vai trò
              <select className={input} value={newRole} onChange={(e) => setNewRole(e.target.value as StaffRole)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className={`${button} bg-orange-700 text-white`} onClick={() => ask(found, newRole, 'assign')}>
              Gán vai trò
            </button>
          </div>
        ) : null}
      </form>

      {!staff ? (
        <p role="status">Đang tải…</p>
      ) : staff.error ? (
        <p role="alert" className="text-red-700">
          {staff.error}
        </p>
      ) : (
        <table className="w-full border-collapse bg-white text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-600">
              <th className="p-2">Email</th>
              <th className="p-2">Tên</th>
              <th className="p-2">Vai trò</th>
            </tr>
          </thead>
          <tbody>
            {staff.rows.map((p) => (
              <tr key={p.user_id} className="border-b border-slate-100">
                <td className="p-2">{p.email}</td>
                <td className="p-2">{p.display_name ?? '—'}</td>
                <td className="flex flex-wrap gap-2 p-2">
                  {p.roles.map((r) => (
                    <span key={r} className="flex items-center gap-1 rounded bg-slate-100 px-2 py-1">
                      {ROLE_LABEL[r]}
                      {p.user_id === me && r === 'super_admin' ? null : (
                        <button
                          type="button"
                          className="text-red-700 underline"
                          aria-label={`Thu hồi ${ROLE_LABEL[r]} của ${p.email}`}
                          onClick={() => ask(p, r, 'revoke')}
                        >
                          Thu hồi
                        </button>
                      )}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
