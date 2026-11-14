import { LogOut } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';

import type { AdminRoute } from '@/App';
import { useAdminAuth } from '@/auth/AdminAuth';
import { hasRole, ROLE_LABEL } from '@/lib/supabase';

export function AdminLayout({ routes }: { routes: AdminRoute[] }) {
  const { session, roles, signOut } = useAdminAuth();
  const mine = roles ?? [];
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-slate-200 bg-white p-4">
        <div className="mb-6 text-lg font-semibold text-orange-700">YoChef Admin</div>
        <nav aria-label="Điều hướng quản trị" className="flex flex-col gap-1">
          {routes
            .filter((r) => r.sidebar && hasRole(mine, r.roles))
            .map((r) => (
              <NavLink
                key={r.path}
                to={r.path}
                className={({ isActive }) =>
                  `rounded px-3 py-2 text-sm ${isActive ? 'bg-orange-50 font-medium text-orange-800' : 'text-slate-700 hover:bg-slate-100'}`
                }
              >
                {r.label}
              </NavLink>
            ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-4 border-b border-slate-200 bg-white px-6 py-3 text-sm">
          <span className="text-slate-600">
            {session?.user.email} · {mine.map((r) => ROLE_LABEL[r]).join(', ')}
          </span>
          <button type="button" onClick={() => void signOut()} className="flex items-center gap-1 text-slate-700 hover:text-orange-700">
            <LogOut size={16} aria-hidden /> Đăng xuất
          </button>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
