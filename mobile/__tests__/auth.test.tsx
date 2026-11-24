import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import App from '@/app/App';
import { authErrorMessage, NETWORK_ERROR } from '@/features/auth/authErrors';
import { validateSignUp } from '@/features/auth/validation';

import { createFakeSupabase, fakeSession } from './helpers/fakeSupabase';

const ENV = { url: 'https://bdhphjwhagygbwtfhhxn.supabase.co', key: 'sb_publishable_test' };

function renderApp(fake = createFakeSupabase()) {
  render(<App rawEnv={ENV} createClient={() => fake.client} />);
  return fake;
}

async function openAccountTab() {
  fireEvent.press(await screen.findByRole('button', { name: /Tài khoản/ }));
}

describe('validation', () => {
  it('reports every field problem at once', () => {
    expect(validateSignUp({ email: 'x', password: '123', confirm: '', displayName: 'a'.repeat(51) })).toEqual({
      email: 'Email không hợp lệ.',
      password: 'Mật khẩu cần ít nhất 8 ký tự.',
      displayName: 'Tên hiển thị tối đa 50 ký tự.',
    });
  });

  it('checks the confirmation only once the password is valid', () => {
    expect(validateSignUp({ email: 'a@b.vn', password: '12345678', confirm: '1234567', displayName: '' })).toEqual({
      confirm: 'Mật khẩu nhập lại không khớp.',
    });
  });
});

describe('authErrorMessage', () => {
  it('maps known codes and hides raw server text', () => {
    expect(authErrorMessage({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe(
      'Email hoặc mật khẩu không đúng.',
    );
    expect(authErrorMessage({ name: 'AuthRetryableFetchError', status: 0 })).toBe(NETWORK_ERROR);
    expect(authErrorMessage({ message: 'some internal detail' })).not.toContain('internal');
  });
});

describe('session restore', () => {
  it('shows a loader, then the signed-in account from the persisted session', async () => {
    renderApp(createFakeSupabase(fakeSession({ email: 'restored@example.com' })));
    expect(screen.getByTestId('auth-loading')).toBeTruthy();
    await openAccountTab();
    expect(await screen.findByText('restored@example.com')).toBeTruthy();
  });

  it('starts as a guest without a stored session', async () => {
    renderApp();
    await openAccountTab();
    expect(await screen.findByTestId('account-guest')).toBeTruthy();
  });
});

describe('sign in', () => {
  it('validates before calling the server', async () => {
    const fake = renderApp();
    await openAccountTab();
    fireEvent.press(await screen.findByRole('button', { name: 'Đăng nhập' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByText('Nhập email.')).toBeTruthy();
    expect(fake.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('signs in with a normalized email and closes the modal', async () => {
    const fake = renderApp();
    await openAccountTab();
    fireEvent.press(await screen.findByRole('button', { name: 'Đăng nhập' }));
    fireEvent.changeText(await screen.findByLabelText('Email'), '  An@Example.COM ');
    fireEvent.changeText(screen.getByLabelText('Mật khẩu'), 'correct horse');
    fireEvent.press(screen.getByRole('button', { name: 'Đăng nhập' }));
    await waitFor(() =>
      expect(fake.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'an@example.com', password: 'correct horse' }),
    );
    expect(await screen.findByTestId('account-signed-in')).toBeTruthy();
    expect(screen.queryByLabelText('Mật khẩu')).toBeNull();
  });

  it('shows a mapped error on bad credentials', async () => {
    const fake = createFakeSupabase();
    fake.auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: { code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' },
    } as never);
    renderApp(fake);
    await openAccountTab();
    fireEvent.press(await screen.findByRole('button', { name: 'Đăng nhập' }));
    fireEvent.changeText(await screen.findByLabelText('Email'), 'an@example.com');
    fireEvent.changeText(screen.getByLabelText('Mật khẩu'), 'wrong');
    fireEvent.press(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByText('Email hoặc mật khẩu không đúng.')).toBeTruthy();
  });
});

describe('sign up', () => {
  async function fillSignUp() {
    await openAccountTab();
    fireEvent.press(await screen.findByRole('button', { name: 'Tạo tài khoản' }));
    fireEvent.changeText(await screen.findByLabelText('Tên hiển thị (không bắt buộc)'), '  Bếp An  ');
    fireEvent.changeText(screen.getByLabelText('Email'), 'new@example.com');
    fireEvent.changeText(screen.getByLabelText('Mật khẩu'), 'password123');
    fireEvent.changeText(screen.getByLabelText('Nhập lại mật khẩu'), 'password123');
    fireEvent.press(screen.getByRole('button', { name: 'Đăng ký' }));
  }

  it('passes the trimmed display name as metadata and signs in', async () => {
    const fake = renderApp();
    await fillSignUp();
    await waitFor(() =>
      expect(fake.auth.signUp).toHaveBeenCalledWith({
        email: 'new@example.com',
        password: 'password123',
        options: { data: { display_name: 'Bếp An' } },
      }),
    );
    expect(await screen.findByTestId('account-signed-in')).toBeTruthy();
  });

  it('asks to confirm the email when no session comes back', async () => {
    const fake = createFakeSupabase();
    fake.auth.signUp.mockResolvedValueOnce({ data: { session: null, user: null }, error: null } as never);
    renderApp(fake);
    await fillSignUp();
    expect(await screen.findByTestId('signup-confirm')).toBeTruthy();
  });
});

describe('sign out', () => {
  it('returns to the guest account view', async () => {
    const fake = renderApp(createFakeSupabase(fakeSession()));
    await openAccountTab();
    fireEvent.press(await screen.findByRole('button', { name: 'Đăng xuất' }));
    expect(await screen.findByTestId('account-guest')).toBeTruthy();
    expect(fake.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('goes back to guest when the session expires', async () => {
    const fake = renderApp(createFakeSupabase(fakeSession()));
    await openAccountTab();
    await screen.findByTestId('account-signed-in');
    act(() => fake.setSession(null, 'SIGNED_OUT'));
    expect(await screen.findByTestId('account-guest')).toBeTruthy();
  });
});
