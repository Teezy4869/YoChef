# Phase 4: admin và tích hợp

**Ngày:** 2026-11-15 · **Project v2:** `bdhphjwhagygbwtfhhxn` · **Kết luận:** 5 migration của Phase 4 đã lên v2 và 3 Edge Function đã deploy. Schema v2 giống hệt schema dựng từ migration. `smoke:admin` **68/68** và `smoke:user` **113/113 ALL PASS** với 5 tài khoản test thật (A, B, moderator M, editor E, super admin S). Ba smoke cũ vẫn xanh. **Còn thiếu cho DoD:** chủ dự án kiểm admin web trên trình duyệt và app trên máy thật (§5), và chạy lịch làm mới video (§6 mục 1).

Kế hoạch đã duyệt: `~/.claude/plans/greedy-jumping-lark.md` (E1–E11). Nguồn yêu cầu: `docs/database/SCHEMA_V2.md` §5.5–5.7, §6 và gói `YoChef_born_again/20_phase_specs/phase-4/`.

## 1. Các bước

Mỗi bước một nhánh `phase-4/4.N-…`, nối tiếp nhau, merge fast-forward vào `main`. Thứ tự làm theo quyết định E9: 4.1 → 4.2 → 4.5 → 4.3 → 4.4.

| Bước | Commit | Nội dung | Trên v2 |
|---|---|---|---|
| 4.1 RBAC, nhật ký, đăng nhập admin | `406e8ea`, `0d4958e`, `7dc4387` | `admin_audit_logs`, `manage_user_role`, giữ super admin cuối cùng; admin web: đăng nhập theo vai trò, Nhân sự, Nhật ký | `20261114153457` |
| 4.2 Báo cáo vi phạm | `cf29112` | `content_reports`, `update_report_workflow`; nút Báo cáo trên app; trang Kiểm duyệt trên admin web | `20261114155100` |
| 4.5 CMS công thức | `0fca2c3` | `save_recipe`, `transition_recipe_status`, `delete_recipe`, policy ảnh bìa; danh sách, tạo, sửa, chuyển trạng thái | `20261114160903` |
| 4.3 Dinh dưỡng | `061263a` | 3 bảng dinh dưỡng, engine SQL 2.0.0, Edge Function `nutrition-search` (chỉ USDA); trang Dinh dưỡng; mục dinh dưỡng trên app | `20261114162121` |
| 4.4 Video YouTube | `9d48d4a` | `recipe_videos`, biên nhận xác minh, làm mới và xóa sau 30 ngày; `youtube-search`, `youtube-refresh`; mục video trên admin, nút xem video trên app | `20261114163608` |
| 4.6 Gate | `ded6e3b`, (commit này) | Sửa 3 lỗi lộ ra khi chạy trên v2 (§4.2), chạy lại mọi tầng kiểm thử, báo cáo này, HANDOVER | Deploy lại `nutrition-search` |

**Khác quy trình Phase 3:** theo yêu cầu của chủ dự án ("hoàn thành hết phase rồi push một thể"), 4.2–4.4 được làm xong ở local trước, rồi mới push. Bốn migration vẫn được push **từng cái một**, mỗi cái từ đúng nhánh của nó và sau một lần dry-run chỉ liệt kê đúng file đó. Vì vậy các bước 4.2–4.4 không có commit bằng chứng riêng; bằng chứng trên v2 của cả bốn nằm trong commit gate.

## 2. Thay đổi

