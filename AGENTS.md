# YoChef v2: hướng dẫn cho coding agent

Đọc trước khi sửa repo. Khi tài liệu này mâu thuẫn với tài liệu cũ (gói `YoChef_born_again`, AGENTS.md của v1), **tài liệu này thắng**.

## Nguồn sự thật

| Cần | Ở đâu |
|---|---|
| Schema, RLS, ánh xạ import | `docs/database/SCHEMA_V2.md` |
| Schema đang chạy | `supabase/migrations/` (không có baseline, không có snapshot viết tay) |
| Bằng chứng đã kiểm | `docs/evidence/` và `docs/reports/` |
| Yêu cầu nghiệp vụ | gói `YoChef_born_again`: `10_product_and_architecture/product/app-in4.md`, `20_phase_specs/` (dùng như **yêu cầu**, không phải kết quả) |

## Stack (đã chốt ở Phase 0, chỉ nâng cấp có chủ đích)

Expo SDK 58, React Native 0.88.1, React 19.3, React Navigation 7, TypeScript 6 (app) · Vite 6, React 18, React Router 7, Tailwind 3, Vitest 4 (admin) · Supabase PostgreSQL 17, Auth, Storage, Edge Functions · PGlite 0.3.15 cho test database. Không có backend Node riêng, không Docker, không Expo Router.

## Quy tắc bắt buộc

1. **Schema chỉ đổi bằng migration** trong git (`npx supabase migration new <tên>`). Không sửa schema trên Dashboard. Không import dữ liệu bằng migration.
2. **Một bước = một migration = một commit**, trên nhánh `phase-N/<bước>`, merge fast-forward vào `main`. Không gộp các migration phụ thuộc chéo.
3. **Mỗi migration tự `revoke` rồi `grant`** cho `anon` và `authenticated`. `anon` không bao giờ có quyền ghi. RLS bật trên mọi bảng.
4. **Vai trò chỉ ở `user_roles`.** Không thêm cột `role` vào `profiles`. Dùng `private.is_editor()`, `is_moderator()`, `is_super_admin()`; không tạo `is_admin()`.
5. **Hàm `SECURITY DEFINER`** đặt `set search_path = ''` và gọi đối tượng bằng tên đầy đủ.
6. **"Không biết" là `NULL`**, không bao giờ là `0` hay chuỗi rỗng.
7. **PASS cần bằng chứng thật:** `test:db` xanh trước khi push; sau khi push, live check trên v2. Báo cáo dẫn log, không ghi "verified" khi chưa chạy. Mock không chứng minh tích hợp.
8. **Bí mật:** không đọc, in hay commit `.env`, secret key, service-role key, mật khẩu database. Client chỉ dùng publishable key. Khóa nhà cung cấp (YouTube, USDA) chỉ đặt trong Edge Function secrets.

## Việc chỉ chủ dự án làm

Duyệt mỗi lần `db push` và mỗi lần ghi dữ liệu lên v2 · gõ mật khẩu, dán key vào `.env` · chạy lệnh cần `.env` (ví dụ `npm run smoke:live`) · chọn email super_admin đầu tiên · đặt secret cho Edge Function.

## Project Supabase

| Project | Ref | Trạng thái |
|---|---|---|
| YoChef v2 | `bdhphjwhagygbwtfhhxn` | Đang dùng, quản lý 100% bằng migration |
| cooking-app (cũ) | `ihfuftmpsfgtwvmtfdja` | **Chỉ đọc**, không ghi, không xóa cho tới khi v2 được chấp nhận |
