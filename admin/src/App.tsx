import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

import { AdminAuthProvider, useAdminAuth } from '@/auth/AdminAuth';
import { AdminLayout } from '@/layout/AdminLayout';
import { hasRole, type AdminClient, type StaffRole } from '@/lib/supabase';
import { AuditLogPage } from '@/pages/AuditLogPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { LoginPage } from '@/pages/LoginPage';
import { ModerationPage } from '@/pages/ModerationPage';
import { StaffPage } from '@/pages/StaffPage';
import { ForbiddenPage, NotFoundPage, UnauthorizedPage } from '@/pages/StatusPages';

export type AdminRoute = { path: string; label: string; roles: StaffRole[]; element: ReactNode; sidebar: boolean };

/** Every sidebar link is a real route (phase4_08_admin_and_lifecycle). Guards are for the UI only. */
export const ROUTES: AdminRoute[] = [
  { path: '/dashboard', label: 'Tổng quan', roles: ['editor', 'moderator'], element: <DashboardPage />, sidebar: true },
  { path: '/moderation', label: 'Kiểm duyệt', roles: ['moderator'], element: <ModerationPage />, sidebar: true },
  { path: '/staff', label: 'Nhân sự', roles: ['super_admin'], element: <StaffPage />, sidebar: true },
  { path: '/audit-logs', label: 'Nhật ký quản trị', roles: ['super_admin'], element: <AuditLogPage />, sidebar: true },
];

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center text-slate-500" role="status">
      Đang tải…
    </div>
  );
}

/** Signed in with at least one staff role, or sent to sign in / "no access". */
function RequireStaff({ children }: { children: ReactNode }) {
  const { status, roles } = useAdminAuth();
  const location = useLocation();
  if (status === 'loading') return <Splash />;
  if (status === 'signedOut') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles === null) return <Splash />;
  if (roles.length === 0) return <Navigate to="/unauthorized" replace />;
  return children;
}

function Guard({ route }: { route: AdminRoute }) {
  const { roles } = useAdminAuth();
  return roles && hasRole(roles, route.roles) ? route.element : <ForbiddenPage />;
}

export function AdminRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />
      <Route
        element={
          <RequireStaff>
            <AdminLayout routes={ROUTES} />
          </RequireStaff>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        {ROUTES.map((r) => (
          <Route key={r.path} path={r.path} element={<Guard route={r} />} />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default function App({ client }: { client: AdminClient }) {
  return (
    <AdminAuthProvider client={client}>
      <AdminRoutes />
    </AdminAuthProvider>
  );
}
