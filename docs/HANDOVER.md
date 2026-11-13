# YoChef: hướng dẫn bàn giao và sử dụng

Dành cho người nhận dự án. Các ô `<...>` là phần **người bàn giao điền** hoặc **người nhận tự tạo**.
**Không bao giờ ghi giá trị bí mật (key, mật khẩu) vào file này**, chỉ ghi nơi lưu chúng.

Tài liệu đi kèm: `README.md` (lệnh nhanh), `AGENTS.md` (quy tắc bắt buộc), `docs/database/SCHEMA_V2.md` (schema), `docs/reports/PHASE_0_COMPLETION.md` (hiện trạng và bằng chứng).

---

## 1. Dự án là gì

YoChef là ứng dụng nấu ăn Việt Nam: tìm công thức, chỉnh khẩu phần, nấu từng bước có hẹn giờ, đánh giá và bình luận, danh sách mua sắm. Gồm:

| Thành phần | Thư mục | Công nghệ |
|---|---|---|
| App di động | `app/` | Expo SDK 58, React Native 0.88.1, React 19.3, TypeScript, React Navigation 7 |
| Admin web | `admin/` | Vite 6, React 18, React Router 7, Tailwind 3 |
| Backend | `supabase/` | PostgreSQL 17 (migrations), Auth, Storage, Edge Functions |

Không có backend Node riêng, không dùng Docker.

## 2. Hiện trạng (tính đến 2026-11-13)

| Phase | Trạng thái |
|---|---|
| 0. Nền móng (repo, schema, dữ liệu 250 công thức, test 3 tầng) | **Xong**, tag `phase-0-complete` |
| 1. Khung app, theme, Auth, hồ sơ | **Xong**, tag `phase-1-complete`; `smoke:auth` 26/26. Xem `docs/reports/PHASE_1_PROGRESS.md` |
| 2. Recipe core (tìm kiếm, chi tiết, khẩu phần, chế độ nấu) | Đã merge vào `main`, migration đã lên v2, `smoke:recipes` 26/26. 2.1–2.5 đã chạy trên máy thật; 2.6–2.12 (làm tròn A2, thông báo hẹn giờ, phiên nấu, giữ màn hình sáng) chờ kiểm trên máy thật. Xem `docs/reports/PHASE_2_CHANGES.md` |
| 3. Yêu thích, mua sắm, đánh giá, bình luận, ảnh | Chưa làm |
| 4. Admin: RBAC, kiểm duyệt, dinh dưỡng, YouTube, CMS | Chưa làm |

App đã có đăng nhập, hồ sơ, tìm kiếm, chi tiết công thức và chế độ nấu; `admin/` vẫn là màn hình mẫu.
Chi tiết lộ trình: gói tài liệu gốc `YoChef_born_again/03_PHASE_0_REBUILD_GUIDE.md` §3.

## 3. Thông tin bàn giao (điền)

| Mục | Giá trị |
|---|---|
| Repo GitHub | https://github.com/Teezy4869/YoChef |
| Người bàn giao / liên hệ | `<tên, email>` |
| Người nhận | `<tên, email>` |
| Ngày bàn giao | `<yyyy-mm-dd>` |
| Gói tài liệu gốc `YoChef_born_again` (nơi lưu) | Máy người bàn giao: `D:\PTIT\Ung_dung\YoChef_born_again` (và bản nén `YoChef_born_again.zip` cùng cấp). Link chia sẻ: `<điền sau khi đưa lên Drive>` |
| Zip dữ liệu `recipes_001_250_release_candidate.zip` (nơi lưu) | Trong gói trên: `30_data\recipes_001_250_release_candidate.zip` (55 MB, sha256 trong `supabase/seed/dataset.sha256`). Link chia sẻ: `<điền sau khi đưa lên Drive>` |

## 4. Tài khoản và dịch vụ cần có

| Dịch vụ | Dùng để | Chủ tài khoản | Ghi chú |
|---|---|---|---|
| GitHub | Mã nguồn | Tài khoản `Teezy4869` | Cần quyền ghi repo |
| Supabase | Database, Auth, Storage | `<email đăng nhập Dashboard>` | Tổ chức chứa v2: `lqnbivordcxkbiubogjt` |
| Google Cloud (YouTube Data API) | Video tham khảo (Phase 4.4) | Chưa tạo | Khóa chỉ đặt ở Edge Function |
| USDA FoodData Central | Dinh dưỡng (Phase 4.3) | Chưa tạo | Khóa chỉ đặt ở Edge Function |
| Expo (EAS), nếu build bản cài | Build app | Chưa dùng | Chưa cần ở Phase 0 |

## 5. Dự án Supabase (điền)

