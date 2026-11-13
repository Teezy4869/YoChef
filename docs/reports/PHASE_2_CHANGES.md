# Phase 2: tiến độ, thay đổi, điểm chưa hợp lý

**Ngày:** 2026-11-13, cập nhật 2026-11-14 · **Project v2:** `bdhphjwhagygbwtfhhxn` · **Kết luận:** migration `20261113120000` đã lên v2, `smoke:recipes` 26/26 ALL PASS, Phase 1 đạt DoD. Chủ dự án đã chạy 2.1–2.5 trên máy thật và xác nhận đúng như đề ra. Bước 2.6–2.8 sửa hai điểm lệch spec gốc (làm tròn khẩu phần; thông báo và phiên nấu), quyết định ở §6; 2.10–2.12 làm nốt phần còn mở (test chập chờn, giữ màn hình sáng, bỏ đánh dấu bước). **Còn thiếu cho DoD:** kiểm 2.6–2.12 trên máy thật (§4).

Spec gốc ban đầu không có trên máy làm việc; sau đó đã đối chiếu với `YoChef_born_again/20_phase_specs/phase-2/` (16, 19, 20, 21).

## 1. Các bước

Nhánh nối tiếp nhau, merge fast-forward vào `main`. 2.1–2.5 đã ở `main` từ trước Gate Phase 1; 2.6–2.13 nối tiếp từ `b69ffa3`.

| Bước | Nhánh | Commit | Nội dung |
|---|---|---|---|
| 2.1 | `phase-2/2.1-recipe-data` | `7dbc4cf` | Migration `20261113120000_recipe_search`: `public.fold_vi` và RPC `public.search_recipes`. 14 test PGlite. |
| 2.2 | `phase-2/2.2-recipe-list` | `ebce33e` | Tab Khám phá thành danh sách công thức: tìm kiếm không cần dấu, chip danh mục / độ khó / dưới 30, 60 phút, phân trang, trạng thái rỗng và lỗi. |
| 2.3 | `phase-2/2.3-recipe-detail` | `af97b12` | Chi tiết công thức, chỉnh khẩu phần 1 đến 50, nguyên liệu tự tính lại, ghi công nguồn sách. |
| 2.4 | `phase-2/2.4-cooking-mode` | `1469e76` | Chế độ nấu từng bước, hẹn giờ mỗi bước (chạy, dừng, tiếp tục, đặt lại), báo khi hết giờ. |
| 2.5 | `phase-2/2.5-live-recipe-check` | `d19443f` | `scripts/live_recipes_smoke.mjs` + `npm run smoke:recipes`, log tầng 1 và 2, báo cáo này. |
| 2.6 | `phase-2/2.6-quantity-format` | `8bc0054` | Làm tròn số lượng theo spec 16 cộng phân số bếp (quyết định A2, §6.1). |
| 2.7 | `phase-2/2.7-timer-notifications` | `ded31d3` | Thông báo cục bộ khi hết giờ, kể cả khi tắt màn hình (spec 20, §6.2). |
| 2.8 | `phase-2/2.8-cooking-session` | `b51ed27` | Lưu và tiếp tục phiên nấu; tiến độ tính theo bước đã xong (spec 21, §6.3). |
| 2.9 | `phase-2/2.9-docs` | `c0b18bf` | Log tầng 1, cập nhật báo cáo này và HANDOVER. |
| 2.10 | `phase-2/2.10-test-timeout` | `c204ec2` | Test UI hết chập chờn khi cache Jest lạnh (mức chờ `findBy…` 5 s). |
| 2.11 | `phase-2/2.11-keep-awake` | `3ef4705`, `ea866ac` | Thêm dependency `expo-keep-awake` 58.0.4 (commit riêng), giữ màn hình sáng khi đang nấu. |
| 2.12 | `phase-2/2.12-uncheck-step` | `9522435` | Bỏ đánh dấu một bước đã xong (spec 21 §2). |
| 2.13 | `phase-2/2.13-docs` | (commit này) | Log tầng 1 và bundle Android, cập nhật báo cáo. |

## 2. Thay đổi

### Database
| File | Thay đổi |
|---|---|
| `supabase/migrations/20261113120000_recipe_search.sql` (mới) | `fold_vi(text)`: IMMUTABLE, chữ thường, bỏ dấu (`normalize` NFD), `đ` thành `d`. `search_recipes(q, category_slug, difficulty, max_total_minutes, limit, offset)`: `SECURITY INVOKER` nên RLS áp dụng (khách chỉ thấy `published`); mọi từ khóa phải khớp theo tên món hoặc tên/alias nguyên liệu (AND); khớp tên xếp trước; `limit` kẹp 1 đến 100; ký tự `%`, `_` là chữ thường. Không thêm bảng hay cột. |
| `supabase/tests/phase2.test.mjs` (mới) | 14 test: bỏ dấu, alias, thứ hạng, AND, bản `staged` ẩn, wildcard, lọc, thời gian `NULL`, phân trang, quyền anon và authenticated. |
| `docs/database/SCHEMA_V2.md` §3.4 | Ghi lại việc không dùng cột `search_text` và `unaccent`. |

