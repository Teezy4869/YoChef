# YoChef v2: Schema chuẩn (SCHEMA_V2)

**Trạng thái:** `0001_catalog` = `supabase/migrations/20261108130000_catalog.sql`, `0002_identity_rbac` = `20261108130100_identity_rbac.sql` (bước 0.4). Phase 3: `favorites` = `20261113234830_phase3_favorites.sql` (3.1), `shopping_lists` = `20261114041322_phase3_shopping_lists.sql` (3.2), `ratings` = `20261114045322_phase3_ratings.sql` (3.3), `comments` = `20261114051346_phase3_comments.sql` (3.4), `cooking_photos` = `20261114054707_phase3_cooking_photos.sql` (3.5), duyệt nội dung = `20261114060039_phase3_moderation.sql` (3.6). Phase 4: vai trò và nhật ký quản trị = `20261114153457_phase4_rbac_audit.sql` (4.1), báo cáo vi phạm = `20261114155100_phase4_content_reports.sql` (4.2), CMS công thức = `20261114160903_phase4_recipe_cms.sql` (4.5), dinh dưỡng = `20261114162121_phase4_nutrition.sql` (4.3), video = `20261114163608_phase4_recipe_videos.sql` (4.4). Tên logic `00NN_*` trong tài liệu ứng với file có tiền tố timestamp mà Supabase CLI yêu cầu. Tài liệu này là **nguồn sự thật duy nhất** về schema: migration viết theo nó, và khi migration buộc phải khác, tài liệu được sửa trong cùng commit.
**Project:** Supabase `bdhphjwhagygbwtfhhxn` (YoChef v2), PostgreSQL 17.
**Ngày:** 2026-11-08.

## 0. Nguồn đối chiếu

| Nguồn | Dùng để |
|---|---|
| `app-in4.md` §3, §6, §7 | Thực thể nghiệp vụ, quy tắc domain, mô hình bảo mật |
| `phase-2/03_recipe_data_contract.md`, `16_serving_calculation_spec.md` | Hợp đồng recipe, quy tắc `NULL` |
| `phase-3/03_user_data_contract.md` | Hồ sơ, yêu thích, mua sắm, đánh giá, bình luận, ảnh |
| `phase-4/phase4_08_rbac_matrix.md`, `phase4_03_public_visibility_rules.md` | Vai trò và quyền |
| `phase-4/phase4_08_nutrition_data_contract.md`, `phase4_08_youtube_freshness_policy.md` | Dinh dưỡng, video |
| `recipes_working.json` (schema 1.1) và các file đi kèm trong zip release candidate | Hình dạng và ràng buộc dữ liệu thật |
| `02_REAL_DATABASE_STATE.md` | Các lỗi của database cũ cần tránh |

**Kiểm chứng dữ liệu:** mọi ràng buộc trong §3 đã được chạy thử bằng script trên `recipes_working.json`, cho **0 vi phạm**. Kết quả: slug và `source_key` không trùng; mỗi công thức có đúng 1 danh mục; bước nấu đánh số liên tục từ 1; `duration_seconds` là số nguyên dương hoặc `NULL`; dòng `to_taste` luôn có quantity 0 và unit rỗng (sẽ đổi thành `NULL`); `quantity` lớn nhất 2.500, tối đa 2 chữ số thập phân.

## 1. Quy ước chung

| # | Quy ước |
|---|---|
| C1 | Khóa chính `uuid default gen_random_uuid()`. Ngoại lệ: bảng nối dùng khóa ghép; `profiles.id` lấy từ `auth.users.id`. |
| C2 | `recipes`, `ingredients`, `categories`, `diets` có `slug` unique. Id dạng text từ bộ import lưu ở `source_key` (unique, nullable) để truy vết (K3). |
| C3 | Thời gian dùng `timestamptz`. Bảng có thể sửa thì có `updated_at`, được trigger `private.set_updated_at()` cập nhật. |
| C4 | Trạng thái dùng `text` + `CHECK`, không dùng enum, để thêm giá trị chỉ cần một migration nhỏ. Ngoại lệ duy nhất là `app_role` (K5). |
| C5 | Giá trị "không biết" là `NULL`, không bao giờ là `0` hay chuỗi rỗng: quantity "vừa ăn", unit trống, thời lượng bước không ghi, dinh dưỡng thiếu. |
| C6 | Schema `public` được Data API expose; schema `private` chứa hàm trợ giúp và không bị expose. |
| C7 | Mọi hàm `SECURITY DEFINER` đặt `set search_path = ''` và gọi đối tượng bằng tên đầy đủ (`public.x`, `auth.uid()`). v1 dùng `public, private, pg_temp`, không đạt K5. |
| C8 | Mỗi migration tự `revoke` rồi `grant` tường minh cho `anon` và `authenticated`, **không dựa vào default privileges** của Supabase. `anon` không có quyền ghi trên bảng nào (K5). Migration `0001` còn chặn default privileges trong `public` để bảng mới không tự mở cho hai role này. |
| C9 | RLS bật trên **mọi** bảng ở `public`. Bảng không có policy cho một role thì role đó không thấy dòng nào. |
| C10 | Khóa ngoại tới người dùng trỏ vào `public.profiles(id) on delete cascade`, để PostgREST nhúng được tác giả và xóa tài khoản sẽ xóa nội dung. Riêng `user_roles` trỏ thẳng `auth.users`. |
| C11 | File nhị phân nằm trong Storage. Database chỉ lưu **đường dẫn tương đối** trong bucket (`*_path`), không lưu URL. |

## 2. Tổng quan

```
recipe_sources ─┐
categories ─────┼──< recipes >──┬──< recipe_ingredients >── ingredients ──< ingredient_nutrition (4.3)
diets ──< recipe_diets >────────┤                               └──< nutrition_unit_conversions (4.3)
                                ├──< recipe_steps
                                ├──< recipe_videos (4.4)
                                ├──  recipe_nutrition (4.3, 1-1)
                                ├──< ratings, comments, cooking_photos   (Phase 3)
                                └──< favorites                            (Phase 3)
auth.users ── profiles ──< shopping_lists ──< shopping_list_items >── ingredients (nullable)
     └──< user_roles
```

