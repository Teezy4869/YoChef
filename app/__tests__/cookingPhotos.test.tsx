import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import App from '@/app/App';
import { cleanCaption } from '@/features/community/cookingPhotosApi';
import { pickCookingPhoto } from '@/features/community/pickCookingPhoto';

import { createFakeSupabase, fakeSession } from './helpers/fakeSupabase';
import { detailRow } from './helpers/recipeFixtures';

jest.mock('@/features/community/pickCookingPhoto', () => ({ pickCookingPhoto: jest.fn() }));
const mockedPick = pickCookingPhoto as jest.MockedFunction<typeof pickCookingPhoto>;
let bytes = 1024;
globalThis.fetch = jest.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(bytes) })) as unknown as typeof fetch;

const ENV = { url: 'https://bdhphjwhagygbwtfhhxn.supabase.co', key: 'sb_publishable_test' };
const USER = '55555555-5555-4555-8555-555555555555';
const OTHER = '66666666-6666-4666-8666-666666666666';
const SEARCH_ROW = {
  id: 'r1', slug: '001-thit-kho', name: 'Thịt lợn kho cốt dừa', category_slug: 'mon_chinh', category_name: 'Món chính',
  difficulty: 'medium', default_servings: 4, prep_time_minutes: 15, cook_time_minutes: 60, cover_image_path: null, description: null,
};
const photo = (id: string, over: Record<string, unknown> = {}) => ({
  id, user_id: OTHER, recipe_id: 'r1', storage_path: `${OTHER}/${id}.jpg`, caption: null, status: 'approved',
  created_at: `2020-01-01T00:00:${id.slice(1).padStart(2, '0')}Z`, ...over,
});

function setup(session: ReturnType<typeof fakeSession> | null = fakeSession({ id: USER })) {
  const fake = createFakeSupabase(session);
  fake.catalog.recipes = [SEARCH_ROW];
  fake.catalog.details['001-thit-kho'] = detailRow();
  fake.profileOf(OTHER).display_name = 'Bà Ba';
  return fake;
}

async function openRecipe(fake: ReturnType<typeof createFakeSupabase>) {
  render(<App rawEnv={ENV} createClient={() => fake.client} />);
  fireEvent.press(await screen.findByRole('button', { name: /^Thịt lợn kho cốt dừa\./ }));
  const section = await screen.findByTestId('cooking-photos');
  await waitFor(() => expect(within(section).queryByLabelText('Đang tải ảnh')).toBeNull());
  return section;
}
const tiles = () => screen.queryAllByTestId('photo-tile');
const stored = (fake: ReturnType<typeof createFakeSupabase>) =>
  (fake.tables.cooking_photos ?? []).map((p) => [p.user_id, p.caption, p.status]);

beforeEach(() => {
  mockedPick.mockReset();
  bytes = 1024;
});