### Database (chi tiết ở `SCHEMA_V2.md` §3, §4.2, §5.4–5.7, §6)
| Migration | Bảng / đối tượng | Điểm chính |
|---|---|---|
| `20261114153457_phase4_rbac_audit` | `admin_audit_logs`, `private.audit()`, `manage_user_role`, `list_staff`, `find_user_by_email`, `list_admin_audit_logs`, trigger `keep_last_super_admin` | Nhật ký chỉ được thêm, client không đọc trực tiếp. Gán và thu hồi vai trò chỉ qua RPC, bắt buộc có lý do, không tự thu hồi `super_admin` của mình. Không xóa được super admin cuối cùng, kể cả khi xóa tài khoản |
| `20261114155100_phase4_content_reports` | `content_reports`, `update_report_workflow` | Người dùng chỉ thêm báo cáo cho mục của người khác mà mình đang thấy, mỗi mục một lần, và không đọc lại được. Lý do `other` bắt buộc có mô tả. Moderator đọc mọi báo cáo; trạng thái chỉ đổi qua RPC |
| `20261114160903_phase4_recipe_cms` | Policy "Editors read every recipe" (4 bảng), `save_recipe`, `transition_recipe_status`, `delete_recipe`, `create_ingredient`, policy Storage `recipe-images` | Lưu công thức, nguyên liệu, bước và nhật ký trong một giao dịch; lỗi trả về theo trường. Sơ đồ trạng thái: `draft` không nhảy thẳng sang `published`. Xóa hẳn chỉ super admin, phải gõ đúng slug, bị từ chối nếu đã có tương tác. Ảnh bìa mới có tên `<slug>/cover-<thời điểm>`, không ghi đè được |
| `20261114162121_phase4_nutrition` | `ingredient_nutrition`, `nutrition_unit_conversions`, `recipe_nutrition`, `private.compute_recipe_nutrition`, 6 RPC, trigger `stale_on_change` | Chỉ dùng dữ liệu đã xác minh. Một nguyên liệu bắt buộc không quy đổi được thì mọi tổng là NULL, kèm lý do. Mỗi phần tính từ tổng chưa làm tròn. Mọi thay đổi đầu vào đánh dấu kết quả `STALE`. Public chỉ đọc kết quả `VERIFIED` của công thức `published` |
| `20261114163608_phase4_recipe_videos` | `recipe_videos`, `private.video_verifications`, `assign_recipe_video`, `remove_recipe_video`, 4 hàm chỉ service role | Public chỉ thấy video chính, đã xác minh trong 30 ngày, của công thức `published`; điều kiện ngày nằm trong RLS. Gắn video cần biên nhận xác minh của chính editor đó, trong 15 phút, dùng một lần. Quá 30 ngày không xác minh lại được thì xóa hẳn dòng (E10) |

Sau Phase 4, v2 có 15 migration, 25 bảng, 3 bucket, 62 policy, 25 trigger, 44 hàm (`docs/evidence/phase-4/db_verify.log`).

### Edge Functions (`supabase/functions`)
| Function | JWT | Việc làm |
|---|---|---|
| `nutrition-search` | Bắt buộc, chỉ editor và super admin | `search_usda` (tối đa 10 kết quả, 8 giây), `get_usda_food`. Khóa USDA gửi trong header, không có khóa dự phòng |
| `youtube-search` | Bắt buộc, chỉ editor và super admin | `search` (ứng viên, ưu tiên Việt Nam) và `verify` (`videos.list`, rồi dùng service role ghi biên nhận) |
| `youtube-refresh` | Không kiểm JWT; xác thực bằng `x-refresh-secret` | Xác minh lại tối đa 50 video mỗi lần (1 đơn vị hạn mức), rồi xóa dòng quá hạn |

Logic nằm ở `contract.ts` thuần (không dùng API Deno) và được test bằng Vitest; `index.ts` chỉ là lớp mỏng. Deploy bằng `--use-api`, không cần Docker.

### Admin web (`admin/src`)
| Khu vực | Thay đổi |
|---|---|
| `lib/env.ts`, `lib/supabase.ts`, `auth/AdminAuth.tsx` | Env fail-closed (từ chối project cũ và secret key). Vai trò đọc từ `user_roles`; đọc lỗi thì coi như không có vai trò |
| `App.tsx`, `layout/AdminLayout.tsx` | Bảng route kèm vai trò, guard, sidebar theo vai trò. Guard chỉ để hiển thị; quyền do database quyết |
| `pages/` | `LoginPage`, `DashboardPage`, `StaffPage`, `AuditLogPage`, `ModerationPage`, `RecipeListPage`, `RecipeEditPage`, `RecipeVideoSection`, `NutritionPage`, các trang trạng thái |
| `lib/` | `moderation.ts`, `recipes.ts`, `nutrition.ts` |

Không thêm dependency nào (E2: không dùng TanStack Query).