### App (`app/src`)
| Khu vực | Thay đổi |
|---|---|
| `features/recipes/` | `recipeApi` (search, danh mục, chi tiết, `parseRecipeDetail`), `useRecipeSearch`, `useRecipeDetail`, `servings` (tính và định dạng số lượng), `timer` + `useStepTimers`, `format`, `RecipeCard`, `IngredientRows`, `types`. |
| `screens/` | `HomeScreen` (danh sách + tìm kiếm), `RecipeDetailScreen`, `CookingModeScreen`. |
| `components/Chip.tsx`, `lib/useDebouncedValue.ts` | Mới. |
| `app/navigation/` | Thêm route `RecipeDetail { slug }` và `CookingMode { slug, servings? }`. |
| `features/recipes/timerAlarms.ts` (2.7), `cookingSession.ts` (2.8) | Mới: lên lịch / hủy thông báo hẹn giờ; đọc, kiểm và lưu phiên nấu. |
| `app.json` (2.7) | Thêm plugin `expo-notifications` (kênh và quyền `POST_NOTIFICATIONS` Android 13+). |

Dependency: chỉ thêm `expo-keep-awake` **58.0.4** (2.11, ghim chính xác, phiên bản do `expo install` chọn cho SDK 58; trước đó Expo đã kèm sẵn bản 58.0.3 bên trong). `expo-notifications` và AsyncStorage đã có từ Phase 0.

### Công cụ và test
| File | Thay đổi |
|---|---|
| `scripts/live_recipes_smoke.mjs`, `package.json` | `npm run smoke:recipes`: 26 kiểm tra chỉ đọc, vai trò khách, trên v2. Số liệu so sánh tương đối (ví dụ "thit" và "thịt" phải ra cùng kết quả), chỉ ghim con số 236 đã có từ Phase 0. |
| `app/__tests__/` | Thêm `recipes`, `detail`, `cooking` và các helper (`fakeSupabase` có dữ liệu catalog, `recipeFixtures`). Từ 49 lên 95 test. |
| `docs/evidence/phase-2/` | `check.log` (exit 0, 95/95), `test_db.log` (48/48). `live_recipes_smoke.log` chưa có. |

## 3. Kết quả đã chạy

| Tầng | Lệnh | Kết quả |
|---|---|---|
| 1 | `npm run check` | exit 0; app 95/95, admin 1/1, typecheck và lint sạch |
| 1 | `npm run check` sau 2.6–2.8 (2026-11-14) | exit 0; app **122/122**, admin 1/1 (`docs/evidence/phase-2/check_2.6-2.8.log`) |
| 1 | Jest với cache đã xóa, sau 2.10 | 122/122 trong 39 s (trước 2.10: 92/95 ở lần chạy lạnh) |
| 1 | `npm run check` sau 2.10–2.12 | exit 0; app **123/123**, admin 1/1 (`docs/evidence/phase-2/check_2.10-2.12.log`) |
| 2 | `npm run test:db` | 48/48 (34 cũ + 14 mới; phần seed bỏ qua vì không có zip dữ liệu). 2.6–2.12 không chạm database |
| Bundle | `expo export --platform android` | Thành công; lần chạy lại sau 2.12: 1.027 module, Hermes 2,9 MB (`docs/evidence/phase-2/bundle_android.log`) |
| 3 | `npm run smoke:recipes` | **26/26 ALL PASS** (`docs/evidence/phase-2/live_recipes_smoke.log`) |

Một lỗi thật được test bắt khi làm: nhân chia số thực làm `99.9` thành `99.90000000000002` ở khẩu phần mặc định; đã sửa (`scaleQuantity` trả đúng giá trị gốc khi khẩu phần không đổi).

## 4. Việc cần làm để đạt DoD

Mục 1–5 cũ (CLI, `db push`, smoke, chạy 2.1–2.5 trên máy thật, merge) đã xong. Còn lại, cho 2.6–2.12 (không chạm database nên không cần migration hay smoke trên v2). Vì có dependency native mới (`expo-keep-awake`), nếu dùng development build thì phải build lại; Expo Go có sẵn module này.

