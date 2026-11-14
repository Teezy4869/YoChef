import { Link } from 'react-router-dom';

import { useAdminAuth } from '@/auth/AdminAuth';

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto mt-16 max-w-lg rounded-lg border border-slate-200 bg-white p-8">
      <h1 className="mb-3 text-xl font-semibold">{title}</h1>
      <div className="flex flex-col gap-3 text-slate-700">{children}</div>
    </div>
  );
}

/** Signed in but holding no staff role, or the roles could not be read (no fallback, E3). */
export function UnauthorizedPage() {
  const { rolesError, signOut, status } = useAdminAuth();
  return (
    <Notice title="Không có quyền quản trị">
      <p>{rolesError ?? 'Tài khoản này không có vai trò quản trị nào.'}</p>
      {status === 'signedIn' ? (
        <button type="button" className="self-start text-orange-700 underline" onClick={() => void signOut()}>
          Đăng xuất
        </button>
      ) : (
        <Link className="text-orange-700 underline" to="/login">
          Đăng nhập
        </Link>
      )}
    </Notice>
  );
}

export function ForbiddenPage() {
  return (
    <Notice title="Không đủ quyền">
      <p>Vai trò của bạn không được mở trang này.</p>
    </Notice>
  );
}

export function NotFoundPage() {
  return (
    <Notice title="Không tìm thấy trang">
      <Link className="text-orange-700 underline" to="/dashboard">
        Về trang tổng quan
      </Link>
    </Notice>
  );
}

export function ConfigErrorPage({ problems }: { problems: string[] }) {
  return (
    <Notice title="Cấu hình admin chưa đúng">
      <ul className="list-disc pl-5">
        {problems.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <p className="text-sm text-slate-500">Sửa admin/.env theo admin/.env.example rồi chạy lại.</p>
    </Notice>
  );
}
