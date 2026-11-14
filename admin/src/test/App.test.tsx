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
    ['editor', ['Tổng quan', 'Công thức', 'Dinh dưỡng']],
    ['moderator', ['Tổng quan', 'Kiểm duyệt']],
    ['super_admin', ['Tổng quan', 'Công thức', 'Dinh dưỡng', 'Kiểm duyệt', 'Nhân sự', 'Nhật ký quản trị']],
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

describe('moderation page', () => {
  function setup(roles: StaffRole[] = ['moderator']) {
    const fake = signedIn(roles);
    fake.tables.comments = [
      { id: 'c1', content: 'Ngon quá', status: 'pending', created_at: '2026-11-14T00:00:02Z', author: { display_name: 'Bà Ba' } },
      { id: 'c9', content: 'Mua hàng giá rẻ', status: 'approved', created_at: '2026-11-14T00:00:00Z', author: null },
    ];
    fake.tables.cooking_photos = [
      { id: 'p1', storage_path: 'u-9/p1.jpg', caption: 'Lần đầu', status: 'pending', created_at: '2026-11-14T00:00:01Z', author: null },
    ];
    fake.tables.content_reports = [
      { id: 'r1', target_table: 'comments', target_id: 'c9', reason: 'spam', details: 'Quảng cáo', status: 'open', internal_note: null, created_at: '2026-11-14T01:00:00Z', reporter: { display_name: 'An' } },
    ];
    const setStatus = (table: string, id: unknown, status: unknown) => {
      const row = fake.tables[table].find((r) => r.id === id);
      if (row) row.status = status;
    };
    fake.rpcHandlers.moderate_community_content = ({ p_table, p_id, p_status }) => (setStatus(String(p_table), p_id, p_status), { data: p_status, error: null });
    fake.rpcHandlers.update_report_workflow = ({ p_id, p_status }) => (setStatus('content_reports', p_id, p_status), { data: p_status, error: null });
    renderAt('/moderation', fake);
    return fake;
  }

  it('lists the pending queue oldest first, with signed photo URLs, and approves through the RPC', async () => {
    const fake = setup();
    const items = await screen.findAllByRole('listitem');
    expect(items.map((li) => li.getAttribute('aria-label'))).toEqual(['Ảnh chờ duyệt', 'Bình luận chờ duyệt']);
    expect(within(items[0]).getByRole('img', { name: 'Lần đầu' })).toHaveAttribute('src', 'https://example.test/sign/u-9/p1.jpg');
    fireEvent.click(within(items[1]).getByRole('button', { name: 'Duyệt' }));
    expect(await screen.findByText('Đã duyệt bình luận.')).toBeInTheDocument();
    expect(fake.rpc).toHaveBeenCalledWith('moderate_community_content', { p_table: 'comments', p_id: 'c1', p_status: 'approved', p_reason: null });
    await waitFor(() => expect(screen.getAllByRole('listitem').length).toBe(1));
  });

  it('hides reported content and closes the report in one step', async () => {
    const fake = setup();
    fireEvent.click(await screen.findByRole('tab', { name: 'Báo cáo vi phạm' }));
    const report = await screen.findByRole('listitem', { name: 'Báo cáo: Spam / Quảng cáo' });
    expect(within(report).getByText('Mua hàng giá rẻ')).toBeInTheDocument();
    expect(within(report).getByText('“Quảng cáo”')).toBeInTheDocument();
    fireEvent.change(within(report).getByLabelText('Ghi chú nội bộ (không bắt buộc)'), { target: { value: 'Link lừa đảo' } });
    fireEvent.click(within(report).getByRole('button', { name: 'Ẩn nội dung' }));
    expect(await screen.findByText('Đã ẩn nội dung và đóng báo cáo.')).toBeInTheDocument();
    expect(fake.rpc).toHaveBeenCalledWith('moderate_community_content', { p_table: 'comments', p_id: 'c9', p_status: 'rejected', p_reason: 'Link lừa đảo' });
    expect(fake.rpc).toHaveBeenCalledWith('update_report_workflow', { p_id: 'r1', p_status: 'resolved', p_note: 'Link lừa đảo' });
    expect(await screen.findByText('Không có báo cáo nào đang mở.')).toBeInTheDocument();
  });

  it('is closed to editors', async () => {
    setup(['editor']);
    expect(await screen.findByRole('heading', { name: 'Không đủ quyền' })).toBeInTheDocument();
  });
});

