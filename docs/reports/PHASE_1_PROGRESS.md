# Báo cáo tiến độ Phase 1

**Ngày:** 2026-11-11 · **Project v2:** `bdhphjwhagygbwtfhhxn` · **Kết luận:** code Phase 1 xong, tầng 1 và tầng 2 xanh. **Chưa đạt DoD**: tầng 3 (live trên v2) chưa chạy, migration 1.1 chưa `db push`.

Spec gốc `YoChef_born_again/20_phase_specs/` không có trên máy làm việc. Phạm vi lấy từ `PHASE_0_COMPLETION.md` §7: khung app, theme và design system, env fail-closed, Auth (đăng ký, đăng nhập, khôi phục phiên, đăng xuất), hồ sơ; kiểm tra live bắt buộc: đăng ký và đăng nhập thật trên v2, profile được tạo tự động. Khi có spec, cần đối chiếu lại.

## 1. Các bước

| Bước | Nhánh | Commit | Nội dung |
|---|---|---|---|
| 1.1 | `phase-1/1.1-avatars-bio` | `25625ed` | Migration `20261111120000_avatars_owner_profile`: bucket `avatars` (public, 5 MB, jpeg/png/webp), policy chỉ ghi trong `<user id>/`, RPC `get_my_profile()` (chốt O2). 7 test PGlite. |
| 1.2 | `phase-1/1.2-theme` | `6014a7f` | Design tokens (màu đạt WCAG AA, có test tương phản), `AppText`, `Button`, `TextField`, `Banner`, `Screen`. |
| 1.3 | `phase-1/1.3-env-client` | `b9a3e34` | Env fail-closed: chỉ nhận `https://<ref>.supabase.co` và publishable key / JWT anon; từ chối secret, service_role, placeholder. Env sai thì không tạo client. |
| 1.4 | `phase-1/1.4-auth` | `58219ca` | Đăng ký, đăng nhập, khôi phục phiên (AsyncStorage), đăng xuất (local), refresh token chỉ khi app ở foreground. Tab Khám phá / Tài khoản; màn Auth dạng modal. |
| 1.5 | `phase-1/1.5-profile` | `e20ad7f` | Hồ sơ: xem, sửa tên và giới thiệu (rỗng lưu `NULL`), đổi ảnh đại diện (chọn ảnh, cắt vuông, tải lên, xóa ảnh cũ). |
| 1.6 | `phase-1/1.6-live-auth-check` | (commit này) | `scripts/live_auth_smoke.mjs` + `npm run smoke:auth`, log tầng 1 và 2, báo cáo này. |

Các nhánh nối tiếp nhau (1.1 → 1.6), **chưa merge vào `main`, chưa push**.

## 2. Kết quả kiểm thử đã chạy

| Tầng | Lệnh | Kết quả | Log |
|---|---|---|---|
| 1 | `npm run check` | exit 0; app 49/49 test (5 suite), admin 1/1, typecheck và lint sạch | `docs/evidence/phase-1/check.log` |
| 2 | `npm run test:db` | 34/34 (phần seed bỏ qua vì zip dữ liệu không có trên máy) | `docs/evidence/phase-1/test_db.log` |
| Bundle | `expo export --platform android` (không nạp `.env`) | Build Hermes thành công | không lưu (chạy thử) |
| 3 | `npm run smoke:auth` | **Chưa chạy** | `docs/evidence/phase-1/live_auth_smoke.log` (sẽ tạo) |

Test UI dùng Supabase giả trong bộ nhớ (`app/__tests__/helpers/fakeSupabase.ts`). Mock chỉ chứng minh UI nối đúng, không chứng minh tích hợp.

## 3. Việc chủ dự án cần làm để đạt DoD

1. Duyệt và chạy `npx supabase db push --linked` (áp `20261111120000_avatars_owner_profile`), rồi `npx supabase migration list --linked` và `npx supabase db advisors --linked`.
2. Tạo `.env.smoke` ở gốc repo (git bỏ qua) với `SMOKE_EMAIL` (hộp thư dùng để test, không phải tài khoản staff) và `SMOKE_PASSWORD`.
3. `npm run smoke:auth -- --signup` một lần. Nếu báo cần xác nhận email, mở thư xác nhận.
4. `npm run smoke:auth`. Kỳ vọng `ALL PASS` (26 kiểm tra): đăng nhập thật, trigger tạo profile, `get_my_profile`, `bio` không public, RLS profiles và `user_roles`, policy bucket `avatars`, đăng xuất thu hồi refresh token.
5. `npm run smoke:live` vẫn xanh 19/19.
6. Chạy app trên máy thật (`npm --prefix app start`), đăng ký và đăng nhập, đổi ảnh đại diện.
7. Sau khi xanh: merge fast-forward lần lượt các nhánh vào `main`, commit log `live_auth_smoke.log`.

Script chỉ ghi vào dữ liệu của chính user test và hoàn tác hết (bio, `avatar_path`, một file PNG 1x1). Không in key, mật khẩu hay email đầy đủ.

## 4. Quyết định

| Quyết định | Lý do |
|---|---|
| Khách vẫn dùng được app; đăng nhập là modal từ tab Tài khoản | Phase 0 đã kiểm quyền đọc của khách; Phase 2 cho khách xem công thức |
| Mật khẩu tối thiểu 8 ký tự ở client | Supabase mặc định 6; server vẫn là nơi quyết định, lỗi `weak_password` được dịch |
| Đăng ký không có phiên trả về cùng một thông báo "kiểm tra hộp thư" | Không lộ email đã đăng ký hay chưa |
| Đăng xuất phạm vi `local` | Chỉ thoát thiết bị này; phiên lưu cục bộ bị xóa kể cả khi mạng lỗi |
| Chưa có khôi phục mật khẩu qua email | Cần deep link và cấu hình redirect URL trên Dashboard; chưa có trong phạm vi §7 |
| Tab bar chỉ có nhãn, chưa có icon | Chưa có bộ icon trong dependency; thêm khi chốt thiết kế |
| `expo-image-picker` plugin: chỉ xin quyền thư viện ảnh | Camera chưa dùng (Phase 3.5 sẽ cấu hình lại) |

## 5. Giới hạn và việc còn mở

- Tầng 3 chưa chạy, migration 1.1 chưa lên v2: Phase 1 **chưa** được coi là xong.
- Chưa kiểm trên thiết bị thật hay Expo Go; chỉ có test Jest và bundle Android.
- Chưa có màn quên mật khẩu, đổi email, xóa tài khoản.
- Spec Phase 1 gốc chưa được đối chiếu.
