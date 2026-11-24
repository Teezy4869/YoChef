// Maps Supabase Auth errors to Vietnamese messages. Never surfaces raw server
// text, and never reveals whether an email is registered on sign-in.

type MaybeAuthError = { code?: string; name?: string; status?: number; message?: string } | null | undefined;

const BY_CODE: Record<string, string> = {
  invalid_credentials: 'Email hoặc mật khẩu không đúng.',
  email_not_confirmed: 'Email chưa được xác nhận. Mở thư xác nhận trong hộp thư của bạn rồi thử lại.',
  user_already_exists: 'Email này đã được đăng ký. Hãy đăng nhập.',
  email_exists: 'Email này đã được đăng ký. Hãy đăng nhập.',
  weak_password: 'Mật khẩu quá yếu. Hãy dùng mật khẩu dài hơn, có chữ và số.',
  email_address_invalid: 'Email không hợp lệ.',
  email_address_not_authorized: 'Máy chủ chưa cho phép gửi thư tới email này.',
  over_email_send_rate_limit: 'Đã gửi quá nhiều thư. Vui lòng thử lại sau ít phút.',
  over_request_rate_limit: 'Thao tác quá nhanh. Vui lòng thử lại sau ít phút.',
  signup_disabled: 'Hiện chưa mở đăng ký tài khoản mới.',
  email_provider_disabled: 'Hiện chưa mở đăng nhập bằng email.',
  user_banned: 'Tài khoản đang bị tạm khóa.',
  session_expired: 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.',
  refresh_token_not_found: 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.',
};

export const NETWORK_ERROR = 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';
export const GENERIC_ERROR = 'Có lỗi xảy ra. Vui lòng thử lại.';

export function authErrorMessage(error: MaybeAuthError): string {
  if (!error) return GENERIC_ERROR;
  if (error.code && BY_CODE[error.code]) return BY_CODE[error.code];
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) return NETWORK_ERROR;
  if (error.message && /network|fetch/i.test(error.message)) return NETWORK_ERROR;
  if (error.status === 429) return BY_CODE.over_request_rate_limit;
  return GENERIC_ERROR;
}
