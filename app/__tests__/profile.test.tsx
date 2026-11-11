import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import App from '@/app/App';
import { initialsOf } from '@/components/Avatar';
import { pickAvatar } from '@/features/profile/pickAvatar';
import { blankToNull, replaceAvatar, resolveAvatarMime } from '@/features/profile/profileApi';

import { createFakeSupabase, fakeSession } from './helpers/fakeSupabase';

jest.mock('@/features/profile/pickAvatar', () => ({ pickAvatar: jest.fn() }));
const mockedPick = pickAvatar as jest.MockedFunction<typeof pickAvatar>;

const ENV = { url: 'https://bdhphjwhagygbwtfhhxn.supabase.co', key: 'sb_publishable_test' };
const USER = '22222222-2222-4222-8222-222222222222';

globalThis.fetch = jest.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(1024) })) as unknown as typeof fetch;

async function renderSignedIn(
  setup?: (fake: ReturnType<typeof createFakeSupabase>) => void,
  { waitForProfile = true } = {},
) {
  const fake = createFakeSupabase(fakeSession({ id: USER, email: 'chef@example.com' }));
  setup?.(fake);
  render(<App rawEnv={ENV} createClient={() => fake.client} />);
  fireEvent.press(await screen.findByRole('button', { name: /Tài khoản/ }));
  if (waitForProfile) await screen.findByTestId('account-signed-in');
  return fake;
}

describe('profile helpers', () => {
  it('stores blank as NULL', () => {
    expect(blankToNull('   ')).toBeNull();
    expect(blankToNull(' Bếp ')).toBe('Bếp');
  });

  it('resolves avatar MIME from the picker or the file name', () => {
    expect(resolveAvatarMime({ uri: 'file:///a.jpg', mimeType: 'image/jpeg' })).toBe('image/jpeg');
    expect(resolveAvatarMime({ uri: 'file:///a.PNG' })).toBe('image/png');
    expect(resolveAvatarMime({ uri: 'file:///a.heic', mimeType: 'image/heic' })).toBeNull();
  });

  it('builds initials', () => {
    expect(initialsOf('Nguyễn Văn An')).toBe('NA');
    expect(initialsOf(null)).toBe('?');
  });
});

describe('replaceAvatar', () => {
  it('rejects files over 5 MB before uploading', async () => {
    const fake = createFakeSupabase(fakeSession({ id: USER }));
    await expect(
      replaceAvatar(fake.client, USER, { uri: 'file:///a.jpg', mimeType: 'image/jpeg', fileSize: 6 * 1024 * 1024 }, null),
    ).rejects.toThrow('5 MB');
    expect(fake.bucket.upload).not.toHaveBeenCalled();
  });

  it('uploads inside the user folder and removes the previous file', async () => {
    const fake = createFakeSupabase(fakeSession({ id: USER }));
    const old = `${USER}/old.jpg`;
    fake.objects.add(old);
    const path = await replaceAvatar(
      fake.client,
      USER,
      { uri: 'file:///a.png', mimeType: 'image/png' },
      old,
      async () => new ArrayBuffer(10),
    );
    expect(path).toMatch(new RegExp(`^${USER}/\\d+\\.png$`));
    expect(fake.bucket.upload).toHaveBeenCalledWith(path, expect.any(ArrayBuffer), {
      contentType: 'image/png',
      upsert: false,
    });
    expect(fake.profileOf(USER).avatar_path).toBe(path);
    expect(fake.objects.has(old)).toBe(false);
  });

  it('removes the uploaded file when the profile update fails', async () => {
    const fake = createFakeSupabase(null); // no session: update matches no row
    await expect(
      replaceAvatar(fake.client, USER, { uri: 'file:///a.jpg', mimeType: 'image/jpeg' }, null, async () => new ArrayBuffer(10)),
    ).rejects.toThrow();
    expect(fake.objects.size).toBe(0);
  });
});

describe('ProfileView', () => {
  it('shows the profile from get_my_profile, including bio', async () => {
    await renderSignedIn((fake) => Object.assign(fake.profileOf(USER), { display_name: 'Bếp An', bio: 'Thích món kho.' }));
    expect(screen.getByTestId('profile-name')).toHaveTextContent('Bếp An');
    expect(screen.getByTestId('profile-bio')).toHaveTextContent('Thích món kho.');
    expect(screen.getByText('chef@example.com')).toBeTruthy();
  });

  it('saves edits and turns blank fields into NULL', async () => {
    const fake = await renderSignedIn((f) => Object.assign(f.profileOf(USER), { display_name: 'Cũ', bio: 'Bio cũ' }));
    fireEvent.press(screen.getByRole('button', { name: 'Sửa hồ sơ' }));
    fireEvent.changeText(screen.getByLabelText('Tên hiển thị'), '  Bếp Mới ');
    fireEvent.changeText(screen.getByLabelText('Giới thiệu'), '   ');
    fireEvent.press(screen.getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByText('Đã lưu hồ sơ.')).toBeTruthy();
    expect(fake.profileOf(USER)).toMatchObject({ display_name: 'Bếp Mới', bio: null });
    expect(screen.getByTestId('profile-name')).toHaveTextContent('Bếp Mới');
    expect(screen.getByTestId('profile-bio')).toHaveTextContent('Chưa có giới thiệu.');
  });

  it('blocks a bio over 500 characters', async () => {
    const fake = await renderSignedIn();
    fireEvent.press(screen.getByRole('button', { name: 'Sửa hồ sơ' }));
    fireEvent.changeText(screen.getByLabelText('Giới thiệu'), 'a'.repeat(501));
    fireEvent.press(screen.getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByText('Giới thiệu tối đa 500 ký tự.')).toBeTruthy();
    expect(fake.from).not.toHaveBeenCalled();
  });

  it('changes the avatar from the picker', async () => {
    mockedPick.mockResolvedValueOnce({ uri: 'file:///pick.jpg', mimeType: 'image/jpeg', fileSize: 2048 });
    const fake = await renderSignedIn();
    fireEvent.press(screen.getByRole('button', { name: 'Đổi ảnh đại diện' }));
    expect(await screen.findByText('Đã cập nhật ảnh đại diện.')).toBeTruthy();
    expect(fake.profileOf(USER).avatar_path).toMatch(new RegExp(`^${USER}/`));
    expect(screen.getByTestId('avatar-image')).toBeTruthy();
  });

  it('does nothing when the picker is cancelled', async () => {
    mockedPick.mockResolvedValueOnce(null);
    const fake = await renderSignedIn();
    fireEvent.press(screen.getByRole('button', { name: 'Đổi ảnh đại diện' }));
    await waitFor(() => expect(mockedPick).toHaveBeenCalled());
    expect(fake.bucket.upload).not.toHaveBeenCalled();
  });

  it('offers a retry when loading fails', async () => {
    await renderSignedIn(
      (fake) => fake.rpc.mockResolvedValueOnce({ data: null, error: { message: 'TypeError: Network request failed' } }),
      { waitForProfile: false },
    );
    expect(await screen.findByTestId('profile-error')).toBeTruthy();
    expect(screen.getByText(/Không kết nối được máy chủ/)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByTestId('account-signed-in')).toBeTruthy();
  });
});
