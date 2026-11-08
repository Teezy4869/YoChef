# YoChef v2: Schema chuẩn (SCHEMA_V2)

**Trạng thái:** thiết kế (bước 0.3). Chưa có migration nào được áp. Tài liệu này là **nguồn sự thật duy nhất** về schema: migration viết theo nó, và khi migration buộc phải khác, tài liệu được sửa trong cùng commit.
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
| 22 | `content_reports`, `moderation_actions` | 4.2 | 4 | Không |

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
- Editor đọc mọi trạng thái: thêm ở 4.1.

**Index:** `(status, category_id)`, `category_id`.

**Tìm kiếm tiếng Việt (Phase 2):** thêm cột `search_text` (chữ thường, bỏ dấu) do trigger cập nhật, cùng RPC `search_recipes` dạng `SECURITY INVOKER`. `unaccent()` của PostgreSQL là `STABLE`, không phải `IMMUTABLE` như tài liệu v1 ghi, nên không dùng được trong generated column hay index biểu thức. Trigger thì dùng được. Với 250 công thức, quét tuần tự là đủ nhanh, chưa cần index trigram.

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
- Gán và thu hồi vai trò qua RPC `manage_user_role` (super_admin, có audit) ở lát cắt 4.1, kèm trigger chặn xóa super_admin cuối cùng.
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

### 5.1 `favorites` (3.1)
- PK `(user_id, recipe_id)`, cùng `created_at`. FK `profiles` và `recipes`, cả hai cascade.
- **RLS:** chủ sở hữu SELECT, INSERT, DELETE. INSERT chỉ được khi công thức đang `published`.

### 5.2 `shopping_lists` và `shopping_list_items` (3.2)
`shopping_lists`:
- `id`, `user_id` (FK `profiles` cascade).
- `name` (not null, default `'Danh sách mua sắm'`, 1–100 ký tự).
- `source_recipe_id` (FK `recipes` on delete set null).
- `created_at`, `updated_at`.

`shopping_list_items`:
- `id`, `shopping_list_id` (FK cascade, có index).
- `ingredient_id`: nullable, FK `ingredients` on delete set null. Nullable vì người dùng có thể tự nhập món.
- `label`: not null, 1–100 ký tự, là bản chụp tên lúc thêm.
- `quantity` (numeric > 0, null nghĩa là "vừa ăn"), `unit`, `note`.
- `is_checked` (default false), `sort_order` (default 0), `created_at`, `updated_at`.

**RLS:** danh sách thuộc chủ sở hữu (`user_id = auth.uid()`); item kiểm tra qua `exists` danh sách cha.

**Sửa đúng các lỗi của DB cũ:**
- `name` có default, vì app tạo danh sách mà không gửi tên.
- `ingredient_id` nullable, vì món tự nhập không có nguyên liệu tương ứng.
- Dùng một tên thống nhất là `name`, cùng kiểu với `recipes.name`, thay vì để `title` ở app và `name` ở database.

### 5.3 `ratings` (3.3)
- `id`, `user_id`, `recipe_id`; unique `(user_id, recipe_id)`.
- `score` smallint 1–5, `created_at`, `updated_at`.
- **Không có cột `review`.** `app-in4` §6.7 quy định chỉ có một thực thể Comment, nên phần nhận xét bằng chữ thuộc về `comments`.
- **RLS:**
  - SELECT công khai khi công thức `published`.
  - Chủ sở hữu INSERT và UPDATE với `user_id = auth.uid()`.
  - Chủ sở hữu hoặc super_admin được DELETE.
- Điểm trung bình được tính bằng view hoặc RPC, chốt ở 3.3.

### 5.4 `comments` (3.4) và `cooking_photos` (3.5)
Cột chung: `id`, `user_id`, `recipe_id` (cascade), `status` (`pending`,`approved`,`rejected`, default `pending`), `created_at`, `updated_at`.

Cột riêng:
- `comments`: `content` (1–1000 ký tự).
- `cooking_photos`:
  - `storage_path` unique, phải bắt đầu bằng `<user_id>/`;
  - `caption` (≤ 250 ký tự).

Trigger (INVOKER, `search_path=''`):
- client luôn tạo nội dung ở trạng thái `pending`;
- chủ sở hữu không được đổi `status`;
- sửa nội dung đã `approved` sẽ đưa nó về lại `pending`.

RLS theo `phase4_03`:

| Role | Được đọc |
|---|---|
| `anon` | `approved` của công thức `published` |
| `authenticated` | như trên, cộng nội dung của chính mình chưa bị `rejected`, cộng mọi nội dung nếu là `is_moderator()` |

Chủ sở hữu được sửa hoặc xóa nội dung của mình khi nó chưa bị `rejected`.