### App (`app/src`)
| Khu vực | Thay đổi |
|---|---|
| `features/community/` | `reportsApi`, `ReportButton` trên bình luận và ảnh của người khác |
| `features/nutrition/NutritionSection.tsx` | "Dinh dưỡng mỗi phần"; giá trị không rõ hiện `—`, không bao giờ 0; không có kết quả đã xác minh thì không hiện mục |
| `features/videos/VideoButton.tsx` | Nút "Xem video hướng dẫn", mở YouTube bằng `Linking`; app kiểm lại hạn 30 ngày |
| `features/recipes/recipeApi.ts` | Trang chi tiết lọc `status = 'published'` (editor đăng nhập trên app không thấy bản nháp) |

### Công cụ và test
| File | Thay đổi |
|---|---|
| `scripts/live_admin_smoke.mjs`, `npm run smoke:admin` | 68 kiểm tra với A, M, E, S; tự tạo và xóa công thức `zz-smoke-cms-…`, tự dọn ảnh bìa sót lại |
| `scripts/live_user_smoke.mjs` | Thêm 13 kiểm tra báo cáo vi phạm |
| `supabase/tests/phase4.test.mjs` | 34 test PGlite (7 + 5 + 8 + 7 + 7) |
| `supabase/tests/harness.mjs`, `phase0.test.mjs` | Stub `auth.users` có `banned_until`, `deleted_at`; danh sách bảng người dùng ghi được thêm `content_reports` |
| `admin/src/test/` | `App.test.tsx`, `nutritionContract.test.ts`, `youtubeContract.test.ts`, `fakeClient.ts`; Vitest từ 1 lên **38** test |
| `app/__tests__/` | Thêm `reports`, `nutrition`, `videos`; Jest từ 169 lên **177** test |

## 3. Kết quả đã chạy (Gate, 2026-11-15)

| Tầng | Lệnh | Kết quả | Log (`docs/evidence/phase-4/`) |
|---|---|---|---|
| 1 | `npm run check` | exit 0; app **177/177**, admin **38/38**, typecheck và lint sạch | `check_gate.log` |
| 2 | `npm run test:db` | **132/132** (có zip dữ liệu) | `test_db_gate.log` |
| 3 | `npm run smoke:admin` | **68/68 ALL PASS**: vai trò và nhật ký 28, CMS 18, video 8, RPC dinh dưỡng 7, `nutrition-search` 5, `youtube-refresh` 2 | `live_admin_smoke.log` |
| 3 | `npm run smoke:user` | **113/113 ALL PASS**: 100 của Phase 3, báo cáo vi phạm 13 | `live_user_smoke.log` |
| 3 | `smoke:live` / `smoke:recipes` / `smoke:auth` | **19/19**, **26/26**, **26/26** ALL PASS | `live_smoke.log`, `live_recipes_smoke.log`, `live_auth_smoke.log` |
| Schema | `npm run db:list` / `npm run db:verify` | Local và remote khớp 15/15; **SCHEMA MATCHES** | `v2_state.log`, `db_verify.log` |
| Advisors | `npm run db:advisors` | 28 cảnh báo, đều đã chấp nhận (§4.3); không có mức lỗi, không hàm nào `anon` gọi được | `gate_advisors.json` |
| Edge Functions | `supabase functions list` | Cả 3 `ACTIVE`; khóa USDA và YouTube của chủ dự án hoạt động (tìm USDA trả 10 kết quả, YouTube trả 8 ứng viên và xác minh được 1 video) | `v2_state.log` |

Ba smoke cũ chạy với đúng script và file env như lệnh `npm`, nhưng ghi log vào `docs/evidence/phase-4/` để không ghi đè bằng chứng của Phase 0–2.

## 4. Quyết định và chỗ lệch kế hoạch

### 4.1 Lệch spec có chủ đích (đã ghi trong SCHEMA_V2)
| # | Quyết định | Lý do |
|---|---|---|
| 1 | Mô tả, thời gian và ảnh bìa **không bắt buộc** khi công bố | "Không biết" là NULL; 8 ảnh đang bị cách ly, nên bắt buộc ảnh bìa sẽ chặn công bố các món đó |
| 2 | Tổng dinh dưỡng lưu dạng `jsonb` thay vì 16 cột | Một nguồn cho danh sách chất; thêm chất không cần migration |
| 3 | App mở video bằng link `https://www.youtube.com/watch?v=…`, không thử scheme `vnd.youtube` | Hệ điều hành tự chuyển sang app YouTube nếu có; không cần khai báo scheme trong `app.json` |
| 4 | Không có trigger chặn đổi `status` công thức trực tiếp | Client vốn không có quyền ghi bảng `recipes`; chỉ RPC DEFINER ghi được |
| 5 | Biên nhận xác minh video nằm ở schema `private`, do service role ghi | Client không thể tự tạo biên nhận để gắn video chưa xác minh |

