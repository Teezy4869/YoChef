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

Yêu cầu: Node.js >= 22 (đang dùng 24.18.0), npm 11.

## Quy tắc

- Phiên bản dependency được ghim chính xác (`.npmrc`: `save-exact=true`) và khóa bằng `package-lock.json`.
  Chỉ nâng cấp có chủ đích, trong commit riêng.
- Schema chỉ thay đổi qua migration trong `supabase/migrations/`. Không sửa schema trên Dashboard.
- Không commit `.env`; chỉ commit `.env.example` chứa placeholder.
- Không đưa service-role key, secret key hay mật khẩu database vào app, git hoặc chat.