| Mục | Giá trị |
|---|---|
| Tên project v2 | `YoChef` |
| Project ref | `bdhphjwhagygbwtfhhxn` |
| URL | `https://bdhphjwhagygbwtfhhxn.supabase.co` |
| Vùng (region) | `ap-northeast-1` (Tokyo), PostgreSQL 17 |
| Gói dịch vụ (Free/Pro) | `<điền: Dashboard → Organization → Billing>` |
| Project cũ (chỉ đọc, tham chiếu) | `ihfuftmpsfgtwvmtfdja` (tên `cooking-app`, thuộc tổ chức khác với v2, không ghi, không xóa) |
| Quản trị Dashboard bởi | `<email>` |

Mật khẩu database: lưu ở `<trình quản lý mật khẩu>`. **Không ghi ở đây.**

## 6. Bí mật và nơi lưu (điền nơi lưu, không điền giá trị)

| Bí mật | Dùng ở | Được phép đặt ở | Nơi lưu thực tế |
|---|---|---|---|
| Publishable key | App, Admin (công khai, nhúng trong bundle) | `app/.env`, `admin/.env` | `app/.env` và `admin/.env` trên máy người bàn giao (không có trong git). Lấy lại: Dashboard → Project Settings → API Keys |
| Mật khẩu database | Chỉ người quản trị, khi cần | Trình quản lý mật khẩu | `<tên trình quản lý mật khẩu>` |
| Secret / service_role key | Chỉ Edge Function, không bao giờ ở client | Supabase secrets | Chưa tạo, chưa dùng |
| `YOUTUBE_API_KEY` | Edge Function | `supabase secrets set` | Chưa tạo (Phase 4.4) |
| USDA API key | Edge Function | `supabase secrets set` | Chưa tạo (Phase 4.3) |
| Access token Supabase CLI | Máy dev | `supabase login` (lưu cục bộ) | máy từng người |

Quy tắc: secret key, service_role và mật khẩu database **không** đi vào app, git hay chat. Mỗi người nhận tự tạo key của mình, không dùng chung bằng cách gửi file `.env`.

## 7. Cài đặt máy dev

Yêu cầu: Node.js >= 22, npm 11, Git. Không cần Docker.

```bash
git clone https://github.com/Teezy4869/YoChef.git YoChef
cd YoChef
npm run install:all
```

Tạo hai file môi trường từ mẫu (file thật đã bị git bỏ qua):

```bash
cp app/.env.example app/.env
cp admin/.env.example admin/.env
```

Điền vào cả hai file:

| Biến | Giá trị |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` / `VITE_SUPABASE_URL` | `https://bdhphjwhagygbwtfhhxn.supabase.co` (nếu dùng project mới: `https://<ref mới>.supabase.co`) |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` | `<sb_publishable_...>` (Dashboard → Project Settings → API Keys) |

Chỉ dùng **publishable key**. Chỉ biến có tiền tố `EXPO_PUBLIC_` hoặc `VITE_` được nhúng vào bundle.

## 8. Dựng database cho project mới

Chỉ làm khi bàn giao sang project Supabase **mới**. Nếu dùng đúng project v2 đang có, bỏ qua tới mục 9 (kiểm tra `migration list`).

```bash
npx supabase login
npx supabase link --project-ref <ref>
npx supabase migration list --linked      # project trống: chưa có dòng remote
npm run test:db                           # phải xanh trước khi push
npx supabase db push --linked             # áp 2 migration
```

Nạp 250 công thức và ảnh (zip nằm ngoài repo, kiểm tra sha256 tự động):

```bash
npm run seed:build -- --zip <đường dẫn>/recipes_001_250_release_candidate.zip
npx supabase db query --linked -f supabase/.seed-out/seed.sql
npx supabase storage cp -r supabase/.seed-out/recipe-images ss:/// --linked --content-type image/webp --experimental -j 4
```

Kết quả đúng: 250 công thức (236 `published`, 14 `staged`), 542 nguyên liệu, 2.942 dòng nguyên liệu, 1.166 bước, 242 ảnh. Có thể chạy lại seed an toàn, **nhưng không chạy lại sau khi editor đã sửa nội dung** (Phase 4.5), vì seed ghi đè về dữ liệu gốc.

Nếu đổi sang project khác: `scripts/live_smoke.mjs` ghi cứng số kỳ vọng. Với dữ liệu mới, cập nhật lại các số đó.

Super admin đầu tiên (Phase 4.1): người nhận tự chạy một lệnh SQL trong SQL Editor với email của mình. Email: `<email super_admin>`. Không đưa email này vào migration hay seed.

## 9. Kiểm tra mọi thứ đang chạy

Ba tầng kiểm thử (một bước chỉ xong khi tầng 3 xanh cho phần chạm database):

| Tầng | Lệnh | Cần |
|---|---|---|
| 1. Unit / UI | `npm run check` | Không |
| 2. Database cục bộ | `npm run test:db` | Zip dữ liệu (nếu thiếu, phần seed bị bỏ qua và báo rõ) |
| 3. Live trên Supabase | `npm run smoke:live` | `app/.env` có URL và publishable key |
| 3. Live, công thức (khách) | `npm run smoke:recipes` | `app/.env`; migration `20261113120000_recipe_search` đã lên v2 |
| 3. Live, người dùng đăng nhập | `npm run smoke:auth` | Như trên, thêm `.env.smoke` ở gốc repo với `SMOKE_EMAIL`, `SMOKE_PASSWORD` của hộp thư test |