describe('recipe CMS', () => {
  const CATS = [{ id: 'cat-1', name: 'Món chính', sort_order: 1 }];
  const INGS = [{ id: 'ing-1', name: 'Thịt lợn' }, { id: 'ing-2', name: 'Muối' }];
  function setup(roles: StaffRole[] = ['editor']) {
    const fake = signedIn(roles);
    fake.tables.categories = CATS;
    fake.tables.ingredients = INGS;
    fake.tables.recipes = [
      {
        id: 'r1', slug: '001-thit-kho', name: 'Thịt kho', status: 'staged', updated_at: '2026-11-14T00:00:00Z', description: null,
        category_id: 'cat-1', difficulty: 'easy', default_servings: 4, serving_basis: 'book', serving_note: null,
        prep_time_minutes: null, cook_time_minutes: 30, cover_image_path: '001-thit-kho/cover.webp',
        recipe_ingredients: [
          { sort_order: 2, quantity: null, unit: null, quantity_basis: 'to_taste', preparation_note: null, is_optional: false, ingredient: { id: 'ing-2', name: 'Muối' } },
          { sort_order: 1, quantity: '500.000', unit: 'g', quantity_basis: 'book', preparation_note: 'cắt miếng', is_optional: false, ingredient: { id: 'ing-1', name: 'Thịt lợn' } },
        ],
        recipe_steps: [{ step_number: 1, instruction: 'Kho nhỏ lửa', duration_seconds: 1800, timer_enabled: true }],
      },
      { id: 'r2', slug: '002-canh', name: 'Canh chua', status: 'draft', updated_at: '2026-11-13T00:00:00Z' },
    ];
    fake.rpcHandlers.create_ingredient = ({ p_name }) => ({ data: `new-${String(p_name)}`, error: null });
    fake.rpcHandlers.save_recipe = ({ p_id }) => ({ data: p_id ?? 'r1', error: null });
    fake.rpcHandlers.transition_recipe_status = ({ p_to }) => ({ data: p_to, error: null });
    return fake;
  }

  it('lists every status for editors and filters by status', async () => {
    const fake = setup();
    renderAt('/recipes', fake);
    expect(await screen.findByRole('link', { name: 'Thịt kho' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Chờ công bố' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'draft' } });
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Thịt kho' })).toBeNull());
    expect(await screen.findByRole('link', { name: 'Canh chua' })).toBeInTheDocument();
  });

  it('loads a recipe in order and saves it through save_recipe, creating a new ingredient first', async () => {
    const fake = setup();
    renderAt('/recipes/r1/edit', fake);
    expect(await screen.findByDisplayValue('Thịt kho')).toBeInTheDocument();
    const first = screen.getByRole('group', { name: 'Nguyên liệu 1' });
    expect(within(first).getByLabelText('Tên')).toHaveValue('Thịt lợn');
    expect(within(first).getByLabelText('Số lượng')).toHaveValue('500');
    expect(screen.getByLabelText('Thời lượng (phút)')).toHaveValue('30');

    fireEvent.click(screen.getByRole('button', { name: 'Thêm nguyên liệu' }));
    const third = screen.getByRole('group', { name: 'Nguyên liệu 3' });
    fireEvent.change(within(third).getByLabelText('Tên'), { target: { value: 'Lá chanh' } });
    fireEvent.change(within(third).getByLabelText('Số lượng'), { target: { value: '2,5' } });
    expect(within(third).getByText('Sẽ tạo nguyên liệu mới')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    expect(await screen.findByText('Đã lưu công thức.')).toBeInTheDocument();
    expect(fake.rpc).toHaveBeenCalledWith('create_ingredient', { p_name: 'Lá chanh' });
    const call = fake.rpc.mock.calls.find(([fn]) => fn === 'save_recipe')?.[1] as Record<string, unknown>;
    expect(call.p_id).toBe('r1');
    expect(call.p_ingredients).toEqual([
      { ingredient_id: 'ing-1', quantity: 500, unit: 'g', quantity_basis: 'book', preparation_note: 'cắt miếng', is_optional: false },
      { ingredient_id: 'ing-2', quantity: null, unit: null, quantity_basis: 'to_taste', preparation_note: null, is_optional: false },
      { ingredient_id: 'new-Lá chanh', quantity: 2.5, unit: null, quantity_basis: 'book', preparation_note: null, is_optional: false },
    ]);
    expect(call.p_steps).toEqual([{ instruction: 'Kho nhỏ lửa', duration_seconds: 1800, timer_enabled: true }]);
    expect((call.p_recipe as Record<string, unknown>).prep_time_minutes).toBeNull(); // unknown stays NULL
  });

  it('shows the server readiness messages next to the fields', async () => {
    const fake = setup();
    fake.rpcHandlers.transition_recipe_status = () => ({
      data: null,
      error: { code: '22023', message: 'recipe is not ready', details: JSON.stringify({ ingredients: 'Có nguyên liệu bị lặp.' }) } as never,
    });
    renderAt('/recipes/r1/edit', fake);
    fireEvent.click(await screen.findByRole('button', { name: 'Chuyển sang Đã công bố' }));
    expect(await screen.findByText('Có nguyên liệu bị lặp.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Công thức chưa đủ điều kiện.');
    expect(screen.getByRole('button', { name: 'Chuyển sang Nháp' })).toBeInTheDocument(); // staged -> draft is a move
  });

  it('checks the form before calling the server', async () => {
    const fake = setup();
    renderAt('/recipes/new', fake);
    fireEvent.change(await screen.findByLabelText('Tên món'), { target: { value: 'Gà nướng mật ong' } });
    expect(screen.getByLabelText('Slug')).toHaveValue('ga-nuong-mat-ong');
    fireEvent.click(screen.getByRole('button', { name: 'Tạo bản nháp' }));
    expect(await screen.findByText('Hãy sửa các ô được đánh dấu.')).toBeInTheDocument();
    expect(screen.getByText('Chọn hoặc nhập tên nguyên liệu.')).toBeInTheDocument();
    expect(fake.rpc).not.toHaveBeenCalledWith('save_recipe', expect.anything());
  });

  it('offers the hard delete to super admins only', async () => {
    renderAt('/recipes/r1/edit', setup(['editor']));
    await screen.findByDisplayValue('Thịt kho');
    expect(screen.queryByRole('button', { name: 'Xóa vĩnh viễn' })).toBeNull();
  });

  it('a super admin must type the slug to delete', async () => {
    const fake = setup(['super_admin']);
    fake.rpcHandlers.delete_recipe = () => ({ data: null, error: null });
    renderAt('/recipes/r1/edit', fake);
    const del = await screen.findByRole('button', { name: 'Xóa vĩnh viễn' });
    expect(del).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Gõ lại slug/), { target: { value: '001-thit-kho' } });
    fireEvent.change(screen.getByLabelText('Lý do (bắt buộc)'), { target: { value: 'Trùng' } });
    fireEvent.click(del);
    await waitFor(() => expect(fake.rpc).toHaveBeenCalledWith('delete_recipe', { p_id: 'r1', p_confirm_slug: '001-thit-kho', p_reason: 'Trùng' }));
  });
});

describe('nutrition page', () => {
  const PORK = {
    provider: 'usda', externalId: '167812', description: 'Pork, fresh, loin, raw', dataType: 'SR Legacy', basis: 'per_100g',
    sourceVersion: 'SR Legacy 2019-04-01', retrievedAt: '2026-11-14T00:00:00.000Z',
    nutrients: { energyKcal: 242, proteinG: 27.3, fatG: 14, carbsG: 0, sodiumMg: 62, saturatedFatG: null, fiberG: null, sugarG: null },
  };
  function setup() {
    const fake = signedIn(['editor']);
    fake.tables.ingredients = [
      { id: 'ing-1', name: 'Thịt lợn', nutrition: null },
      { id: 'ing-2', name: 'Muối', nutrition: { mapping_status: 'CANDIDATE', description: 'Salt, table', external_id: '173468', energy_kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0, sodium_mg: 38758, saturated_fat_g: null, fiber_g: null, sugar_g: null } },
    ];
    fake.tables.recipes = [{ id: 'r1', name: 'Thịt luộc', status: 'published', nutrition: null }];
    fake.rpcHandlers.save_ingredient_nutrition = ({ p_status }) => ({ data: p_status, error: null });
    fake.rpcHandlers.verify_ingredient_nutrition = () => ({ data: 'VERIFIED', error: null });
    renderAt('/nutrition', fake);
    return fake;
  }

  it('maps an ingredient to a USDA food found through the Edge Function', async () => {
    const fake = setup();
    fake.functions.invoke.mockResolvedValueOnce({ data: { items: [PORK, { ...PORK, externalId: '999', dataType: 'Branded', basis: null }], source: 'usda' }, error: null });
    fireEvent.click(await screen.findByRole('button', { name: /^Thịt lợn/ }));
    fireEvent.change(screen.getByLabelText(/Tìm trên USDA/), { target: { value: 'pork loin raw' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tìm' }));
    const result = await screen.findByRole('listitem', { name: 'USDA 167812' });
    expect(fake.functions.invoke).toHaveBeenCalledWith('nutrition-search', { body: { action: 'search_usda', query: 'pork loin raw' } });
    expect(within(screen.getByRole('listitem', { name: 'USDA 999' })).getByRole('button', { name: 'Dùng thực phẩm này' })).toBeDisabled();
    fireEvent.click(within(result).getByRole('button', { name: 'Dùng thực phẩm này' }));
    expect(await screen.findByText('Đã lưu làm ứng viên. Kiểm tra rồi bấm Xác minh.')).toBeInTheDocument();
    expect(fake.rpc).toHaveBeenCalledWith('save_ingredient_nutrition', { p_ingredient_id: 'ing-1', p_food: PORK, p_status: 'CANDIDATE' });
  });

  it('verifies a candidate and shows unknown values as a dash', async () => {
    const fake = setup();
    fireEvent.click(await screen.findByRole('button', { name: /^Muối/ }));
    const panel = screen.getByLabelText('Dinh dưỡng của Muối');
    expect(within(panel).getByText('Béo bão hòa /100 g').nextSibling).toHaveTextContent('—');
    expect(within(panel).getByText('Năng lượng /100 g').nextSibling).toHaveTextContent('0 kcal');
    fireEvent.click(within(panel).getByRole('button', { name: 'Xác minh' }));
    expect(await screen.findByText('Đã xác minh.')).toBeInTheDocument();
    expect(fake.rpc).toHaveBeenCalledWith('verify_ingredient_nutrition', { p_ingredient_id: 'ing-2' });
  });

  it('explains an Edge Function refusal', async () => {
    const fake = setup();
    fake.functions.invoke.mockResolvedValueOnce({
      data: null,
      error: { message: 'Edge Function returned a non-2xx status code', context: new Response(JSON.stringify({ error: { code: 'config_error', message: 'x' } }), { status: 503 }) },
    });
    fireEvent.click(await screen.findByRole('button', { name: /^Thịt lợn/ }));
    fireEvent.change(screen.getByLabelText(/Tìm trên USDA/), { target: { value: 'pork' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tìm' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Máy chủ chưa cấu hình khóa USDA.');
  });

  it('calculates a recipe and offers verification only for a complete result', async () => {
    const fake = setup();
    const nulls = { energy_kcal: null, protein_g: null, fat_g: null, carbs_g: null, sodium_mg: null, saturated_fat_g: null, fiber_g: null, sugar_g: null };
    fake.rpcHandlers.calculate_recipe_nutrition = () => ({
      data: { status: 'INCOMPLETE', totals: nulls, per_serving: nulls, completeness: 0.5, reason_codes: ['missing_quantity'],
        breakdown: [{ ingredient_id: 'ing-2', name: 'Muối', grams: null, reasons: ['missing_quantity'] }] },
      error: null,
    });
    fireEvent.click(await screen.findByRole('tab', { name: 'Công thức' }));
    fireEvent.change(screen.getByLabelText('Tìm công thức'), { target: { value: 'thịt' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tìm' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Tính dinh dưỡng Thịt luộc' }));
    const box = await screen.findByLabelText('Kết quả dinh dưỡng');
    expect(within(box).getByText('Thiếu dữ liệu')).toBeInTheDocument();
    expect(within(box).getByText('Muối: thiếu số lượng (ví dụ "vừa ăn")')).toBeInTheDocument();
    expect(within(box).getAllByText('—').length).toBe(16);
    expect(within(box).queryByRole('button', { name: 'Xác minh kết quả' })).toBeNull();
  });
});