Cột duyệt (`moderated_by`, `moderated_at`) và RPC `moderate_community_content` thêm ở 4.2.

### 5.5 `recipe_videos` (4.4)
- `id`, `recipe_id` (cascade).
- `youtube_video_id`: check khớp `^[A-Za-z0-9_-]{11}$`; unique `(recipe_id, youtube_video_id)`.
- `title`, `channel_title`.
- `is_primary`: unique partial index cho phép tối đa 1 video chính mỗi công thức.
- `verification_status` (`unverified`,`verified`,`unavailable`), `unavailable_reason`, `last_verified_at`, `refresh_failures`.
- `created_at`, `updated_at`.

**Public chỉ đọc** video thỏa cả bốn điều kiện: là video chính, đã `verified`, `last_verified_at > now() - 30 days`, và công thức đang `published`.

Client không có quyền ghi; ghi qua RPC `assign_recipe_video` kèm biên nhận xác minh. **Vẫn còn câu hỏi pháp lý dành cho chủ dự án:** có được giữ lại video ID sau 30 ngày hay không.

### 5.6 Dinh dưỡng (4.3), phác thảo
- `ingredient_nutrition`:
  - giá trị: `ingredient_id`, `basis` (`per_100g` hoặc null), `energy_kcal`, `protein_g`, `fat_g`, `carbs_g`, `sodium_mg`, `saturated_fat_g`, `fiber_g`, `sugar_g`. Tất cả nullable và ≥ 0;
  - nguồn gốc: `provider`, `external_id`, `description`, `preparation_state`, `data_type`, `source_version`, `retrieved_at`;
  - trạng thái: `mapping_status` (`UNMAPPED`,`CANDIDATE`,`NEEDS_REVIEW`,`VERIFIED`,`UNAVAILABLE`), `verified_by`, `verified_at`.
- `nutrition_unit_conversions`:
  - `ingredient_id` nullable; null nghĩa là quy tắc chung;
  - `unit`, `grams_per_unit` > 0, `source`, `method`, `verified_by`, `verified_at`;
  - unique `(ingredient_id, unit) nulls not distinct` (PostgreSQL ≥ 15), để mỗi đơn vị chỉ có một quy tắc chung.
- `recipe_nutrition`:
  - PK `recipe_id`;
  - `calculation_version`, `status` (`NOT_CALCULATED`,`INCOMPLETE`,`CALCULATED`,`NEEDS_REVIEW`,`VERIFIED`,`STALE`);
  - tổng và mỗi phần ăn của 8 chất, `completeness`, `reason_codes` text[], `calculated_at`, `verified_by`, `verified_at`.

Quy tắc chi tiết nằm trong `phase4_08_nutrition_data_contract.md`. Public chỉ đọc kết quả `VERIFIED` của công thức `published`.

**Lưu ý dữ liệu:** đơn vị chưa chuẩn hóa. Bộ dữ liệu có cả `thìa`, `thìa canh` và `thìa to`, tổng cộng 45 đơn vị khác nhau. Bảng quy đổi phải xử lý từng đơn vị, không được giả định.

### 5.7 Quản trị (4.1, 4.2), phác thảo
- `admin_audit_logs`: chỉ được thêm, không sửa; ghi `actor_id`, `action`, `target_table`, `target_id`, `reason`, `details jsonb`, `created_at`. Chỉ đọc qua RPC của super_admin.
- `content_reports`: người dùng báo cáo comment hoặc photo.
- `moderation_actions`: lịch sử duyệt, không sửa được.

## 6. Storage

| Bucket | Public | Đường dẫn | Ghi | Migration |
|---|---|---|---|---|
| `recipe-images` | Có | `<recipe slug>/cover.webp` | Phase 0: chỉ script seed (secret key). 4.5: editor | 0001 |
| `avatars` | Có | `<user id>/<file>` | Chủ sở hữu, trong thư mục của mình | Phase 1 |
| `cooking-photos` | Không (signed URL) | `<user id>/<uuid>.<ext>` | Chủ sở hữu; quyền đọc file đi theo `status` của dòng | 3.5 |

- Giới hạn: tối đa 5 MB; chỉ nhận `image/jpeg`, `image/png`, `image/webp` (`app-in4` §7.2).
- Bucket được tạo bằng migration (insert vào `storage.buckets`), không tạo trên Dashboard (L1).
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
| O2 | Chủ sở hữu đọc `bio` của mình bằng RPC hay view | Phase 1 | Agent |
| O3 | Điểm trung bình đánh giá: view hay RPC | 3.3 | Agent |
| O4 | Default privileges của project v2 mới (Supabase có thể đã đổi mặc định cho bảng mới): kiểm tra thật khi viết 0001; C8 vẫn áp dụng dù kết quả thế nào | 0.4 | Agent, có log |
