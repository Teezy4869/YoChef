# Báo cáo hoàn thành Phase 0

**Ngày:** 2026-11-08 · **Project v2:** `bdhphjwhagygbwtfhhxn` · **Kết luận:** đạt cả 5 tiêu chí DoD, có bằng chứng ở `docs/evidence/phase-0/`.

## 1. Definition of Done

| Tiêu chí (`03_PHASE_0_REBUILD_GUIDE.md` §2) | Kết quả | Bằng chứng |
|---|---|---|
| Migration 0001–0002 áp lên v2 qua CLI, `migration list` khớp repo | Đạt: local = remote cho `20261108130000`, `20261108130100` | `v2_state.log` |
| Import đúng số dòng, chạy lại không đổi | Đạt: 250 / 542 / 2.942 / 1.166, 242 ảnh. Lần 2: md5 nội dung 6 bảng giống hệt (kể cả `id`, `updated_at`) | Mục 3 bên dưới; `seed import` trong `test_db.log` |
| Test PGlite xanh | Đạt: 34/34 | `test_db.log` |
| Live smoke xanh | Đạt: 19/19, chủ dự án chạy lúc 15:26 UTC | `live_smoke.log` |
| Không có bí mật trong git | Đạt: chỉ `.env.example` được track; quét toàn bộ lịch sử không có `sb_secret_…`, `sb_publishable_…` | Lệnh ở mục 4 |

Thêm: `supabase db advisors --linked` báo không có vấn đề (`v2_state.log`); `npm run check` exit 0 (`check.log`).

## 2. Các bước

| Bước | Commit | Nội dung |
|---|---|---|
| 0.1 | `3558d81` | Repo, app Expo, admin Vite, ghim phiên bản |
| 0.2 | `8a815ed` | `supabase init`, link v2 |
| 0.3 | `47ae64f` | `docs/database/SCHEMA_V2.md` |
| 0.4 | `9ba5e41`, `bae78ff` | Migration catalog và identity/RBAC, harness PGlite |
| 0.5 | `9734394` | Script import idempotent, nạp dữ liệu và ảnh lên v2 |
| 0.6 | `1ad794b`, `cca6419` | Live smoke, ba tầng test, log bằng chứng |
| 0.7 | (commit này) | README, AGENTS.md, báo cáo này |

## 3. Kiểm chứng import trên v2 (đã chạy)

Snapshot `count` và `md5(string_agg(row))` trước và sau lần chạy thứ hai của `seed.sql`, kết quả giống hệt:

```
recipe_sources           1 f17da7d810b813188859555332a6d20d
categories              10 2f89b1d59a70b145ef1689933160480d
ingredients            542 aea8a21d7a48b17b567bc53d9f2c78b5
recipes                250 0d4d2aa703d1f74efc7c32a7a5622afc
recipe_ingredients    2942 f1b3d8e1eae5f8dafa74bb475c3cee04
recipe_steps          1166 b56d8bd395177c162452f2cd94b4e457
```

Storage: 242 object `image/webp`, 0 công thức thiếu ảnh, 0 object mồ côi, 0 ảnh cách ly, tổng 52.248.600 byte khớp thư mục nguồn.

## 4. Quét bí mật

```
git ls-files | grep -iE '\.env'                                   -> admin/.env.example, app/.env.example
git log --all -p | grep -cE 'sb_secret_[A-Za-z0-9]|sb_publishable_[A-Za-z0-9]{10}'   -> 0
```

## 5. Quyết định thay đổi so với kế hoạch hoặc v1

| Quyết định | Lý do |
|---|---|
| jest 30, TypeScript 6 cho app (v1: 29 / 5.7) | Phiên bản Expo SDK 58 yêu cầu; `expo-doctor` 20/20 |
| Vitest 2 → 4 cho admin | Vitest 2 kéo bản vite thứ hai và có advisory critical (`tinypool`) |
| PGlite 0.3.15 thay vì 0.5.x | 0.5.x chạy PostgreSQL 18; 0.3.15 là PostgreSQL 17.5, cùng major với v2 |
| Không có `recipe_categories` | Dữ liệu có đúng 1 danh mục mỗi công thức |
| `recipe_sources` đọc công khai | Ghi công nguồn sách |
| Áp dữ liệu qua CLI đã đăng nhập | Không cần đưa secret key vào `.env` |
| 8 ảnh `IMAGE_PENDING` không upload | Bucket public; đã xem tận mắt #112 (có chữ đè) và #213 (sạch) |

## 6. Giới hạn và việc còn mở

- **Auth thật chưa được kiểm trên v2.** Trigger đăng ký mới chỉ được test trên PGlite. Phase 1 sẽ đăng ký một user thật.
- **PGlite không chạy PostgREST, GoTrue, Storage.** Tầng 3 bù cho phần đọc của khách; chưa có live test cho người dùng đã đăng nhập.
- **Số kỳ vọng trong `scripts/live_smoke.mjs` được ghi cứng.** Khi publish thêm công thức phải cập nhật trong cùng commit.
- **Chạy lại seed sẽ ghi đè chỉnh sửa của editor.** Không chạy lại seed sau Phase 4.5.
- **Dữ liệu cần editor rà** (`import_report.json`): tên sách trong header JSON khác bản provenance; #095 "Tỏi" xuất hiện 2 lần; 5 công thức còn ghi chú `IMAGE_DEFECT` cũ; 14 công thức `staged`.
- **`npm audit`:** còn advisory mức moderate trong tooling (app, admin); bản "fix" đề xuất hạ Expo về 52 nên không áp dụng.
- **Việc của chủ dự án** (`03_PHASE_0_REBUILD_GUIDE.md` §6): xác nhận tài khoản admin trên project cũ; quyết định giữ video ID YouTube sau 30 ngày (trước 4.4).

## 7. Sẵn sàng cho Phase 1

Khung app, theme và design system, env fail-closed, Auth (đăng ký, đăng nhập, khôi phục phiên, đăng xuất), hồ sơ. Kiểm tra live bắt buộc: đăng ký và đăng nhập thật trên v2, profile được tạo tự động.