| # | Bảng | Migration | Phase | Đọc công khai |
|---|---|---|---|---|
| 1 | `recipe_sources` | 0001_catalog | 0 | Có |
| 2 | `categories` | 0001 | 0 | Có |
| 3 | `ingredients` | 0001 | 0 | Có |
| 4 | `recipes` | 0001 | 0 | Chỉ `published` |
| 5 | `recipe_ingredients` | 0001 | 0 | Theo công thức `published` |
| 6 | `recipe_steps` | 0001 | 0 | Theo công thức `published` |
| 7 | `diets` | 0001 | 0 | Có |
| 8 | `recipe_diets` | 0001 | 0 | Theo công thức `published` |
| 9 | `profiles` | 0002_identity_rbac | 0 | Các cột hiển thị |
| 10 | `user_roles` | 0002 | 0 | Không (chỉ chủ sở hữu) |
| 11 | `favorites` | 3.1 | 3 | Không |
| 12 | `shopping_lists` | 3.2 | 3 | Không |
| 13 | `shopping_list_items` | 3.2 | 3 | Không |
| 14 | `ratings` | 3.3 | 3 | Có |
| 15 | `comments` | 3.4 | 3 | Chỉ `approved` |
| 16 | `cooking_photos` | 3.5 | 3 | Chỉ `approved` |
| 17 | `recipe_videos` | 4.4 | 4 | Video chính, đã xác minh, còn hạn |
| 18 | `ingredient_nutrition` | 4.3 | 4 | Chỉ `VERIFIED` |
| 19 | `nutrition_unit_conversions` | 4.3 | 4 | Không |
| 20 | `recipe_nutrition` | 4.3 | 4 | Chỉ `VERIFIED` của công thức `published` |
| 21 | `admin_audit_logs` | 4.1 | 4 | Không |
| 22 | `content_reports` (4.2), `moderation_actions` (3.6, đưa sớm từ 4.2) | 4.2 / 3.6 | 4 / 3 | Không |

Bảng 1–17 và 10 khớp danh sách "17 bảng nghiệp vụ + `user_roles`" của kế hoạch. Thực thể `Nutrition` của `app-in4` được tách thành bảng 18–20 theo hợp đồng dinh dưỡng Phase 4. Bảng 18–22 ở §5 chỉ là **phác thảo**; chi tiết sẽ chốt khi bắt đầu lát cắt tương ứng, và tài liệu này được cập nhật trong cùng commit.

## 3. Catalog: migration `0001_catalog`

Phase 0 không có đường ghi nào từ client. Dữ liệu được nạp bằng script seed với secret key (K4), chạy trên máy chủ dự án, không bao giờ ở client. Quyền ghi cho editor đến ở lát cắt 4.5, qua RPC.

### 3.1 `recipe_sources`
| Cột | Kiểu | Ràng buộc |
|---|---|---|
| `id` | uuid | PK |
| `source_key` | text | unique, not null. Ví dụ `dieu-thao-2014` |
| `title` | text | not null |
| `compiler` | text | |
| `publishers` | text[] | not null default `'{}'` |
| `publication_year` | int | check 1800–2100 |
| `usage_note` | text | ví dụ "Sử dụng cho mục đích giáo dục" |
| `created_at`, `updated_at` | timestamptz | |

**RLS:** `anon` và `authenticated` đều SELECT được. **Thay đổi so với v1** (v1 ẩn bảng này): hiển thị nguồn sách ở chi tiết công thức là nghĩa vụ ghi công khi dùng nội dung sách cho mục đích giáo dục, và bảng không chứa dữ liệu nhạy cảm.

### 3.2 `categories`
| Cột | Kiểu | Ràng buộc |
|---|---|---|
| `id` | uuid | PK |
| `slug` | text | unique, not null. Giữ đúng slug của dữ liệu (`mon_chinh`, …) |
| `name` | text | not null (`name_vi`) |
| `description` | text | |
| `sort_order` | int | not null default 0 |
| `created_at`, `updated_at` | timestamptz | |

**RLS:** công khai SELECT. Seed: 10 dòng từ `categories_approved.json`.

### 3.3 `ingredients`
| Cột | Kiểu | Ràng buộc |
|---|---|---|
| `id` | uuid | PK |
| `source_key` | text | unique. Ví dụ `ing_banh_da` |
| `slug` | text | unique, not null |
| `name` | text | unique, not null (`canonical_name`) |
| `aliases` | text[] | not null default `'{}'` |
| `common_units` | text[] | not null default `'{}'` |
| `created_at`, `updated_at` | timestamptz | |

**RLS:** công khai SELECT. **Index:** btree `name`. Seed: 542 dòng từ `ingredient_dictionary.fixed.json`. Tên nguyên liệu trong công thức khớp 542/542 với `canonical_name`, nên không cần bước phân giải alias khi import.

### 3.4 `recipes`
| Cột | Kiểu | Ràng buộc |
|---|---|---|
| `id` | uuid | PK |
| `source_key` | text | unique. Ví dụ `dieu-thao-2014-001` |
| `source_id` | uuid | FK `recipe_sources` on delete restrict |
| `source_recipe_number` | int | check > 0 |
| `source_page` | int | check > 0 |
| `slug` | text | unique, not null. Ví dụ `001-thit-lon-kho-cot-dua` |
| `name` | text | not null, độ dài 1–200 sau khi trim |
| `description` | text | |
| `category_id` | uuid | FK `categories` on delete restrict |
| `difficulty` | text | check in (`easy`,`medium`,`hard`) |
| `default_servings` | int | check > 0 |
| `serving_basis` | text | check in (`book`,`editor_estimate`,`inferred_yield`) |
| `serving_note` | text | |
| `prep_time_minutes` | int | check ≥ 0 |
| `cook_time_minutes` | int | check ≥ 0 |
| `cover_image_path` | text | đường dẫn trong bucket `recipe-images`: `<slug>/cover.webp` |
| `status` | text | not null default `draft`, check in (`draft`,`staged`,`published`,`archived`) |
| `review_issues` | text[] | not null default `'{}'` (từ `issues` của dữ liệu) |
| `published_at` | timestamptz | |
| `created_at`, `updated_at` | timestamptz | |

**CHECK bổ sung:** khi `status = 'published'` thì phải có `category_id`, `default_servings` và `published_at` khác null.

**Không có bảng `recipe_categories`.** Dữ liệu có đúng 1 danh mục cho mỗi công thức (`category_slugs` luôn dài 1 và trùng `primary_category`), và mọi hợp đồng app đều dùng một danh mục. Nếu sau này cần nhiều danh mục, thêm bảng nối bằng một migration riêng. Bộ facets (`main_ingredient`, `cooking_method`, `meal_context` trong `recipe_facets.json`) không thuộc MVP nên không đưa vào schema.