### 4.2 Lỗi tìm thấy khi chạy trên v2, đã sửa (`ded6e3b`)
| Lỗi | Nguyên nhân | Cách sửa |
|---|---|---|
| `nutrition-search` trả `502 provider_error` thất thường | USDA trả mã lỗi cho dạng GET của `foods/search` khoảng một nửa số lần, với mọi từ khóa (đo bằng script thăm dò: 7/8, 4/8, 3/8 đạt; cùng URL với khóa `DEMO_KEY` công khai trả HTTP 400 ở 5/7 lần) | Gửi POST với JSON, dạng mà hướng dẫn API của USDA nêu cho bộ lọc mảng. Sau khi deploy lại: 8/8 và 8/8 đạt |
| Smoke: "E deletes the unused cover" trả 400 | Script gửi `Content-Type: application/json` với body rỗng khi DELETE; Storage từ chối | Chỉ gửi header khi có body. Không phải lỗi của database: chạy lại thì editor xóa được ảnh bìa chưa dùng |
| Smoke: "S deletes the archived recipe" báo hỏng | `delete_recipe` trả `void` nên PostgREST trả 204; script mong 200 | Sửa kỳ vọng thành 204. Nhật ký vốn đã có `recipe.delete` |

Chưa tìm được tài liệu chính thức nào của USDA giải thích lỗi GET; kết luận trên dựa vào số đo. `get_usda_food` vẫn dùng GET (URL không có bộ lọc) và đạt ở cả 3 lần được gọi.

### 4.3 Cảnh báo advisors đã chấp nhận
| Cảnh báo | Số | Lý do chấp nhận |
|---|---|---|
| Hàm DEFINER mà `authenticated` gọi được | 19 (6 cũ, 13 mới) | Mọi thao tác ghi của staff phải qua RPC DEFINER vì client không có quyền ghi các bảng đó (E4). Mỗi hàm báo `42501` trừ khi `private.is_*()` tương ứng đúng; `anon` không gọi được hàm nào |
| `multiple_permissive_policies` (hiệu năng) | 8 (2 cũ, 6 mới: `recipes`, `recipe_ingredients`, `recipe_steps`, `recipe_diets`, `recipe_nutrition`, `recipe_videos`) | Policy công khai phải tách khỏi policy của editor vì `anon` không có quyền trên schema `private`. PostgreSQL gộp bằng OR |
| `auth_leaked_password_protection` tắt | 1 | Cấu hình Auth của project; chủ dự án quyết |

### 4.4 Phần chưa làm, có chủ đích
- Admin web chỉ chạy local (E6); chưa có nơi host.
- Open Food Facts để sau (E11); `nutrition-search` chỉ có USDA.
- Không nhúng trình phát video trong app (E7).
- Trang xem trước công thức trên admin: trang sửa hiện đủ nội dung, không có màn xem trước riêng.
- Tác vụ dọn file mồ côi mà báo cáo Phase 3 hẹn sang Phase 4 **chưa làm**.

## 5. Kiểm trên trình duyệt và máy thật (chủ dự án)

Chuẩn bị: `admin/.env` có `VITE_SUPABASE_URL` và `VITE_SUPABASE_PUBLISHABLE_KEY`; chạy `npm --prefix admin run dev`, mở `http://localhost:5173`. Phase 4 không thêm dependency native, nên app không cần build lại.

