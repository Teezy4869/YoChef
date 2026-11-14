import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import App, { ROUTES } from '@/App';
import { validateEnv } from '@/lib/env';
import type { StaffRole } from '@/lib/supabase';

import { createFakeClient, fakeSession } from './fakeClient';

function renderAt(path: string, fake: ReturnType<typeof createFakeClient>) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App client={fake.client} />
    </MemoryRouter>,
  );
}
const signedIn = (roles: StaffRole[], extra: Partial<Parameters<typeof createFakeClient>[0]> = {}) =>
  createFakeClient({ session: fakeSession(), roles, ...extra });
const sidebar = () => within(screen.getByRole('navigation', { name: 'Điều hướng quản trị' }));

describe('env', () => {
  it('accepts only the v2-style URL and a publishable key', () => {
    expect(validateEnv({ url: 'https://bdhphjwhagygbwtfhhxn.supabase.co/', key: 'sb_publishable_x' }).ok).toBe(true);
    const bad = [
      { url: undefined, key: 'sb_publishable_x' },
      { url: 'https://ihfuftmpsfgtwvmtfdja.supabase.co', key: 'sb_publishable_x' },
      { url: 'http://localhost:54321', key: 'sb_publishable_x' },
      { url: 'https://bdhphjwhagygbwtfhhxn.supabase.co', key: 'sb_secret_x' },
      { url: 'https://bdhphjwhagygbwtfhhxn.supabase.co', key: '<sb_publishable_...>' },
      { url: 'https://bdhphjwhagygbwtfhhxn.supabase.co', key: `eyJ.${btoa(JSON.stringify({ role: 'service_role' }))}.x` },
    ];
    for (const raw of bad) expect(validateEnv(raw).ok).toBe(false);
  });
});

