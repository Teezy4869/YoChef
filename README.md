# YoChef (v2)

Ứng dụng nấu ăn Việt Nam: app di động (Expo) và admin web (Vite), dùng chung backend Supabase.
Đây là bản build lại từ Phase 0. Bối cảnh và kế hoạch nằm trong gói `YoChef_born_again`
(`01_PROJECT_CONTEXT.md`, `03_PHASE_0_REBUILD_GUIDE.md`).

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| `app/` | Mobile app: Expo SDK 58, React Native 0.88.1, React 19.3, TypeScript strict |
| `admin/` | Admin web: Vite 6, React 18, React Router 7, Tailwind 3 |
| `supabase/` | `migrations/` (nguồn sự thật duy nhất của schema), `functions/`, `seed/`, `tests/` |
| `docs/` | Tài liệu dự án, gồm `docs/database/SCHEMA_V2.md` (Phase 0.3) |
| `scripts/` | Script tiện ích, ví dụ live smoke (Phase 0.6) |

`app/` và `admin/` là hai package npm độc lập (không dùng workspaces, để Metro không bị ảnh hưởng
bởi hoisting). Root chỉ chứa Supabase CLI và các lệnh gộp.

## Lệnh

```bash
npm run install:all   # cài dependency cho root, app, admin
npm run check         # typecheck + lint + test cho cả app và admin
npm --prefix app start
npm --prefix admin run dev
npm --prefix admin run build
```

Yêu cầu: Node.js >= 22 (đang dùng 24.18.0), npm 11. Không cần Docker.

## Database (Supabase v2, project `bdhphjwhagygbwtfhhxn`)

```bash
npx supabase login                       # một lần, trên máy chủ dự án
npx supabase link --project-ref bdhphjwhagygbwtfhhxn
npx supabase migration list --linked     # lịch sử migration phải khớp repo
npx supabase db push --linked            # chỉ sau khi test:db xanh và chủ dự án duyệt
```

Nạp lại 250 công thức (idempotent, zip nằm ngoài repo, kiểm tra sha256):

```bash
npm run seed:build -- --zip <đường dẫn>/recipes_001_250_release_candidate.zip
npx supabase db query --linked -f supabase/.seed-out/seed.sql
npx supabase storage cp -r supabase/.seed-out/recipe-images ss:/// --linked --content-type image/webp --experimental -j 4
```

## Ba tầng kiểm thử (K8)

| Tầng | Lệnh | Chứng minh |
|---|---|---|
| 1. Unit / UI | `npm run check` | typecheck, lint, test của app và admin |
| 2. Database cục bộ | `npm run test:db` | Migration thật trên PGlite (PostgreSQL 17): RLS, grant, trigger, seed |
| 3. Live | `npm run smoke:live` | REST và Storage thật của v2, vai trò khách, publishable key trong `app/.env` |
| 3. Live (Công thức) | `npm run smoke:recipes` | Phase 2, khách, chỉ đọc: RPC `search_recipes` (bỏ dấu, lọc, phân trang), chi tiết một request, các quy tắc `NULL`. Cần migration `20261113120000` đã lên v2 |
| 3. Live (Auth) | `npm run smoke:auth` | User thật trên v2: đăng nhập, trigger tạo profile, RLS khi đã đăng nhập, bucket `avatars`, đăng xuất. Cần thêm `.env.smoke` (`SMOKE_EMAIL`, `SMOKE_PASSWORD`); lần đầu chạy với `-- --signup` |

Một bước chỉ được coi là xong khi tầng 3 xanh cho phần chạm tới database (L2). Log bằng chứng lưu ở `docs/evidence/`.

## Quy tắc

- Phiên bản dependency được ghim chính xác (`.npmrc`: `save-exact=true`) và khóa bằng `package-lock.json`.
  Chỉ nâng cấp có chủ đích, trong commit riêng.
- Schema chỉ thay đổi qua migration trong `supabase/migrations/`. Không sửa schema trên Dashboard.
- Không commit `.env`; chỉ commit `.env.example` chứa placeholder.
- Không đưa service-role key, secret key hay mật khẩu database vào app, git hoặc chat.