describe('cooking photos', () => {
  it('a blank caption is NULL, a long one is refused', () => {
    expect(cleanCaption('   ')).toBeNull();
    expect(cleanCaption(' Ngon ')).toBe('Ngon');
    expect(() => cleanCaption('a'.repeat(251))).toThrow('Chú thích tối đa 250 ký tự.');
  });

  it('shows a guest the approved photos through signed URLs, and sends them to sign in', async () => {
    const fake = setup(null);
    fake.tables.cooking_photos = [
      photo('p1', { caption: 'Thơm lừng' }),
      photo('p2', { status: 'pending' }),
      photo('p3', { status: 'rejected' }),
    ];
    await openRecipe(fake);
    expect(tiles().length).toBe(1);
    expect(screen.getByText('Thơm lừng')).toBeTruthy();
    expect(screen.getByLabelText('Thơm lừng. Ảnh của Bà Ba').props.source.uri).toContain('/sign/cooking-photos/');
    expect(fake.bucket.createSignedUrls).toHaveBeenCalledWith([`${OTHER}/p1.jpg`], 3600);
    fireEvent.press(screen.getByRole('button', { name: 'Đăng nhập để đăng ảnh' }));
    expect(await screen.findByRole('button', { name: 'Đăng nhập' })).toBeTruthy();
  });

  it('says so when there are no photos', async () => {
    const empty = setup();
    await openRecipe(empty);
    expect(screen.getByText('Chưa có ảnh nào.')).toBeTruthy();
  });

  it('shows a placeholder when a file cannot be signed', async () => {
    const fake = setup();
    fake.tables.cooking_photos = [photo('p1')];
    fake.unsigned.add(`${OTHER}/p1.jpg`);
    await openRecipe(fake);
    expect(screen.getByText('Không tải được ảnh')).toBeTruthy();
  });

  it('takes a photo, uploads it into my folder, and it waits for review', async () => {
    const fake = setup();
    mockedPick.mockResolvedValueOnce({ uri: 'file:///photo.jpg' });
    await openRecipe(fake);
    fireEvent.press(screen.getByRole('button', { name: 'Chụp ảnh' }));
    expect(await screen.findByLabelText('Ảnh sắp đăng')).toBeTruthy();
    expect(mockedPick).toHaveBeenCalledWith('camera');
    fireEvent.changeText(screen.getByLabelText('Chú thích (không bắt buộc)'), '  Lần đầu nấu  ');
    fireEvent.press(screen.getByRole('button', { name: 'Đăng ảnh' }));
    expect(await screen.findByText('Đã gửi. Ảnh sẽ hiện công khai sau khi được duyệt.')).toBeTruthy();

    const [path, , opts] = fake.bucket.upload.mock.calls[0];
    expect(path).toMatch(new RegExp(`^${USER}/[A-Za-z0-9_-]+\\.jpg$`));
    expect(opts).toEqual({ contentType: 'image/jpeg', upsert: false });
    expect(stored(fake)).toEqual([[USER, 'Lần đầu nấu', 'pending']]);
    expect(fake.tables.cooking_photos?.[0].storage_path).toBe(path);
    await waitFor(() => expect(tiles().length).toBe(1));
    expect(within(tiles()[0]).getByText('Đang chờ duyệt')).toBeTruthy();
    expect(screen.queryByLabelText('Ảnh sắp đăng')).toBeNull();
  });

  it('does nothing when picking is cancelled, and explains a refused camera', async () => {
    const fake = setup();
    mockedPick.mockResolvedValueOnce(null).mockResolvedValueOnce('denied');
    await openRecipe(fake);
    fireEvent.press(screen.getByRole('button', { name: 'Chọn từ thư viện' }));
    await waitFor(() => expect(mockedPick).toHaveBeenCalledWith('library'));
    expect(screen.queryByLabelText('Ảnh sắp đăng')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Chụp ảnh' }));
    expect(await screen.findByText('YoChef chưa được dùng camera. Hãy cho phép trong phần cài đặt của máy.')).toBeTruthy();
    expect(fake.bucket.upload).not.toHaveBeenCalled();
  });

  it('removes the uploaded file again when saving the row fails', async () => {
    const fake = setup();
    mockedPick.mockResolvedValueOnce({ uri: 'file:///photo.jpg' });
    await openRecipe(fake);
    fireEvent.press(screen.getByRole('button', { name: 'Chụp ảnh' }));
    await screen.findByLabelText('Ảnh sắp đăng');
    fake.failNext('cooking_photos', 'insert');
    fireEvent.press(screen.getByRole('button', { name: 'Đăng ảnh' }));
    expect(await screen.findByText('Không lưu được ảnh.')).toBeTruthy();
    const [path] = fake.bucket.upload.mock.calls[0];
    expect(fake.bucket.remove).toHaveBeenCalledWith([path]);
    expect(fake.objects.has(path)).toBe(false);
    expect(screen.getByLabelText('Ảnh sắp đăng')).toBeTruthy(); // the photo stays, ready to retry
  });

  it('refuses a photo over 5 MB and a caption over 250 characters', async () => {
    const fake = setup();
    mockedPick.mockResolvedValue({ uri: 'file:///photo.jpg' });
    await openRecipe(fake);
    fireEvent.press(screen.getByRole('button', { name: 'Chọn từ thư viện' }));
    await screen.findByLabelText('Ảnh sắp đăng');
    fireEvent.changeText(screen.getByLabelText('Chú thích (không bắt buộc)'), 'a'.repeat(251));
    expect(screen.getByText('Chú thích tối đa 250 ký tự.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Đăng ảnh' })).toBeDisabled();
    fireEvent.changeText(screen.getByLabelText('Chú thích (không bắt buộc)'), '');
    bytes = 5 * 1024 * 1024 + 1;
    fireEvent.press(screen.getByRole('button', { name: 'Đăng ảnh' }));
    expect(await screen.findByText('Ảnh lớn hơn 5 MB. Hãy chọn ảnh khác.')).toBeTruthy();
    expect(fake.bucket.upload).not.toHaveBeenCalled();
  });

  it('asks before removing my photo, then removes the row and the file', async () => {
    const fake = setup();
    const mine = photo('p1', { user_id: USER, storage_path: `${USER}/p1.jpg`, status: 'pending' });
    fake.tables.cooking_photos = [mine, photo('p2')];
    await openRecipe(fake);
    expect(screen.getAllByRole('button', { name: 'Xóa ảnh' }).length).toBe(1); // only my own
    fireEvent.press(screen.getByRole('button', { name: 'Xóa ảnh' }));
    fireEvent.press(screen.getByRole('button', { name: 'Không xóa' }));
    expect(stored(fake).length).toBe(2);
    fireEvent.press(screen.getByRole('button', { name: 'Xóa ảnh' }));
    fireEvent.press(screen.getByRole('button', { name: 'Xóa' }));
    await waitFor(() => expect(tiles().length).toBe(1));
    expect(stored(fake)).toEqual([[OTHER, null, 'approved']]);
    expect(fake.bucket.remove).toHaveBeenCalledWith([`${USER}/p1.jpg`]);
  });
});