1. **Đăng nhập theo vai trò:** tài khoản không có vai trò thấy trang "Không có quyền". Editor chỉ thấy Tổng quan, Công thức, Dinh dưỡng. Moderator chỉ thấy Tổng quan, Kiểm duyệt. Super admin thấy thêm Nhân sự, Nhật ký. Gõ thẳng URL của trang không có quyền thì bị chặn.
2. **Nhân sự:** tìm một email, gán `editor` kèm lý do, thấy dòng mới; thu hồi. Thử thu hồi `super_admin` của chính mình: bị từ chối. Trang Nhật ký có cả hai thao tác.
3. **Kiểm duyệt:** trên app, tài khoản B báo cáo một bình luận của A. Trên admin web (moderator): thấy báo cáo, mở chi tiết, đổi trạng thái kèm ghi chú. Duyệt và từ chối một bình luận và một ảnh; ảnh phải hiện được.
4. **CMS:** tạo một công thức nháp có 2 nguyên liệu và 2 bước, lưu. Thử công bố thẳng từ nháp: bị từ chối. Chuyển Chờ công bố → Công bố: món xuất hiện trong app. Tải ảnh bìa. Lưu trữ: món biến mất khỏi app. Xóa hẳn bằng super admin, phải gõ đúng slug.
5. **Dinh dưỡng:** chọn một nguyên liệu, tìm USDA, lưu và xác minh. Thêm quy đổi đơn vị nếu cần. Với một công thức chỉ dùng nguyên liệu đã xác minh: Tính, rồi "Xác minh kết quả". Trên app, trang công thức đó có "Dinh dưỡng mỗi phần"; công thức khác không có mục này.
6. **Video:** trong trang sửa một công thức đã công bố, tìm video, Xác minh, "Gắn làm video chính". Trên app có nút "Xem video hướng dẫn", bấm thì mở YouTube. Gỡ video: nút biến mất.

Phase 2 (2.6–2.12) và Phase 3 (gồm EXIF ảnh) vẫn chờ kiểm trên máy thật, nên chưa có tag `phase-2-complete`, `phase-3-complete`, `phase-4-complete`.

## 6. Điểm chưa hợp lý, cần bạn biết

1. **Lịch làm mới video chưa chạy.** `supabase/scripts/youtube_schedule.sql` phải do chủ dự án chạy một lần trong SQL Editor, với đúng chuỗi `YOUTUBE_REFRESH_SECRET` (HANDOVER §8). Smoke chỉ chứng minh `youtube-refresh` từ chối khi thiếu hoặc sai secret; đường chạy đúng (làm mới, xóa quá hạn) mới chỉ được test trên PGlite. Khi chưa có lịch, video quá 30 ngày vẫn tự ẩn với người dùng nhưng không bị xóa.
2. **Chưa công thức nào có dinh dưỡng.** Chưa nguyên liệu nào có số liệu USDA đã xác minh. Theo hợp đồng, nguyên liệu bắt buộc ghi "vừa ăn" (như muối) chặn mọi tổng, nên phần lớn công thức sẽ ở trạng thái "Thiếu dữ liệu" cho tới khi editor sửa số lượng hoặc đánh dấu tùy chọn. Trên v2, smoke chứng minh "đầu vào chưa xác minh thì không ra số"; kết quả đã xác minh mới chỉ được test trên PGlite.
3. **Admin web và các tính năng Phase 4 trên app chưa được mở trên trình duyệt hay máy thật.** Test giao diện dùng client giả.
4. **Mỗi lần chạy `smoke:admin` tốn khoảng 101 đơn vị hạn mức YouTube** (một lần tìm, một lần xác minh; hạn mức mặc định 10.000 mỗi ngày) và để lại dòng trong `admin_audit_logs` (bảng chỉ được thêm). E giữ vai trò `editor` sau lần chạy đầu.
5. **File mồ côi:** ảnh nấu ăn của tài khoản bị xóa và ảnh bìa cũ của công thức vẫn ở lại bucket. `delete_recipe` từ chối công thức đã có tương tác, nên xóa công thức không làm mồ côi ảnh nấu ăn.
6. **Dữ liệu chưa được rà:** #095 "Tỏi" trùng, 14 công thức `staged`, 8 ảnh cách ly. CMS đã có để sửa, nhưng đây là việc của editor.
7. **Seed không được chạy lại** sau khi editor đã sửa nội dung: seed ghi đè về dữ liệu gốc.
8. **`multiple_permissive_policies` trên `recipes`:** mỗi truy vấn của người đã đăng nhập chạy cả policy công khai lẫn policy editor. Với 250 công thức thì không đáng kể; cần xem lại nếu dữ liệu lớn.
9. **CLI Supabase đang là 2.122.0;** bản 3.1.0 đã có. Chưa nâng cấp, vì nâng cấp là việc có chủ đích.
