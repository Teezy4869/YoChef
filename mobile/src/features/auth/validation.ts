// Client-side checks mirror the database and Auth limits so users get a clear
// message before a round trip. The server stays the authority.

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // bcrypt input limit used by Supabase Auth
export const DISPLAY_NAME_MAX = 50; // profiles.display_name CHECK

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateEmail(email: string): string | null {
  const e = normalizeEmail(email);
  if (!e) return 'Nhập email.';
  if (!EMAIL_RE.test(e)) return 'Email không hợp lệ.';
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) return 'Nhập mật khẩu.';
  if (password.length < PASSWORD_MIN) return `Mật khẩu cần ít nhất ${PASSWORD_MIN} ký tự.`;
  if (password.length > PASSWORD_MAX) return `Mật khẩu tối đa ${PASSWORD_MAX} ký tự.`;
  return null;
}

/** Display name is optional at sign-up: blank means NULL, never ''. */
export function validateDisplayName(name: string, { required = false } = {}): string | null {
  const n = name.trim();
  if (!n) return required ? 'Nhập tên hiển thị.' : null;
  if (n.length > DISPLAY_NAME_MAX) return `Tên hiển thị tối đa ${DISPLAY_NAME_MAX} ký tự.`;
  return null;
}

export type SignInErrors = { email?: string; password?: string };
export type SignUpErrors = SignInErrors & { displayName?: string; confirm?: string };

export function validateSignIn(v: { email: string; password: string }): SignInErrors {
  const errors: SignInErrors = {};
  const email = validateEmail(v.email);
  if (email) errors.email = email;
  if (!v.password) errors.password = 'Nhập mật khẩu.';
  return errors;
}

export function validateSignUp(v: {
  email: string;
  password: string;
  confirm: string;
  displayName: string;
}): SignUpErrors {
  const errors: SignUpErrors = {};
  const email = validateEmail(v.email);
  if (email) errors.email = email;
  const password = validatePassword(v.password);
  if (password) errors.password = password;
  if (!password && v.confirm !== v.password) errors.confirm = 'Mật khẩu nhập lại không khớp.';
  const name = validateDisplayName(v.displayName);
  if (name) errors.displayName = name;
  return errors;
}

export function hasErrors(errors: object): boolean {
  return Object.keys(errors).length > 0;
}
