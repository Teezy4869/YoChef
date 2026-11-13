# Phase 2: tiến độ, thay đổi, điểm chưa hợp lý

**Ngày:** 2026-11-13 · **Project v2:** `bdhphjwhagygbwtfhhxn` · **Kết luận:** code Phase 2 xong, tầng 1 và tầng 2 xanh. Cập nhật 2026-11-13: migration `20261113120000` đã lên v2, `smoke:recipes` 26/26 ALL PASS, Phase 1 đạt DoD (`smoke:auth` 26/26). **Còn thiếu cho DoD:** chạy app trên máy thật (§4 mục 4), và đối chiếu với spec gốc (có ở `YoChef_born_again/20_phase_specs/phase-2/`; đã thấy lệch quy tắc làm tròn ở §5 mục 1 và thông báo hẹn giờ ở §5 mục 5).

Spec gốc (`phase-2/03_recipe_data_contract.md`, `16_serving_calculation_spec.md`, `app-in4`) không có trên máy. Phạm vi lấy từ `PHASE_0_COMPLETION.md` và `HANDOVER.md`: tìm kiếm, chi tiết, khẩu phần, chế độ nấu.

## 1. Các bước

Nhánh nối tiếp từ `phase-1/1.6-live-auth-check` (chưa merge vào `main`, chưa push). Thứ tự merge: toàn bộ `phase-1/*`, rồi `phase-2/*`.

| Bước | Nhánh | Commit | Nội dung |
|---|---|---|---|
| 2.1 | `phase-2/2.1-recipe-data` | `7dbc4cf` | Migration `20261113120000_recipe_search`: `public.fold_vi` và RPC `public.search_recipes`. 14 test PGlite. |
| 2.2 | `phase-2/2.2-recipe-list` | `ebce33e` | Tab Khám phá thành danh sách công thức: tìm kiếm không cần dấu, chip danh mục / độ khó / dưới 30, 60 phút, phân trang, trạng thái rỗng và lỗi. |
| 2.3 | `phase-2/2.3-recipe-detail` | `af97b12` | Chi tiết công thức, chỉnh khẩu phần 1 đến 50, nguyên liệu tự tính lại, ghi công nguồn sách. |
| 2.4 | `phase-2/2.4-cooking-mode` | `1469e76` | Chế độ nấu từng bước, hẹn giờ mỗi bước (chạy, dừng, tiếp tục, đặt lại), báo khi hết giờ. |
| 2.5 | `phase-2/2.5-live-recipe-check` | (commit này) | `scripts/live_recipes_smoke.mjs` + `npm run smoke:recipes`, log tầng 1 và 2, báo cáo này. |

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

Không thêm dependency nào (mọi thư viện đã có từ Phase 0).

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
| 2 | `npm run test:db` | 48/48 (34 cũ + 14 mới; phần seed bỏ qua vì không có zip dữ liệu) |
| Bundle | `expo export --platform android` | Thành công |
| 3 | `npm run smoke:recipes` | **26/26 ALL PASS** (`docs/evidence/phase-2/live_recipes_smoke.log`) |

Một lỗi thật được test bắt khi làm: nhân chia số thực làm `99.9` thành `99.90000000000002` ở khẩu phần mặc định; đã sửa (`scaleQuantity` trả đúng giá trị gốc khi khẩu phần không đổi).

## 4. Việc cần làm để đạt DoD

1. Đăng nhập Supabase CLI bằng tài khoản có quyền trên v2 (xem `PHASE_1_PROGRESS.md`).
2. `npx supabase db push --linked` (áp migration Phase 1 và `20261113120000`), rồi `migration list --linked`, `db advisors --linked`.
3. `npm run smoke:recipes`, kỳ vọng `ALL PASS`. Sau đó `npm run smoke:live` (19/19) và `npm run smoke:auth` (Phase 1).
4. Chạy app trên máy thật: tìm "thit kho", mở một công thức, tăng khẩu phần, vào chế độ nấu, bật hẹn giờ.
5. Sau khi xanh: merge fast-forward các nhánh theo thứ tự vào `main`.

## 5. Điểm chưa hợp lý, cần bạn biết

1. **Không có spec Phase 2 gốc.** Quy tắc hiển thị số lượng là mình tự chọn: khẩu phần tuyến tính; từ 100 trở lên làm tròn nguyên; 10 đến 100 một chữ số thập phân; dưới 10 dùng ¼ ½ ¾ ⅓ ⅔ hoặc tối đa hai chữ số thập phân; `≈` cho số do biên tập ước tính; "vừa ăn" cho `to_taste`. Nếu `16_serving_calculation_spec.md` quy định khác, phải sửa `servings.ts`.
2. **Tìm kiếm lệch kế hoạch:** SCHEMA_V2 dự kiến cột `search_text` + trigger; mình dùng hàm gấp chữ tại chỗ vì không cần extension và với 250 công thức là đủ. Mô tả công thức không được tìm, chỉ tên món và nguyên liệu.
3. **Bộ lọc thời gian loại công thức không rõ thời gian** (prep hoặc cook là `NULL`), vì "không biết" khác 0. Chưa biết có bao nhiêu công thức như vậy trên v2; nếu nhiều thì bộ lọc sẽ ẩn nhiều món. `smoke:recipes` chưa đếm số này.
4. **Chưa có bộ lọc chế độ ăn (Diet):** bảng `diets` được seed rỗng theo quy ước dữ liệu, nên không có gì để lọc.
5. **Hẹn giờ chỉ sống khi còn ở màn Chế độ nấu.** Thoát màn hình là mất; không có thông báo khi app ở nền (`expo-notifications` có sẵn nhưng chưa xin quyền hay lên lịch); báo hết giờ chỉ bằng rung và banner. Màn hình cũng chưa được giữ sáng vì `expo-keep-awake` chưa là dependency; thêm nó cần một commit nâng cấp riêng (AGENTS.md: ghim phiên bản).
6. **Ảnh bìa tải ở kích thước đầy đủ** (242 ảnh webp, tổng khoảng 52 MB, trung bình hơn 200 KB) dù thẻ chỉ hiển thị 96 px. Trên mạng yếu danh sách sẽ chậm. Cách xử lý (ảnh thu nhỏ, hoặc Supabase image transformation) cần quyết định riêng.
7. **Phase 2 xây trên Phase 1 chưa live check.** Nếu `smoke:auth` lộ lỗi, nhánh Phase 1 phải sửa và các nhánh Phase 2 cần rebase.
8. **Chưa thấy app chạy thật.** Mọi thứ mới qua Jest với Supabase giả và bundle Android; chưa mở trên máy ảo hay Expo Go.
9. **Chưa có:** đánh dấu yêu thích, danh sách mua sắm, đánh giá, bình luận (Phase 3); video, dinh dưỡng (Phase 4).