Kết quả mong đợi hiện tại: `check` exit 0 (app 123/123); `test:db` 55/55 (có zip dữ liệu); `smoke:live` 19/19; `smoke:recipes` 26/26; `smoke:auth` 26/26. Log mẫu: `docs/evidence/phase-0/`, `phase-1/`, `phase-2/`.

Kiểm tra bổ sung:

```bash
npx supabase migration list --linked   # local và remote phải khớp
npx supabase db advisors --linked      # kỳ vọng: không có vấn đề
```

## 10. Chạy ứng dụng

```bash
npm --prefix app start          # Expo (quét QR bằng Expo Go, hoặc nhấn a / w)
npm --prefix admin run dev      # Admin tại http://localhost:5173
npm --prefix admin run build    # build admin
```

## 11. Quy trình làm việc

- Nhánh: `main` luôn xanh; làm trên `phase-N/<bước>`, merge fast-forward, một commit cho mỗi bước.
- **Schema chỉ đổi bằng migration:** `npx supabase migration new <tên>`; không sửa trên Dashboard.
- Mỗi migration tự `revoke` rồi `grant` cho `anon` và `authenticated`; RLS bật trên mọi bảng; hàm `SECURITY DEFINER` đặt `search_path = ''`; vai trò chỉ ở `user_roles`.
- "Không biết" là `NULL`, không phải `0`.
- Thứ tự mỗi bước: viết migration → thêm test vào `supabase/tests/` → `npm run test:db` xanh → chủ dự án duyệt `db push` → `smoke:live` → commit kèm log.
- Dependency được ghim chính xác (`save-exact`); chỉ nâng cấp có chủ đích, trong commit riêng.
- Đọc `AGENTS.md` trước khi sửa; nếu dùng coding agent, đưa file này cho agent.

## 12. Việc dang dở và quyết định cần người nhận chốt

| # | Việc | Khi nào | Người quyết |
|---|---|---|---|
| 1 | Bắt đầu Phase 1: đăng ký và đăng nhập **thật** trên Supabase (trigger tạo profile mới chỉ test trên PGlite) | Việc đầu tiên | `<...>` |
| 2 | Giữ hay xóa video ID YouTube sau 30 ngày (chính sách YouTube III.E.4) | Trước Phase 4.4 | `<...>` |
| 3 | Rà dữ liệu: #095 "Tỏi" xuất hiện 2 lần; tên sách trong header JSON khác bản provenance; 14 công thức `staged`; 8 ảnh cách ly chưa có ảnh thay | Phase 4.5 | `<...>` |
| 4 | Xác nhận tài khoản admin duy nhất trên project cũ có phải của chủ dự án; số phận project cũ | Trước khi bỏ project cũ | `<...>` |
| 5 | Xử lý `npm audit` mức moderate trong tooling (bản "fix" tự động hạ Expo về 52, **không** dùng) | Khi nâng SDK | `<...>` |

## 13. Giới hạn đã biết

- Admin mới là khung; app chưa có tính năng Phase 3–4.
- Email xác nhận dùng dịch vụ mặc định của Supabase (chỉ gửi tới thành viên team); cần SMTP riêng trước khi có người dùng thật.
- PGlite không chạy PostgREST, GoTrue hay Storage thật; tầng 3 bù phần này.
- Dữ liệu từ sách, mục đích giáo dục; cần giữ ghi công nguồn (`recipe_sources`).

## 14. Checklist bàn giao

- [ ] Người nhận clone được repo và `npm run install:all` chạy xong
- [ ] Người nhận có quyền ghi GitHub: `<ghi chú>`
- [ ] Người nhận có quyền vào Supabase project: `<ghi chú>`
- [ ] Người nhận tự tạo `app/.env`, `admin/.env` (không nhận file từ người khác)
- [ ] `npm run check`, `npm run test:db`, `npm run smoke:live` đều xanh trên máy người nhận
- [ ] Đã chuyển quyền sở hữu hoặc thêm người nhận vào: GitHub `<>`, Supabase `<>`, Google Cloud `<>`, USDA `<>`
- [ ] Đã đổi hoặc thu hồi mọi key người bàn giao từng dùng (nếu rời dự án). Cần xử lý: publishable key hiện tại (đổi ở Dashboard → Project Settings → API Keys); token Supabase CLI tạo ngày 2026-11-08 (tên bắt đầu `cli_THEGIOILAP@`, thu hồi ở Dashboard → Account → Access Tokens); thêm: `<nếu có>`
- [ ] Đã chốt người quyết cho các việc ở mục 12
- [ ] Ngày và chữ ký xác nhận: `<...>`