**RLS:**
- `anon` và `authenticated` SELECT `status = 'published'`.
- **Editor đọc mọi trạng thái (4.5):** policy `is_editor()` trên `recipes`, `recipe_ingredients`, `recipe_steps`, `recipe_diets`. Vì vậy `search_recipes` (tạo lại ở 4.5) và truy vấn chi tiết của app lọc `status = 'published'` **tường minh**, để editor dùng app không thấy bản nháp.
- **Ghi (4.5, `20261114160903_phase4_recipe_cms.sql`):** client không có quyền ghi bảng catalog nào; mọi thao tác qua RPC DEFINER, có `admin_audit_logs` trong cùng giao dịch:
  - `save_recipe(p_id, p_recipe, p_ingredients, p_steps, p_reason)`: chỉ editor; `p_id` NULL thì tạo bản `draft`. Ghi cha, rồi **thay toàn bộ** nguyên liệu và bước theo thứ tự mảng (`sort_order`, `step_number` từ 1). Chuỗi rỗng thành NULL. Công thức đang `staged` hay `published` phải vẫn đạt điều kiện sau khi sửa, nếu không cả giao dịch hủy. Slug trùng `23505`; vi phạm CHECK của bảng `23514`.
  - `transition_recipe_status(p_id, p_to, p_reason)`: đúng sơ đồ draft → staged/archived; staged → published/draft/archived; published → staged/archived; archived → draft. `draft → published` bị từ chối. Lên `staged` hay `published` phải đạt điều kiện. Lần công bố đầu đặt `published_at`.
  - Điều kiện (`private.recipe_problems`, trả lỗi theo trường trong `detail` của lỗi `22023`): có danh mục, có khẩu phần mặc định, ít nhất một nguyên liệu và không lặp nguyên liệu, ít nhất một bước, mỗi bước tối đa 2000 ký tự, và ảnh bìa nếu có thì phải tồn tại trong `recipe-images` (hoặc là URL `https://`). **Lệch spec 4.5 có chủ đích:** mô tả, thời gian và ảnh bìa không bắt buộc, vì "không biết" là NULL (C5) và 8 công thức có ảnh bị cách ly không có ảnh bìa. Công thức đã công bố không bị kiểm lại khi migrate; công thức nào chưa đạt (ví dụ #095 lặp "Tỏi") vẫn hiện, nhưng phải sửa mới lưu được.
  - `delete_recipe(p_id, p_confirm_slug, p_reason)`: chỉ super_admin, gõ đúng slug, có lý do; từ chối công thức `published` hay đã có yêu thích, đánh giá, bình luận, ảnh. Ảnh bìa của công thức bị xóa còn lại trong bucket.
  - `create_ingredient(p_name)`: editor tạo nguyên liệu mới (slug gấp từ tên); tên đã có thì trả id sẵn có.
  - Không có trigger chặn đổi `status` trực tiếp như spec gợi ý: client không có quyền UPDATE trên `recipes`, nên chỉ RPC đổi được.

**Index:** `(status, category_id)`, `category_id`.

**Tìm kiếm tiếng Việt (Phase 2, bước 2.1, `20261113120000_recipe_search`):** không thêm cột `search_text`, không dùng `unaccent`. `public.fold_vi(text)` (IMMUTABLE, dựng từ `normalize(NFD)` + `regexp_replace`, đổi `đ` thành `d`) và RPC `public.search_recipes(q, category_slug, difficulty, max_total_minutes, limit, offset)` dạng `SECURITY INVOKER`, nên RLS của người gọi áp dụng (chỉ thấy `published`). Mọi từ khóa phải khớp (AND), theo tên công thức hoặc tên/alias nguyên liệu; khớp tên xếp trước khớp nguyên liệu. Lọc thời gian loại công thức có `prep_time_minutes` hoặc `cook_time_minutes` là `NULL` (không biết khác 0). `limit` kẹp 1–100. Với 250 công thức, gấp chữ tại chỗ đủ nhanh, chưa cần index.

### 3.5 `recipe_ingredients`
| Cột | Kiểu | Ràng buộc |
|---|---|---|
| `id` | uuid | PK |
| `recipe_id` | uuid | FK `recipes` on delete cascade, not null |
| `ingredient_id` | uuid | FK `ingredients` on delete restrict, not null |
| `sort_order` | int | not null, check > 0; unique `(recipe_id, sort_order)` |
| `quantity` | numeric(10,3) | check > 0 |
| `unit` | text | check khác chuỗi rỗng |
| `quantity_basis` | text | not null, check in (`book`,`editor_estimate`,`to_taste`) |
| `preparation_note` | text | |
| `quantity_note` | text | |
| `is_optional` | boolean | not null default false |

**CHECK:** `(quantity is null) = (quantity_basis = 'to_taste')`. Như vậy "vừa ăn" luôn là `NULL`, không bao giờ là 0 (C5).

**Không đặt unique `(recipe_id, ingredient_id)`.** Dữ liệu có 2 công thức dùng cùng một nguyên liệu ở 2 dòng khác nhau:
- `167-canh-ga-nau-dau-trang-khoai-mon`: "Hạt nêm" một lần để ướp gà, một lần để nêm.
- `095-ca-tre-om-rau-can`: "Tỏi" ở 2 dòng ("1 cây, cắt khúc 5–6 cm" và "2,5 nhánh, băm nhỏ"). Dòng thứ nhất có thể là tỏi tây bị ánh xạ nhầm; bước 0.5 sẽ ghi lại để editor rà, không tự sửa dữ liệu.

**RLS:** SELECT khi tồn tại `recipes` cha có `status = 'published'`. **Index:** `ingredient_id` (để tìm công thức theo nguyên liệu).

### 3.6 `recipe_steps`
| Cột | Kiểu | Ràng buộc |
|---|---|---|
| `id` | uuid | PK |
| `recipe_id` | uuid | FK cascade, not null |
| `step_number` | int | not null, check > 0; unique `(recipe_id, step_number)` |
| `instruction` | text | not null, không rỗng sau khi trim |
| `duration_seconds` | int | check > 0 |
| `duration_basis` | text | check in (`book`,`editor_estimate`). `unspecified` của dữ liệu được đổi thành `NULL` |
| `timer_enabled` | boolean | not null default false |

**CHECK:** `not timer_enabled or duration_seconds is not null`. Dữ liệu có 252 bước bật hẹn giờ, bước nào cũng có thời lượng. **RLS:** như `recipe_ingredients`.

### 3.7 `diets` và `recipe_diets`
- `diets`: `id`, `slug` unique, `name`, `description`, `created_at`, `updated_at`.
- `recipe_diets`: PK `(recipe_id, diet_id)`, hai FK đều cascade.

**Seed rỗng.** Bộ dữ liệu cấm suy diễn chế độ ăn (`NO_INFERRED_VEGETARIAN_CLASSIFICATIONS`, `NO_UNSUPPORTED_DIETARY_OR_HEALTH_TAGS`). Bộ lọc "Diet" trong `app-in4` §6.2 vẫn có chỗ chứa dữ liệu, nhưng phải được editor gắn thủ công ở 4.5.

**RLS:** `diets` công khai; `recipe_diets` theo công thức `published`.

## 4. Định danh và phân quyền: migration `0002_identity_rbac`

### 4.1 `profiles`
| Cột | Kiểu | Ràng buộc |
|---|---|---|
| `id` | uuid | PK, FK `auth.users` on delete cascade |
| `display_name` | text | độ dài 1–50 sau khi trim |
| `avatar_path` | text | đường dẫn trong bucket `avatars`, phải bắt đầu bằng `<id>/` |
| `bio` | text | ≤ 500 ký tự |
| `created_at`, `updated_at` | timestamptz | |

- **Không có cột `role`** (K5, L5).
- **Đăng ký tài khoản:** trigger `on_auth_user_created` (AFTER INSERT trên `auth.users`) gọi `private.handle_new_user()` (DEFINER, `search_path=''`). Hàm insert `(id, display_name)`. `display_name` lấy từ metadata `display_name` hoặc `full_name`, nếu không có thì lấy phần trước `@` của email; giá trị được trim, cắt còn 50 ký tự, và để `NULL` nếu rỗng, để **không bao giờ làm hỏng việc đăng ký**. Metadata không ảnh hưởng tới quyền.
- **Grant:**
  - `anon`, `authenticated`: SELECT `(id, display_name, avatar_path, created_at)`. `bio` không public; chủ sở hữu đọc `bio` qua RPC hoặc view ở Phase 1 nếu cần.
  - `authenticated`: UPDATE `(display_name, avatar_path, bio)`.
  - Không ai được INSERT hay DELETE từ client.
- **RLS:** SELECT `true`; UPDATE khi `id = auth.uid()`.

### 4.2 `user_roles` và hàm vai trò
| Cột | Kiểu | Ràng buộc |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK `auth.users` on delete cascade, not null |
| `role` | `public.app_role` | enum (`super_admin`,`editor`,`moderator`) |
| `granted_by` | uuid | FK `auth.users` on delete set null |
| `created_at` | timestamptz | |

- Unique `(user_id, role)`; index `user_id`.
- Người dùng không có dòng nào là người dùng thường.
- **RLS:** `authenticated` chỉ SELECT dòng của chính mình. Không có quyền INSERT, UPDATE hay DELETE từ client.
- **Gán và thu hồi (4.1, `20261114153457_phase4_rbac_audit.sql`):** RPC `public.manage_user_role(p_target, p_role, p_action, p_reason)`: DEFINER, chỉ `is_super_admin()` (khác thì `42501`); `p_action` là `assign` hoặc `revoke`, lý do bắt buộc (thiếu thì `22023`), tài khoản không tồn tại thì `P0002`. Trả `true` khi có thay đổi; gán vai trò đã có hay thu hồi vai trò không có thì trả `false` và không ghi nhật ký. Super admin không tự thu hồi `super_admin` của mình (`42501`). Mỗi thay đổi ghi một dòng `admin_audit_logs` trong cùng giao dịch; `granted_by` là người gán.
- **Super admin cuối cùng:** trigger `private.keep_last_super_admin()` (DEFINER) trên `user_roles` từ chối xóa hay đổi dòng `super_admin` cuối cùng còn hoạt động (chưa xóa, không bị khóa: `auth.users.deleted_at`, `banned_until`), kể cả khi xóa tài khoản kéo theo cascade. Trigger khóa mọi dòng `super_admin` nên hai lệnh thu hồi đồng thời không cùng lọt.
- **Đọc cho super admin:** `list_staff()` (mọi người có vai trò, kèm email và tên), `find_user_by_email(p_email)` (chỉ khớp đúng email, không phân biệt hoa thường; không có tìm kiếm hay liệt kê người dùng thường), `list_admin_audit_logs(p_limit, p_before)` (mới nhất trước, phân trang theo thời gian, `p_limit` kẹp 1–200). Cả ba là DEFINER và báo `42501` với người không phải super admin. Advisor `authenticated_security_definer_function_executable` sẽ báo cả 4 RPC: chấp nhận, cùng lý do như `get_my_profile()` (mỗi hàm tự kiểm vai trò trước khi làm gì).
- **Bootstrap super_admin đầu tiên** (4.1): chủ dự án tự chạy một lệnh SQL trong SQL Editor với email do chính mình chọn. Lệnh này không nằm trong migration hay seed, để repo không chứa email.

Hàm, tất cả nằm trong `private`, đều `STABLE SECURITY DEFINER set search_path = ''`, đọc `public.user_roles` theo `auth.uid()`:

| Hàm | Đúng khi |
|---|---|
| `private.has_role(app_role)` | có đúng vai trò đó |
| `private.is_super_admin()` | super_admin |
| `private.is_editor()` | editor hoặc super_admin |
| `private.is_moderator()` | moderator hoặc super_admin |

- Không có `is_admin()`. Tên này gây ra lỗ hổng phân quyền ở v1, nên bị bỏ.
- Editor và moderator không kế thừa quyền của nhau.
- EXECUTE chỉ cấp cho `authenticated`. Policy của `anon` không bao giờ gọi các hàm này (tách policy theo role, như `phase4_03`).

## 5. Bảng của Phase 3 và 4

Các bảng dưới đây đã chốt về cột chính và quy tắc quyền. Mỗi bảng có một migration riêng, áp tuần tự (L4).

### 5.1 `favorites` (3.1, `20261113234830_phase3_favorites.sql`)
- PK `(user_id, recipe_id)`, cùng `created_at`. FK `profiles` và `recipes`, cả hai cascade; index `recipe_id`.
- **Grant:** `authenticated` có SELECT, DELETE và INSERT chỉ trên `(user_id, recipe_id)`; không có UPDATE. `anon` không có quyền nào.
- **RLS:** chủ sở hữu SELECT, INSERT, DELETE. INSERT chỉ được khi công thức đang `published`.

### 5.2 `shopping_lists` và `shopping_list_items` (3.2, `20261114041322_phase3_shopping_lists.sql`)
`shopping_lists`:
- `id`, `user_id` (FK `profiles` cascade).
- `name` (not null, default `'Danh sách mua sắm'`, 1–100 ký tự).
- `source_recipe_id` (FK `recipes` on delete set null).
- `created_at`, `updated_at`.

`shopping_list_items`:
- `id`, `shopping_list_id` (FK cascade, có index).
- `ingredient_id`: nullable, FK `ingredients` on delete set null. Nullable vì người dùng có thể tự nhập món.
- `label`: not null, 1–100 ký tự, là bản chụp tên lúc thêm.
- `quantity` (numeric > 0, null nghĩa là "vừa ăn" hoặc không rõ), `unit` (1–50 ký tự hoặc null), `note` (1–200 ký tự hoặc null). Chuỗi rỗng bị từ chối (C5).
- `is_checked` (default false), `sort_order` (default 0), `created_at`, `updated_at`.

**Grant:** `authenticated` có SELECT, DELETE; INSERT danh sách trên `(user_id, name, source_recipe_id)`, UPDATE chỉ `name`; INSERT item trên các cột nội dung cùng `shopping_list_id`, UPDATE chỉ `label, quantity, unit, note, is_checked, sort_order`. Không đổi được chủ của danh sách hay danh sách của item. `anon` không có quyền.

**RLS:** danh sách thuộc chủ sở hữu (`user_id = auth.uid()`); item kiểm tra qua `exists` danh sách cha. `source_recipe_id` được kiểm dưới RLS của người gọi, nên chỉ công thức `published` hợp lệ.

**Cách app dùng:** mỗi người một danh sách mặc định (danh sách cũ nhất, tạo khi thêm món đầu tiên). "Thêm vào đi chợ" nối thêm dòng và **không gộp dòng trùng** (spec 12 §2); số lượng lưu đúng số trang công thức đang hiện (quy tắc A2).

**Sửa đúng các lỗi của DB cũ:**
- `name` có default, vì app tạo danh sách mà không gửi tên.
- `ingredient_id` nullable, vì món tự nhập không có nguyên liệu tương ứng.
- Dùng một tên thống nhất là `name`, cùng kiểu với `recipes.name`, thay vì để `title` ở app và `name` ở database.

### 5.3 `ratings` (3.3, `20261114045322_phase3_ratings.sql`)
- `id`, `user_id` (FK `profiles` cascade), `recipe_id` (FK `recipes` cascade, có index); unique `(user_id, recipe_id)`.
- `score` smallint 1–5, `created_at`, `updated_at`.
- **Không có cột `review`.** `app-in4` §6.7 quy định chỉ có một thực thể Comment, nên phần nhận xét bằng chữ thuộc về `comments`.
- **RLS:**
  - SELECT công khai khi công thức `published`.
  - Chủ sở hữu INSERT và UPDATE với `user_id = auth.uid()`.
  - Chủ sở hữu hoặc super_admin được DELETE.
- **Grant:** `anon` SELECT; `authenticated` SELECT, INSERT trên `(user_id, recipe_id, score)`, UPDATE chỉ `score`, DELETE. Không đổi được người chấm hay công thức của một điểm.
- **Điểm trung bình (O3, chốt ở 3.3): view** `public.recipe_rating_summary` (`security_invoker = true`): `recipe_id`, `rating_count`, `avg_score` (làm tròn 1 chữ số). Grant SELECT cho anon và authenticated. Công thức chưa có ai chấm thì **không có dòng**: trung bình là không rõ, không phải 0 (C5). View chạy dưới quyền người gọi nên chỉ tính các điểm người đó được thấy.

### 5.4 `comments` (3.4, `20261114051346_phase3_comments.sql`) và `cooking_photos` (3.5, `20261114054707_phase3_cooking_photos.sql`)
Cột chung: `id`, `user_id` (FK `profiles` cascade), `recipe_id` (FK `recipes` cascade), `status` (`pending`,`approved`,`rejected`, default `pending`), `created_at`, `updated_at`.

Cột riêng:
- `comments`: `content` tối đa 1000 ký tự và phải có ít nhất một ký tự không phải khoảng trắng (`content ~ '\S'`). Index `(recipe_id, created_at desc)` và `user_id`.
- `cooking_photos`:
  - `storage_path` unique, phải nằm trong thư mục của tác giả và có tên file an toàn: `split_part(storage_path, '/', 1) = user_id::text` và `storage_path ~ '^[^/]+/[A-Za-z0-9_-]+\.(jpg|png|webp)$'`. Client không sửa được cột này sau khi tạo;
  - `caption` là NULL, hoặc tối đa 250 ký tự và không chỉ có khoảng trắng;
  - index `(recipe_id, created_at desc)` và `user_id`.

Ba quy tắc về `status`:
- client luôn tạo nội dung ở trạng thái `pending`, và chủ sở hữu không đổi được `status`: **grant theo cột**, client không có quyền INSERT hay UPDATE trên `status` (PostgREST trả `42501`);
- sửa nội dung đã `approved` sẽ đưa nó về lại `pending`: trigger chung `private.reset_status_on_edit()` (INVOKER, `search_path=''`), tham số là tên cột nội dung (`content`, bước 3.5 dùng `caption`). Cập nhật không đổi nội dung thì giữ nguyên `approved`.

**Grant (`comments`):** `anon` SELECT; `authenticated` SELECT, INSERT trên `(user_id, recipe_id, content)`, UPDATE chỉ `content`, DELETE. Không đổi được tác giả hay công thức của một bình luận.

**Grant (`cooking_photos`):** giống `comments`, với INSERT trên `(user_id, recipe_id, storage_path, caption)` và UPDATE chỉ `caption`.

RLS theo `phase4_03`:

| Role | Được đọc |
|---|---|
| `anon` | `approved` của công thức `published` (policy không gọi hàm trợ giúp nào) |
| `authenticated` | như trên, cộng nội dung của chính mình chưa bị `rejected`, cộng mọi nội dung nếu là `is_moderator()` |

- INSERT: của chính mình, với công thức `published`.
- UPDATE: chủ sở hữu, khi nội dung chưa bị `rejected`. Moderator không sửa được nội dung của người khác.
- DELETE: chủ sở hữu khi chưa bị `rejected`, hoặc `is_super_admin()`.
- RLS của `cooking_photos` giống hệt bảng trên. Quyền với file ở §6.
- Advisor `multiple_permissive_policies` (hiệu năng) báo 3 policy SELECT cho `authenticated` (mỗi bảng): **chấp nhận**. PostgreSQL gộp các policy permissive bằng OR thành một điều kiện, nên gộp tay cũng chạy cùng biểu thức; policy công khai phải tách riêng vì `anon` không có quyền trên schema `private` (`docs/evidence/phase-3/v2_state.log`, mục 3.4).

**Cách app dùng (ảnh):** chụp hoặc chọn ảnh, mã hóa lại bằng `expo-image-manipulator` (cạnh dài tối đa 1600 px, JPEG 0,8; ảnh mã hóa mới không mang EXIF), tải lên `<user id>/<thời điểm>-<chuỗi ngẫu nhiên>.jpg` với `upsert: false`, rồi thêm dòng; nếu thêm dòng lỗi thì xóa file vừa tải. Xóa ảnh: xóa dòng trước, rồi xóa file. Lưới ảnh dùng `createSignedUrls` (hạn 1 giờ), mỗi lần 12 ảnh.

**Cách app dùng (bình luận):** trang chi tiết hiện bình luận mới nhất trước, mỗi lần 20 (đọc thêm một dòng để biết còn trang sau). Tên tác giả lấy qua embed `author:profiles!comments_user_id_fkey(display_name, avatar_path)`. Ghi rõ tên FK để embed không bị nhập nhằng khi `moderated_by` (3.6) cũng trỏ tới `profiles`. Bình luận của mình đang chờ có nhãn "Đang chờ duyệt".

**Duyệt (3.6, `20261114060039_phase3_moderation.sql`, đưa sớm một phần 4.2, quyết định D6 của kế hoạch Phase 3):**
- Cột `moderated_by` (FK `profiles`, `on delete set null`, có index) và `moderated_at` trên cả hai bảng. **Client không đọc được hai cột này:** SELECT của `anon` và `authenticated` chuyển sang grant theo cột, không gồm `moderated_by`, `moderated_at`. Lộ chúng ra sẽ cho biết tài khoản nào là moderator, trong khi `user_roles` là riêng tư. Hệ quả: client phải nêu rõ cột cần đọc, vì `select=*` sẽ bị từ chối (`42501`).
- RPC `public.moderate_community_content(p_table, p_id, p_status, p_reason)`: DEFINER, `search_path=''`, chỉ `authenticated` được gọi. Không phải `is_moderator()` thì báo `42501`. `p_table` là `comments` hoặc `cooking_photos`, `p_status` là một trong ba trạng thái (sai thì `22023`), không thấy nội dung thì `P0002`. Mọi chuyển trạng thái đều được phép; đưa về `approved` là khôi phục. RPC khóa dòng, đổi `status`, `moderated_by`, `moderated_at` và ghi một dòng `moderation_actions` trong cùng giao dịch. Lý do trống thành NULL; lý do quá 500 ký tự làm cả giao dịch thất bại.
- Phải là DEFINER vì client không có quyền UPDATE trên `status`. Advisor `authenticated_security_definer_function_executable` báo hàm này: **chấp nhận**, cùng lý do như `get_my_profile()` (O2), và hàm tự kiểm `is_moderator()` trước mọi thay đổi.
- Trigger `reset_status_on_edit` không đụng tới quyết định của moderator, vì RPC không đổi nội dung.
- Màn "Duyệt nội dung" trong app (chỉ hiện với moderator và super_admin) liệt kê bình luận và ảnh `pending`, cũ nhất trước, tối đa 50 mục mỗi loại. Đây là giải pháp tạm; 4.2 chuyển việc duyệt sang admin web kèm báo cáo vi phạm.

### 5.5 `recipe_videos` (4.4, `20261114163608_phase4_recipe_videos.sql`)
Chính sách: `phase4_08_youtube_freshness_policy.md` (YouTube Developer Policies III.E.4).
- `id`, `recipe_id` (cascade), `youtube_video_id` (khớp `^[A-Za-z0-9_-]{11}$`), unique `(recipe_id, youtube_video_id)`; `title`, `channel_title`; `is_primary` (unique partial index: tối đa 1 video chính mỗi công thức); `verification_status` (`unverified`, `verified`, `unavailable`), `unavailable_reason`, `last_verified_at`, `last_checked_at` (lần thử làm mới gần nhất), `refresh_failures`; `created_at`, `updated_at`. CHECK: `verified` phải có `last_verified_at` và `title`.
- **Public chỉ đọc** video thỏa cả bốn điều kiện: video chính, `verified`, `last_verified_at > now() - 30 days`, công thức `published`. Điều kiện ngày nằm ngay trong RLS nên video quá hạn bị ẩn ngay cả khi lịch làm mới dừng. App kiểm lại ngày một lần nữa. Editor đọc mọi dòng.
- **Gắn video:** client không ghi bảng. Edge Function `youtube-search` (`verify`) gọi `videos.list`, rồi bằng service role ghi một biên nhận vào `private.video_verifications` (không lộ ra API) qua `record_video_verification`. `assign_recipe_video(p_recipe_id, p_video_id)` (editor) chỉ nhận biên nhận `verified` **của chính editor đó, trong 15 phút, chưa dùng**; khóa dòng công thức, hạ video chính cũ, ghi video mới với tiêu đề và kênh lấy từ biên nhận, ghi audit. `remove_recipe_video` (editor) xóa một video. Một kết quả `unavailable` ẩn video đó ở mọi công thức ngay lập tức và xóa tiêu đề, kênh.
- Xác minh đạt khi video công khai, đã xử lý xong, cho nhúng, và không bị chặn ở Việt Nam. Kết quả `search.list` chỉ là ứng viên.
- **Làm mới và lưu giữ (chỉ service role):** `claim_videos_for_refresh(50)` lấy video đã xác minh hơn 25 ngày và chưa thử trong 6 giờ qua; Edge Function `youtube-refresh` gọi `videos.list` một lần cho tối đa 50 id (1 đơn vị quota) rồi `apply_video_refresh` (đạt: cập nhật; không dùng được: ẩn, xóa metadata; lỗi: tăng `refresh_failures`); cuối cùng `expire_stale_videos()`. **Quyết định E10 (chủ dự án chọn):** dòng nào không được xác minh lại trong 30 ngày bị **xóa hẳn**, kể cả video ID; biên nhận quá 1 ngày cũng bị xóa. Mỗi lần chạy ghi audit hệ thống (`actor_id` NULL).
- Lịch chạy: `supabase/scripts/youtube_schedule.sql` (pg_cron + pg_net, secret trong Vault), chủ dự án chạy tay trong SQL Editor; có thêm một job xóa quá hạn chạy thẳng trong database phòng khi HTTP lỗi. **Chưa kiểm được** cho tới khi lịch chạy thật.

### 5.6 Dinh dưỡng (4.3, `20261114162121_phase4_nutrition.sql`, engine 2.0.0)
Hợp đồng chi tiết: `phase4_08_nutrition_data_contract.md`. Nguồn dữ liệu: **chỉ USDA** (quyết định E11 của kế hoạch Phase 4; Open Food Facts để sau).

- `ingredient_nutrition` (PK `ingredient_id`, FK cascade): `basis` (`per_100g` hoặc NULL), 8 chất (`energy_kcal`, `protein_g`, `fat_g`, `carbs_g`, `sodium_mg`, `saturated_fat_g`, `fiber_g`, `sugar_g`; NULL hoặc ≥ 0), nguồn gốc (`provider` = `usda`, `external_id` 1–10 chữ số, `description`, `data_type`, `preparation_state`, `source_version`, `retrieved_at`), `mapping_status` (`UNMAPPED`, `CANDIDATE`, `NEEDS_REVIEW`, `VERIFIED`, `UNAVAILABLE`), `verified_by`, `verified_at`. CHECK: không có `basis` thì mọi chất là NULL; `VERIFIED` bắt buộc có basis, nguồn và thời điểm xác minh.
- `nutrition_unit_conversions`: `ingredient_id` (NULL là quy tắc chung), `unit` (chữ thường, đã bỏ khoảng trắng), `grams_per_unit` > 0, `source`, `method`, `verified_by`, `verified_at`; unique `(ingredient_id, unit) nulls not distinct`; xác minh cần nguồn và cách đo. Migration chỉ seed `g`, `gram`, `kg`, `mg` là đã xác minh (định nghĩa). Không giả định khối lượng riêng hay trọng lượng một quả/muỗng.
- `recipe_nutrition` (PK `recipe_id`, FK cascade): `calculation_version`, `status` (`NOT_CALCULATED`, `INCOMPLETE`, `CALCULATED`, `NEEDS_REVIEW`, `VERIFIED`, `STALE`), `totals` và `per_serving` (jsonb 8 chất, NULL là chưa rõ), `completeness`, `reason_codes`, `breakdown` (từng nguyên liệu bắt buộc: gam và lý do), `excluded_optional`, `calculated_at`, `verified_by`, `verified_at`. **Lệch phác thảo cũ có chủ đích:** tổng và mỗi phần lưu thành jsonb thay vì 16 cột.
- **Engine** (`private.compute_recipe_nutrition`): chỉ dùng mapping và quy đổi **đã xác minh** (quy tắc riêng của nguyên liệu thắng quy tắc chung). Nguyên liệu `is_optional` bị loại và liệt kê riêng. Một nguyên liệu bắt buộc không quy được ra gam hay không có mapping xác minh thì **mọi tổng là NULL** (không bao giờ cộng một phần). Một chất thiếu ở một nguyên liệu thì tổng chất đó NULL. 5 chất bắt buộc: năng lượng, đạm, béo, bột đường, natri. Mỗi phần tính từ tổng chưa làm tròn; làm tròn 1 chữ số, nửa ra xa 0. Trạng thái: không có gì dùng được hoặc khẩu phần không hợp lệ thì `NOT_CALCULATED`; còn nguyên liệu chưa giải được hay thiếu chất bắt buộc thì `INCOMPLETE`; đủ thì `CALCULATED`. `NEEDS_REVIEW` (bản xem trước dùng dữ liệu chưa xác minh) chưa làm: engine không bao giờ dùng dữ liệu chưa xác minh.
- Hệ quả của hợp đồng với dữ liệu thật: nguyên liệu "vừa ăn" bắt buộc (`quantity` NULL, ví dụ muối, tiêu) chặn mọi tổng (`missing_quantity`). Đa số công thức sẽ `INCOMPLETE` cho tới khi editor đánh dấu các nguyên liệu đó là không bắt buộc hoặc ghi số lượng.
- **RPC (DEFINER, chỉ editor và super_admin, có `admin_audit_logs`):** `save_ingredient_nutrition(p_ingredient_id, p_food, p_status)` (nhận đúng thực phẩm chuẩn hóa từ Edge Function; lưu là xóa xác minh), `verify_ingredient_nutrition`, `save_unit_conversion` (lưu là xóa xác minh), `verify_unit_conversion`, `calculate_recipe_nutrition` (ghi kết quả mới, không bao giờ là `VERIFIED`), `verify_recipe_nutrition` (tính lại từ dữ liệu hiện tại; từ chối nếu không phải `CALCULATED`, sai phiên bản engine, hay lệch với lần tính lại).
- **STALE:** trigger trên `recipe_ingredients`, `recipes.default_servings`, `ingredient_nutrition` và `nutrition_unit_conversions` đánh dấu mọi kết quả liên quan là `STALE`, kể cả kết quả đã xác minh (khi đó nó không còn công khai).
- **RLS:** `anon` và `authenticated` đọc `recipe_nutrition` khi `VERIFIED` và công thức `published`; editor đọc mọi kết quả, mapping và quy đổi. Client không ghi được bảng nào.
- **Edge Function `nutrition-search`** (`supabase/functions/nutrition-search`): action `search_usda` (gửi POST JSON; tối đa 10 kết quả, chỉ kiểu Foundation, SR Legacy, Survey (FNDDS)) và `get_usda_food`; chỉ editor/super_admin (đọc vai trò bằng JWT của người gọi); khóa USDA trong secret, gửi qua header; hết 8 giây là `provider_timeout`; không có `DEMO_KEY`. Logic ở `contract.ts` (port từ v1, bỏ Open Food Facts), test bằng Vitest trong `admin/src/test/nutritionContract.test.ts`.

### 5.7 Quản trị (4.1, 4.2)
- `admin_audit_logs` (**đã làm ở 4.1**): `id`, `actor_id` (không FK, để còn nguyên khi tài khoản bị xóa; NULL là tác vụ hệ thống), `action` (dạng `nhóm.hành_động`, ví dụ `role.assign`), `target_table`, `target_id`, `reason` (NULL hoặc 1–500 ký tự), `details jsonb`, `created_at`. Chỉ được thêm: trigger `private.forbid_change()` chặn UPDATE và DELETE với mọi vai trò. Client không có quyền nào trên bảng (RLS bật, không có policy); chỉ đọc qua `list_admin_audit_logs()`. Các RPC ghi qua `private.audit()` (INVOKER, chỉ chạy được bên trong RPC DEFINER).
- `content_reports` (**đã làm ở 4.2**): `reporter_id` (FK `profiles` cascade), `target_table` (`comments`, `cooking_photos`), `target_id` (không FK, để báo cáo còn sau khi nội dung bị xóa), `reason` (`spam`, `offensive`, `irrelevant`, `inappropriate_image`, `copyright`, `other`; `other` bắt buộc có `details`), `details` (NULL hoặc 1–500 ký tự), `status` (`open`, `reviewing`, `resolved`, `dismissed`, default `open`), `internal_note` (NULL hoặc 1–1000), `handled_by` (FK `profiles` set null), `handled_at`, `created_at`, `updated_at`. Unique `(reporter_id, target_table, target_id)`: mỗi người báo cáo một mục một lần (`23505`).
  - Người dùng chỉ INSERT trên `(reporter_id, target_table, target_id, reason, details)`, với chính mình, cho mục **của người khác mà họ đang thấy** (policy kiểm dưới RLS của người báo cáo, nên không báo cáo được mục chờ duyệt của người khác hay mục không tồn tại). Người báo cáo **không đọc lại** được báo cáo (dòng có ghi chú nội bộ), đúng quyết định của rbac_matrix.
  - Chỉ `is_moderator()` đọc (moderator và super_admin; editor thì không). Không ai UPDATE trực tiếp: RPC `update_report_workflow(p_id, p_status, p_note)` (DEFINER, moderator, mọi chuyển trạng thái, ghi `handled_by`, `handled_at`, ghi chú nếu có, và một dòng `admin_audit_logs` `report.<trạng thái>` trong cùng giao dịch).
  - Báo cáo không xóa được qua client, nên dữ liệu test của smoke tích lại (mỗi lần chạy một báo cáo đã đóng).
- `moderation_actions` (**đã làm ở 3.6**): `id`, `actor_id` (không FK, để lịch sử còn nguyên khi tài khoản bị xóa và không bị cascade sửa), `target_table` (`comments`, `cooking_photos`), `target_id` (không FK, để lịch sử còn sau khi nội dung bị xóa), `from_status`, `to_status`, `reason` (NULL hoặc 1–500 ký tự), `created_at`. Chỉ được thêm: client không có quyền ghi, và trigger `private.forbid_change()` chặn UPDATE và DELETE với mọi vai trò, kể cả owner. Chỉ `is_moderator()` đọc được (RLS). Chỉ RPC `moderate_community_content` ghi vào bảng.

## 6. Storage

| Bucket | Public | Đường dẫn | Ghi | Migration |
|---|---|---|---|---|
| `recipe-images` | Có | `<recipe slug>/cover.webp` (seed), `<slug>/cover-<thời điểm>.<webp\|jpg\|png>` (editor) | Seed bằng secret key. Từ 4.5: editor tải ảnh mới với tên `cover-<số>` (không có UPDATE nên không ghi đè), editor xóa ảnh không còn công thức nào dùng, super_admin xóa mọi ảnh | 0001, 4.5 |
| `avatars` | Có | `<user id>/<file>` | Chủ sở hữu, trong thư mục của mình (policy trên `storage.objects`) | 1.1 (`20261111120000`) |
| `cooking-photos` | Không (signed URL) | `<user id>/<tên file>.<jpg\|png\|webp>` | Chủ sở hữu, trong thư mục của mình; không ai ghi đè file. Quyền đọc file đi theo `status` của dòng | 3.5 (`20261114054707`) |

- Giới hạn: tối đa 5 MB; chỉ nhận `image/jpeg`, `image/png`, `image/webp` (`app-in4` §7.2).
- Bucket được tạo bằng migration (insert vào `storage.buckets`), không tạo trên Dashboard (L1).
- **Policy của `cooking-photos`** (trên `storage.objects`):
  - INSERT: `authenticated`, chỉ trong thư mục `<auth.uid()>/`. Không có policy UPDATE, nên không ai thay được file phía sau một ảnh đã duyệt.
  - SELECT cho `anon`: viết thẳng trong policy, qua `exists` một dòng `approved` của công thức `published` (chạy dưới RLS của anon, không gọi hàm trợ giúp).
  - SELECT cho `authenticated`: `private.can_read_cooking_photo_object(name)` (DEFINER, `search_path=''`). Moderator đọc mọi file; chưa có dòng (đang tải lên) thì chỉ chủ thư mục; `rejected` thì không ai khác; chủ sở hữu đọc file của mình; còn lại chỉ file `approved` của công thức `published`. Hàm phải là DEFINER vì dưới RLS của tác giả, dòng `rejected` là vô hình và sẽ bị hiểu nhầm thành "đang tải lên".
  - DELETE: `private.can_delete_cooking_photo_object(name)`. Chủ thư mục chỉ xóa được file khi không còn dòng nào trỏ tới (nên tác giả không xóa được bằng chứng của ảnh bị từ chối); `is_super_admin()` xóa được mọi file.
  - Giới hạn đã biết: xóa người dùng hay công thức sẽ xóa dòng theo cascade nhưng không xóa file; file mồ côi cần một tác vụ dọn ở Phase 4.
- **Ảnh bị cách ly không được upload.** Vì `recipe-images` là public, upload một file đồng nghĩa với công khai nó. 8 ảnh bị gắn cờ `IMAGE_PENDING` (công thức #112, #125, #134, #141, #149, #208, #217, #248: watermark, ảnh chân dung người dẫn, chữ in trên bát) **không được upload**, và `cover_image_path` của các công thức đó để `NULL`. Bước 0.5 chốt danh sách từ dữ liệu và ghi log.

## 7. Ánh xạ import (`recipes_working.json` → schema)

| Nguồn | Đích | Biến đổi |
|---|---|---|
| metadata `source_id`, `source_title`, `source_publication_year` cùng `source_provenance.json` | `recipe_sources` (1 dòng) | `source_key = 'dieu-thao-2014'` |
| `categories_approved.json` | `categories` (10) | `name_vi` → `name` |
| `ingredient_dictionary.fixed.json` | `ingredients` (542) | `id` → `source_key`, `canonical_name` → `name` |
| `recipes[]` | `recipes` (250) | `status`: `ready` → `published` (236, kèm `published_at`), `needs_review` → `staged` (14); `issues` → `review_issues`; `primary_category` → `category_id` |
| `recipes[].ingredients[]` | `recipe_ingredients` (2.942) | nối `name` với `ingredients.name`. Khi `to_taste`: `quantity = NULL`, `unit = NULL` (1.024 dòng). Chuỗi rỗng → `NULL` |
| `recipes[].steps[]` | `recipe_steps` (1.166) | `duration_basis = 'unspecified'` → `NULL` (8 dòng) |
| `images/<slug>/cover.webp` | Storage `recipe-images` | trừ các ảnh bị cách ly (§6) |

Script `supabase/seed/import_recipes.mjs` (bước 0.5) upsert theo `source_key` và slug, nên chạy lại không tạo dòng mới. Script cũng kiểm tra sha256 của file zip trước khi chạy.

**Số dòng mong đợi sau import:**

| Bảng | Số dòng |
|---|---|
| `recipe_sources` | 1 |
| `categories` | 10 |
| `ingredients` | 542 |
| `recipes` | 250 (236 `published`, 14 `staged`) |
| `recipe_ingredients` | 2.942 (1.024 có `quantity` null) |
| `recipe_steps` | 1.166 (252 có `timer_enabled`, 8 có `duration_seconds` null) |
| `diets` | 0 |
| `recipe_diets` | 0 |

## 8. Khác biệt so với database cũ và v1

| Chủ đề | DB cũ / v1 | v2 | Lý do |
|---|---|---|---|
| Vai trò | `profiles.role` cùng `is_admin()` | `user_roles` cùng 3 hàm, không có `is_admin` | K5; lỗ hổng phân quyền của v1 |
| Ảnh đại diện | `avatar_path` ở DB, `avatar_url` ở app | `avatar_path` | C11: lưu đường dẫn, không lưu URL |
| Tên danh sách mua sắm | `name NOT NULL` không default (DB), `title` (app) | `name` có default | Sửa lỗi insert của Phase 3 |
| Dòng mua sắm | `ingredient_id NOT NULL`; app gửi `label` và `checked` | `ingredient_id` nullable, `label`, `is_checked` | Món tự nhập; một tên cột thống nhất |
| Danh mục | Contract import có `recipe_categories` | `recipes.category_id` | Dữ liệu chỉ có 1 danh mục mỗi công thức (L7) |
| Id | Lẫn `VARCHAR` (import) và uuid | uuid, cộng `source_key` | K3 |
| Đánh giá | Contract có `review` | Không có; dùng `comments` | `app-in4` §6.7 |
| Nguồn sách | Ẩn khỏi public | Đọc công khai | Ghi công nguồn |
| `search_path` của hàm DEFINER | `public, private, pg_temp` | `''` | K5 |
| Lịch sử schema | Dashboard và script ETL không còn lưu | Chỉ migration trong git | L1 |

## 9. Việc còn mở

| # | Việc | Khi nào | Ai quyết |
|---|---|---|---|
| O1 | Giữ video ID sau 30 ngày hay xóa (chính sách YouTube III.E.4) | 4.4 | Chủ dự án |
| O2 | ~~Chủ sở hữu đọc `bio` của mình bằng RPC hay view~~ **Đã chốt (bước 1.1): RPC `public.get_my_profile()`**, trả đúng dòng của `auth.uid()`. | Phase 1 | Agent |
| O3 | ~~Điểm trung bình đánh giá: view hay RPC~~ **Đã chốt (3.3): view `recipe_rating_summary`** (§5.3). Không cần quyền thực thi hàm, không lệch số vì không lưu sẵn | 3.3 | Agent |
| O4 | Default privileges của project v2 mới (Supabase có thể đã đổi mặc định cho bảng mới): kiểm tra thật khi viết 0001; C8 vẫn áp dụng dù kết quả thế nào | 0.4 | Agent, có log |