1. Khẩu phần: mở một công thức 4 người, đổi sang 3 và 6, xem số lượng có dạng "2⅓", "13 g", "0,27".
2. Thông báo: bật một hẹn giờ ngắn, chấp nhận quyền thông báo, tắt màn hình. Phải có thông báo "Hết giờ bước N". Lặp lại khi từ chối quyền: hẹn giờ vẫn chạy, có dòng "Thông báo đang tắt".
3. Phiên nấu: sang bước 2, bật hẹn giờ, thoát app hẳn rồi mở lại công thức. Phải hỏi "Tiếp tục nấu", hẹn giờ còn đúng số giây. Quay lại bước 1: có "Bước này đã xong" và nút "Đánh dấu chưa xong".
4. Màn hình sáng: để yên ở màn Chế độ nấu lâu hơn thời gian tự tắt màn hình của máy; màn hình không được tắt. Ra trang công thức thì máy tắt màn hình như thường.
5. Nếu dùng Expo Go: thư viện tự cảnh báo "not fully supported in Expo Go", nhưng chỉ thông báo push bị bỏ; thông báo cục bộ vẫn được hỗ trợ. Nếu thông báo không hiện, cần development build để kết luận.

## 5. Điểm chưa hợp lý, cần bạn biết

1. ~~Quy tắc hiển thị số lượng tự chọn, lệch spec 16.~~ **Đã sửa ở 2.6**, xem §6.1.
2. **Tìm kiếm lệch kế hoạch:** SCHEMA_V2 dự kiến cột `search_text` + trigger; mình dùng hàm gấp chữ tại chỗ vì không cần extension và với 250 công thức là đủ. Mô tả công thức không được tìm, chỉ tên món và nguyên liệu.
3. **Bộ lọc thời gian loại công thức không rõ thời gian** (prep hoặc cook là `NULL`), vì "không biết" khác 0. Chưa biết có bao nhiêu công thức như vậy trên v2; nếu nhiều thì bộ lọc sẽ ẩn nhiều món. `smoke:recipes` chưa đếm số này.
4. **Chưa có bộ lọc chế độ ăn (Diet):** bảng `diets` được seed rỗng theo quy ước dữ liệu, nên không có gì để lọc.
5. ~~Hẹn giờ chỉ sống khi còn ở màn Chế độ nấu, không có thông báo nền.~~ **Đã sửa ở 2.7 và 2.8**, xem §6.2 và §6.3. Màn hình được giữ sáng khi nấu từ 2.11.
6. **Ảnh bìa tải ở kích thước đầy đủ** (242 ảnh webp, tổng khoảng 52 MB, trung bình hơn 200 KB) dù thẻ chỉ hiển thị 96 px. Trên mạng yếu danh sách sẽ chậm. Cách xử lý (ảnh thu nhỏ, hoặc Supabase image transformation) cần quyết định riêng.
7. ~~Phase 2 xây trên Phase 1 chưa live check.~~ Phase 1 đạt DoD, `smoke:auth` 26/26.
8. ~~Chưa thấy app chạy thật.~~ 2.1–2.5 đã được chủ dự án chạy trên máy thật; 2.6–2.8 chưa (§4).
9. **Chưa có:** đánh dấu yêu thích, danh sách mua sắm, đánh giá, bình luận (Phase 3); video, dinh dưỡng (Phase 4).

## 6. Quyết định 2026-11-14: sửa hai điểm lệch spec

### 6.1 Số lượng nguyên liệu (bước 2.6, quyết định A2)

Chủ dự án chọn cơ chế A2: theo mức làm tròn của spec 16 §3, nhưng hiện phân số bếp (¼ ⅓ ½ ⅔ ¾) khi số rất gần một phân số. Quy tắc biên do agent chốt, dựa trên dữ liệu thật (1.918 dòng có số lượng; phần lẻ trong sách chỉ gồm ,5 ,25 ,75 ,33 ,2 ,1; số lớn hơn hoặc bằng 10 không có phần lẻ; khẩu phần gốc từ 2 đến 16).