describe('routes and guards', () => {
  it('sends a guest to sign in, then back to the page they asked for', async () => {
    const fake = createFakeClient({ roles: ['super_admin'] });
    renderAt('/staff', fake);
    expect(await screen.findByRole('heading', { name: 'Đăng nhập quản trị' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'staff@example.test' } });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email hoặc mật khẩu không đúng.');
    fake.rpcHandlers.list_staff = () => ({ data: [], error: null });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'correct' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByRole('heading', { name: 'Nhân sự' })).toBeInTheDocument();
  });

  it('shows "no access" to a signed-in user without staff roles, and when roles cannot be read', async () => {
    renderAt('/dashboard', signedIn([]));
    expect(await screen.findByText('Tài khoản này không có vai trò quản trị nào.')).toBeInTheDocument();
  });

  it('does not fall back to any role when user_roles fails to load', async () => {
    renderAt('/dashboard', signedIn(['super_admin'], { rolesError: true }));
    expect(await screen.findByText('Không tải được vai trò của tài khoản.')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it.each<[StaffRole, string[]]>([
    ['editor', ['Tổng quan']],
    ['moderator', ['Tổng quan']],
    ['super_admin', ['Tổng quan', 'Nhân sự', 'Nhật ký quản trị']],
  ])('the sidebar of a %s lists exactly the routes that role may open', async (role, labels) => {
    const fake = signedIn([role]);
    renderAt('/dashboard', fake);
    await screen.findByRole('heading', { name: 'Tổng quan' });
    expect(sidebar().getAllByRole('link').map((a) => a.textContent)).toEqual(labels);
    const allowed = ROUTES.filter((r) => labels.includes(r.label)).map((r) => r.path);
    expect(allowed.length).toBe(labels.length);
  });

  it('an editor opening a super-admin page sees "not enough rights", and unknown paths are not found', async () => {
    renderAt('/staff', signedIn(['editor']));
    expect(await screen.findByRole('heading', { name: 'Không đủ quyền' })).toBeInTheDocument();
  });

  it('unknown paths show not found inside the layout', async () => {
    renderAt('/nope', signedIn(['moderator']));
    expect(await screen.findByRole('heading', { name: 'Không tìm thấy trang' })).toBeInTheDocument();
  });

  it('the dashboard shows pending counts to moderators only', async () => {
    const mod = signedIn(['moderator']);
    mod.counts['recipes.published'] = 236;
    mod.counts['comments.pending'] = 3;
    renderAt('/dashboard', mod);
    expect(await screen.findByText('236')).toBeInTheDocument();
    expect(screen.getByText('Bình luận chờ duyệt')).toBeInTheDocument();
  });

  it('the dashboard hides pending counts from editors', async () => {
    renderAt('/dashboard', signedIn(['editor']));
    await screen.findByText('Công thức đã công bố');
    expect(screen.queryByText('Bình luận chờ duyệt')).toBeNull();
  });

  it('signing out returns to the sign-in page', async () => {
    const fake = signedIn(['editor']);
    renderAt('/dashboard', fake);
    fireEvent.click(await screen.findByRole('button', { name: 'Đăng xuất' }));
    expect(await screen.findByRole('heading', { name: 'Đăng nhập quản trị' })).toBeInTheDocument();
    expect(fake.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});

describe('staff page', () => {
  const STAFF = [
    { user_id: 'u-1', email: 'staff@example.test', display_name: 'Tôi', roles: ['super_admin'] },
    { user_id: 'u-2', email: 'mod@example.test', display_name: null, roles: ['moderator'] },
  ];
  function setup() {
    const fake = signedIn(['super_admin']);
    fake.rpcHandlers.list_staff = () => ({ data: STAFF, error: null });
    fake.rpcHandlers.find_user_by_email = ({ p_email }) => ({
      data: p_email === 'new@example.test' ? [{ user_id: 'u-3', email: 'new@example.test', display_name: 'Mới', roles: [] }] : [],
      error: null,
    });
    fake.rpcHandlers.manage_user_role = () => ({ data: true, error: null });
    renderAt('/staff', fake);
    return fake;
  }

  it('lists staff and never offers to revoke my own super admin role', async () => {
    setup();
    expect(await screen.findByText('mod@example.test')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thu hồi Kiểm duyệt của mod@example.test' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Thu hồi Super admin của staff@example.test/ })).toBeNull();
  });

  it('finds a user by email and assigns a role with a required reason', async () => {
    const fake = setup();
    await screen.findByText('mod@example.test');
    fireEvent.change(screen.getByLabelText('Email tài khoản'), { target: { value: 'nobody@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tìm' }));
    expect(await screen.findByText('Không có tài khoản với email này.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Email tài khoản'), { target: { value: 'new@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tìm' }));
    fireEvent.change(await screen.findByLabelText('Vai trò'), { target: { value: 'editor' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gán vai trò' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Cần ghi lý do.');
    expect(fake.rpc).not.toHaveBeenCalledWith('manage_user_role', expect.anything());

    fireEvent.change(screen.getByLabelText('Lý do (bắt buộc, ghi vào nhật ký)'), { target: { value: ' Biên tập mới ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    expect(await screen.findByText('Đã gán Biên tập cho new@example.test.')).toBeInTheDocument();
    expect(fake.rpc).toHaveBeenCalledWith('manage_user_role', { p_target: 'u-3', p_role: 'editor', p_action: 'assign', p_reason: 'Biên tập mới' });
  });

  it('explains the last-super-admin refusal', async () => {
    const fake = setup();
    fake.rpcHandlers.manage_user_role = () => ({ data: null, error: { code: '42501', message: 'the last active super admin cannot be removed' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Thu hồi Kiểm duyệt của mod@example.test' }));
    fireEvent.change(screen.getByLabelText('Lý do (bắt buộc, ghi vào nhật ký)'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể gỡ super admin cuối cùng.');
  });
});

describe('audit log page', () => {
  it('reads newest first and pages back by time', async () => {
    const fake = signedIn(['super_admin']);
    const row = (i: number) => ({
      id: `a-${i}`, actor_id: 'u-1', actor_name: 'Tôi', action: 'role.assign', target_table: 'user_roles',
      target_id: 'u-2', reason: `Lý do ${i}`, details: { role: 'editor' }, created_at: new Date(Date.UTC(2026, 10, 14, 0, 0, 100 - i)).toISOString(),
    });
    fake.rpcHandlers.list_admin_audit_logs = ({ p_before }) => ({
      data: p_before ? [row(50)] : Array.from({ length: 50 }, (_, i) => row(i)),
      error: null,
    });
    renderAt('/audit-logs', fake);
    expect(await screen.findByText('Lý do 0')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tải thêm' }));
    expect(await screen.findByText('Lý do 50')).toBeInTheDocument();
    expect(fake.rpc).toHaveBeenLastCalledWith('list_admin_audit_logs', { p_limit: 50, p_before: row(49).created_at });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Tải thêm' })).toBeNull());
  });
});
