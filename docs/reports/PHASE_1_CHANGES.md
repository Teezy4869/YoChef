# Phase 1: các thay đổi so với Phase 0

**Cập nhật:** 2026-11-13 · Trạng thái, kết quả kiểm thử và việc còn lại: xem `PHASE_1_PROGRESS.md`. File này chỉ liệt kê **cái gì đã đổi** và **điểm chưa hợp lý**.

Nhánh: `phase-1/1.1-avatars-bio` → `1.2-theme` → `1.3-env-client` → `1.4-auth` → `1.5-profile` → `1.6-live-auth-check` (nối tiếp nhau, từ `main` tại `6cda4d9`). Chưa merge, chưa push.

## 1. Database

| File | Thay đổi |
|---|---|
| `supabase/migrations/20261111120000_avatars_owner_profile.sql` (mới) | Bucket `avatars` (public, 5 MB, `image/jpeg|png|webp`). Bốn policy trên `storage.objects` (select/insert/update/delete) chỉ cho `authenticated` thao tác trong thư mục `<user id>/`. Hàm `public.get_my_profile()` (`SECURITY DEFINER`, `search_path = ''`, chỉ `authenticated` được gọi) trả dòng profile của chính người gọi, kèm `bio`. |
| `supabase/tests/harness.mjs` | Thêm stub `storage.objects`, `storage.foldername`, quyền dùng schema `storage`. |
| `supabase/tests/phase1.test.mjs` (mới) | 7 test: cấu hình bucket, cách ly thư mục, anon bị chặn, `bio` chỉ chủ sở hữu thấy. |
| `docs/database/SCHEMA_V2.md` | O2 đã chốt (RPC, không dùng view); bảng bucket cập nhật. |

Không đổi bảng nào, không thêm cột. **Migration chưa có trên v2.**

## 2. App (`app/`)

| Khu vực | Thay đổi |
|---|---|
| `src/theme/tokens.ts` | Màu, khoảng cách, bo góc, kiểu chữ, vùng chạm 48. Chỉ giao diện sáng. |
| `src/components/` | `AppText`, `Button`, `TextField`, `Banner`, `Screen`, `Avatar`. |
| `src/lib/env.ts` | Kiểm tra env fail-closed (URL `https://<ref>.supabase.co`; khóa `sb_publishable_…` hoặc JWT vai trò `anon`). |
| `src/lib/supabase.ts` | Client Supabase (AsyncStorage, tự refresh, không đọc phiên từ URL), `SupabaseContext`, `useSupabase`. |
| `src/features/auth/` | `AuthProvider`, `SignInScreen`, `SignUpScreen`, `validation.ts`, `authErrors.ts` (lỗi Auth dịch sang tiếng Việt). |
| `src/features/profile/` | `ProfileView`, `profileApi.ts`, `pickAvatar.ts`. |
| `src/app/App.tsx` | Chặn bởi env, bọc `AuthProvider` và `RootNavigator`. Nhận `rawEnv`, `createClient` làm prop để test. |
| `src/app/navigation/` | Stack gốc + tab Khám phá / Tài khoản; `SignIn`, `SignUp` là modal chỉ tồn tại khi chưa đăng nhập. |
| `src/screens/` | `HomeScreen` (khung tạm), `AccountScreen`, `ConfigErrorScreen`. |
| `app.json` | Thêm plugin `expo-image-picker` (chỉ quyền thư viện ảnh, chuỗi tiếng Việt). |
| `jest.setup.js` | Dùng mock chính thức của `react-native-safe-area-context`. |
| `__tests__/` | `components`, `env`, `App`, `auth`, `profile` + `helpers/fakeSupabase.ts`. Từ 1 test lên 49. |

Không thêm dependency mới (`expo-image-picker`, `@react-navigation/*`, `@supabase/supabase-js` đã có từ Phase 0).

## 3. Công cụ, tài liệu

| File | Thay đổi |
|---|---|
| `scripts/live_auth_smoke.mjs` (mới), `package.json` | `npm run smoke:auth`: 26 kiểm tra với user thật trên v2; `--signup` tạo user test một lần. |
| `docs/evidence/phase-1/` | `check.log`, `test_db.log`. `live_auth_smoke.log` chưa có. |
| `docs/reports/PHASE_1_PROGRESS.md`, `PHASE_1_CHANGES.md` | Báo cáo tiến độ, file này. |
| `README.md`, `docs/HANDOVER.md` | Thêm lệnh `smoke:auth`; Phase 1 ghi là "code xong, chưa live check". |

## 4. Điểm chưa hợp lý, cần bạn biết

1. **Không có spec Phase 1 gốc.** Danh sách bước (1.1 đến 1.6) do mình suy ra từ báo cáo Phase 0. Có thể thiếu hoặc thừa so với `20_phase_specs/`.
2. **`smoke:auth` chưa từng chạy với server thật.** 26 kiểm tra viết theo hành vi PostgREST/Storage/GoTrue đã biết, nhưng có thể sai ở chi tiết (mã HTTP, header upload). Lần chạy đầu có thể FAIL vì lỗi của script, không phải của hệ thống; cần soi từng dòng log.
3. **Script tạo một user thật, lâu dài, trên project v2** (và ghi vào dữ liệu của user đó). Theo AGENTS.md việc này cần bạn duyệt. Nên dùng hộp thư test riêng và xóa user sau Phase 1 nếu không dùng nữa.
4. **Cấu hình xác nhận email của v2 chưa biết.** `supabase/config.toml` (chỉ dùng cục bộ) để `enable_confirmations = false` và mật khẩu tối thiểu 6; cấu hình thật trên Dashboard có thể khác. App xử lý cả hai trường hợp, nhưng chưa kiểm. Client đang yêu cầu mật khẩu từ 8 ký tự, chặt hơn server.
5. **Test giao diện dùng Supabase giả** nên không bắt được lỗi tích hợp (ví dụ RLS, tên cột). Chỉ `smoke:auth` và chạy tay trên máy thật mới bắt được.
6. **Quy trình nhánh lệch một chút so với AGENTS.md:** quy tắc nói một bước = một migration = một commit rồi merge ff vào `main` sau live check. Phase 1 chỉ có một migration, các bước còn lại là code app; mình xếp chúng thành nhánh nối tiếp và **chưa merge gì** cho tới khi live check xanh.
7. **Chưa có:** quên mật khẩu, icon tab bar, thử trên thiết bị thật hoặc Expo Go, đối chiếu với admin (`admin/` không đổi trong Phase 1).
8. **Môi trường máy này:** Supabase CLI chưa đăng nhập (`supabase login`) và chưa có `.env.smoke`, nên mình không thể tự `db push` hay chạy `smoke:auth`, và theo AGENTS.md đó cũng là việc của chủ dự án.