| # | Trường hợp | Quy tắc | Ví dụ |
|---|---|---|---|
| R1 | Khẩu phần đang chọn bằng khẩu phần gốc, hoặc công thức không có khẩu phần gốc | Giữ đúng số trong sách, **không làm tròn lại**; chỉ đổi sang phân số khi lệch tối đa 0,005 | 12,5 g giữ 12,5 g; 0,33 bát thành ⅓ bát; 0,2 lít giữ 0,2 |
| R2 | Đã đổi khẩu phần, từ 10 trở lên | Làm tròn số nguyên (spec 16) | 12,5 → 13; 12,34 → 12 |
| R3 | Đã đổi khẩu phần, từ 1 đến dưới 10 | Phân số bếp nếu lệch tối đa 0,02, nếu không thì 1 chữ số thập phân | 2,32 → 2⅓; 2,3 → 2,3; 1,125 → 1,1 |
| R4 | Đã đổi khẩu phần, dưới 1 | Phân số bếp nếu lệch tối đa 0,01, nếu không thì 2 chữ số thập phân | 0,66 → ⅔; 0,27 → 0,27 |
| R5 | Số dương rất nhỏ | **Không bao giờ hiện 0** (0 bị đọc thành "không cần", trái C5). Dưới 0,005 hiện "< 0,01" | 0,1 lít của công thức 16 người chia cho 1 người = 0,00625 → "0,01" (ca nhỏ nhất trong dữ liệu) |
| R6 | Làm tròn chạm sang khoảng kế tiếp | Hiện gọn, không có ",0" | 9,97 → 10; 0,996 → 1 |
| R7 | Định dạng | Dấu phẩy thập phân; bỏ số 0 thừa; `≈` cho số biên tập ước tính; "vừa ăn" cho `to_taste` (giữ như cũ) | 2,5 → 2½; ≈ 600 ml |

Lý do dung sai nhỏ hơn ở dưới 1 (0,01 so với 0,02): cùng một sai số tuyệt đối thì với số nhỏ là sai số tương đối lớn (0,02 trên 0,25 là 8%). Tính toán luôn đi từ số gốc trong database (spec 16 §2), không làm tròn chồng.

### 6.2 Thông báo hẹn giờ (bước 2.7, spec 20)

| Quy tắc | Chi tiết |
|---|---|
| Thời điểm báo | Thông báo cục bộ lên lịch đúng mốc kết thúc (`endsAt`), id cố định `cook:<slug>:<bước>`, nên lên lịch lại là ghi đè, hủy không cần lưu id |
| Xin quyền | Đúng lúc bấm "Bắt đầu hẹn giờ" lần đầu; không bao giờ khi mở app. Chỉ hỏi **một lần**: sau khi từ chối không hỏi lại |
| Bị từ chối | Hẹn giờ vẫn chạy trong app (rung và banner), hiện dòng "Thông báo đang tắt: hẹn giờ chỉ báo khi YoChef đang mở" |
| Tạm dừng, đặt lại, tắt báo | Hủy thông báo của bước đó |
| Hoàn thành hoặc "Nấu lại từ đầu" | Hủy thông báo của mọi bước |
| Rời màn Chế độ nấu hoặc đóng app | **Giữ** thông báo (hẹn giờ được lưu ở 6.3) |
| App đang mở | Theo spec 20 §3: vẫn hiện và kêu. Nếu đang ở màn Chế độ nấu đúng lúc hết giờ thì vừa rung trong app vừa có thông báo hệ thống; chấp nhận vì người dùng có thể đang ở màn khác trong app |
| Thứ tự | Mọi lệnh lên lịch / hủy đi qua một hàng đợi, nên bấm "Tạm dừng" trong lúc hộp thoại xin quyền còn mở vẫn kết thúc ở trạng thái đã hủy |

### 6.3 Phiên nấu (bước 2.8, spec 21)

| Quy tắc | Chi tiết |
|---|---|
| Lưu ở đâu | AsyncStorage trên máy, mỗi công thức một khóa `@yochef/cooking-session/<slug>`; không ghi Supabase |
| Lưu gì | Bước đang xem, các bước đã xong, trạng thái hẹn giờ (mốc kết thúc hoặc thời gian còn lại) |
| Mở lại | Hỏi "Tiếp tục nấu" hoặc "Nấu lại từ đầu". Không hỏi khi phiên còn ở bước 1 và chưa có gì |
| Hết hạn | Sau 24 giờ, tính theo cả hai chiều (đồng hồ máy bị chỉnh lùi cũng không giữ phiên mãi) |
| Kiểm khi khôi phục | Bỏ bước không còn trong công thức, kẹp bước hiện tại, hẹn giờ đã hết lúc vắng mặt thành "hết giờ" (không rung lại vì thông báo đã báo), dữ liệu hỏng hoặc khác phiên bản thì bỏ qua |
| Xóa | Khi bấm "Hoàn thành" hoặc "Nấu lại từ đầu". **Lệch spec 21 §3** (spec xóa cả khi thoát): giữ khi thoát là mục đích của bước này |
| Tiến độ | Tính theo số bước đã xong (spec 21 §2); một bước được tính xong khi bấm "Bước tiếp" |
| Bỏ đánh dấu | Quay lại một bước đã xong thấy "Bước này đã xong" và nút "Đánh dấu chưa xong" (2.12); tiến độ giảm và được lưu cùng phiên |
| Màn hình | Giữ sáng khi đang ở màn nấu (2.11); trang công thức và màn hỏi tiếp tục vẫn tắt theo máy |
