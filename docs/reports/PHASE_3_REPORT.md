# Phase 3: tính năng người dùng

**Ngày:** 2026-11-14 · **Project v2:** `bdhphjwhagygbwtfhhxn` · **Kết luận:** 6 migration của Phase 3 đã lên v2, schema v2 giống hệt schema dựng từ migration, `smoke:user` **100/100 ALL PASS** với 3 tài khoản thật (A, B và moderator M). Ba smoke cũ vẫn xanh. **Còn thiếu cho DoD:** chủ dự án kiểm trên máy thật (§5), gồm việc ảnh tải lên không còn EXIF/GPS.

Kế hoạch đã duyệt: `~/.claude/plans/inherited-whistling-papert.md` (D1–D9). Nguồn yêu cầu: `docs/database/SCHEMA_V2.md` §5.1–5.4, §5.7, §6 và gói `YoChef_born_again/20_phase_specs/phase-3/`.

## 1. Các bước

Mỗi bước một nhánh `phase-3/3.N-…`, merge fast-forward vào `main`. Mỗi bước có một commit tính năng và một commit bằng chứng sau khi chạy trên v2.

| Bước | Commit | Nội dung | Trên v2 |
|---|---|---|---|
| 3.0 | `0cb3ed8` | Fake Supabase có bảng người dùng, `SignInPrompt` dùng chung, script `smoke:user` | Không có migration |
| 3.1 Yêu thích | `2000041`, `658c1c1` | Bảng `favorites`, nút tim, tab Yêu thích | `20261113234830` |
| 3.1b | `12bd29b` | Ghim mọi lệnh database vào v2 (`scripts/lib/v2.mjs`, `npm run db:*`), thêm `db:verify` so schema thật với migration, app và smoke từ chối project cũ | Không có migration |
| 3.2 Đi chợ | `69be0de`, `d596682` | `shopping_lists`, `shopping_list_items`, tab Đi chợ, "Thêm vào đi chợ (N người)" | `20261114041322` |
| 3.3 Đánh giá | `7eb9f1c`, `2c10808` | `ratings`, view `recipe_rating_summary`, 5 sao trên trang chi tiết | `20261114045322` |
| 3.4 Bình luận | `407b6f6`, `01912f7` | `comments`, trigger `reset_status_on_edit`, mục bình luận | `20261114051346` |
| 3.5 Ảnh nấu ăn | `6e7b5ff`, `7f96842`, `53eeded` | Bucket private `cooking-photos`, `cooking_photos`, policy Storage, chụp/chọn và mã hóa lại ảnh | `20261114054707` |
| 3.6 Duyệt tối thiểu | `05d4cb5`, `a7a8cc9` | `moderation_actions`, RPC `moderate_community_content`, cột duyệt ẩn với client, màn "Duyệt nội dung" | `20261114060039` |
| 3.7 Gate | (commit này) | Chạy lại mọi tầng kiểm thử, báo cáo này, HANDOVER | — |

## 2. Thay đổi

### Database (chi tiết ở `SCHEMA_V2.md` §5.1–5.4, §5.7, §6)
| Migration | Bảng / đối tượng | Điểm chính |
|---|---|---|
| `20261113234830_phase3_favorites` | `favorites` | PK `(user_id, recipe_id)`; chỉ thêm được công thức `published`; chỉ chủ sở hữu đọc và xóa |
| `20261114041322_phase3_shopping_lists` | `shopping_lists`, `shopping_list_items` | Grant theo cột: không đổi được chủ của danh sách hay danh sách của một dòng; quyền của dòng kiểm qua danh sách cha |
| `20261114045322_phase3_ratings` | `ratings`, view `recipe_rating_summary` | Điểm 1–5, mỗi người một điểm; trung bình là view `security_invoker` (O3), chưa ai chấm thì không có dòng (không phải 0) |
| `20261114051346_phase3_comments` | `comments`, `private.reset_status_on_edit()` | Client không có quyền trên `status` nên mọi bình luận mới đều chờ duyệt; sửa bình luận đã duyệt thì quay về chờ duyệt |
| `20261114054707_phase3_cooking_photos` | Bucket `cooking-photos`, `cooking_photos`, 2 hàm DEFINER, 4 policy Storage | Bucket private 5 MB; file chỉ trong thư mục của mình; không ai ghi đè file; quyền đọc file đi theo trạng thái duyệt; tác giả không xóa được file khi dòng còn |
| `20261114060039_phase3_moderation` | `moderation_actions`, `public.moderate_community_content()`, `private.forbid_change()` | RPC là cách duy nhất đổi trạng thái; lịch sử chỉ được thêm (trigger chặn sửa, xóa với mọi vai trò), chỉ moderator đọc; `moderated_by`, `moderated_at` ẩn với client |

Sau Phase 3, v2 có 10 migration, 18 bảng, 3 bucket, 47 policy, 14 hàm (`docs/evidence/phase-3/db_verify.log`).

### App (`app/src`)
| Khu vực | Thay đổi |
|---|---|
| `features/favorites/` | `favoritesApi`, `FavoritesProvider` (hiện thay đổi ngay, hoàn lại nếu lưu lỗi), `FavoriteButton` |
| `features/shopping/` | `shoppingApi`, `useShoppingList`, `AddToShoppingButton`. Số lượng lưu đúng như trang công thức đang hiện (quy tắc A2) |
| `features/ratings/` | `ratingsApi`, `RatingSection` |
| `features/community/` | `commentsApi`, `CommentSection`; `cookingPhotosApi`, `pickCookingPhoto`, `CookingPhotoSection` |
| `features/moderation/` | `moderationApi`, `ModerationEntry` (nút trong tab Tài khoản, chỉ hiện với moderator và super_admin) |
| `screens/` | `FavoritesScreen`, `ShoppingScreen`, `ModerationScreen`; `RecipeDetailScreen` thêm tim, đi chợ, đánh giá, ảnh, bình luận |
| `app/navigation/` | Tab Yêu thích và Đi chợ; route `Moderation` (chỉ khi đã đăng nhập) |
| `components/SignInPrompt.tsx` | Mới, dùng chung cho các màn cần đăng nhập |
| `app.json` | Bật quyền camera của `expo-image-picker`, có lời giải thích tiếng Việt |

Dependency: chỉ thêm `expo-image-manipulator` **58.0.16** (commit riêng `6e7b5ff`, ghim chính xác, bản do `expo install` chọn cho SDK 58).

### Công cụ và test
| File | Thay đổi |
|---|---|
| `scripts/live_user_smoke.mjs`, `npm run smoke:user` | 100 kiểm tra với 3 tài khoản thật, chỉ dùng publishable key; tự dọn dữ liệu của mình, kể cả phần sót lại từ lần chạy lỗi trước |
| `scripts/lib/v2.mjs`, `scripts/sb.mjs`, `scripts/db_verify.mjs`, `scripts/schema_fingerprint.sql` | Ghim v2 cho mọi lệnh database; `db:verify` so schema thật với migration |
| `supabase/tests/phase3.test.mjs` | 43 test PGlite (6 + 7 + 6 + 8 + 9 + 7) |
| `supabase/tests/phase0.test.mjs` | Bất biến "authenticated chỉ ghi được bảng của người dùng" có danh sách cho phép, lớn dần theo từng bước; TRUNCATE vẫn cấm |
| `app/__tests__/` | Thêm `favorites`, `shopping`, `ratings`, `comments`, `cookingPhotos`, `moderation`; Jest từ 123 lên **169** test |

## 3. Kết quả đã chạy (Gate, 2026-11-14)

| Tầng | Lệnh | Kết quả | Log |
|---|---|---|---|
| 1 | `npm run check` | exit 0; app **169/169**, admin 1/1, typecheck và lint sạch | `docs/evidence/phase-3/gate_check.log` |
| 2 | `npm run test:db` | **98/98** (có zip dữ liệu, phần seed đã chạy) | `gate_test_db.log` |
| 3 | `npm run smoke:user` | **100/100 ALL PASS**: tài khoản 4, yêu thích 10, đi chợ 16, đánh giá 17, bình luận 15, ảnh 16, duyệt 22 | `live_user_smoke.log` |
| 3 | `smoke:live` / `smoke:recipes` / `smoke:auth` | **19/19**, **26/26**, **26/26** ALL PASS | `gate_smoke_live.log`, `gate_smoke_recipes.log`, `gate_smoke_auth.log` |
| Schema | `npm run db:list` / `npm run db:verify` | Local và remote khớp 10/10; **SCHEMA MATCHES** | `v2_state.log`, `db_verify.log` |
| Advisors | `npm run db:advisors` | 5 cảnh báo, đều đã chấp nhận (§4.2); không có cảnh báo ở mức lỗi | `gate_advisors.json` |

Ba smoke cũ được chạy với đúng script và file env như lệnh `npm`, nhưng ghi log vào `docs/evidence/phase-3/gate_*.log` để không ghi đè bằng chứng của Phase 0–2.

## 4. Quyết định và chỗ lệch kế hoạch

### 4.1 Quyết định trong lúc làm
| # | Quyết định | Lý do |
|---|---|---|
| 1 | **`moderated_by` và `moderated_at` ẩn với client** (3.6). SELECT trên `comments` và `cooking_photos` chuyển sang grant theo cột | Để lộ thì ai cũng biết tài khoản nào là moderator, trong khi `user_roles` là riêng tư. Lịch sử đầy đủ nằm ở `moderation_actions`, chỉ moderator đọc. Hệ quả: client phải nêu rõ cột, `select=*` bị từ chối. App vốn nêu rõ cột; smoke 3.4 và 3.5 đã sửa theo |
| 2 | `moderation_actions.actor_id` và `target_id` **không có FK** | Lịch sử phải còn nguyên khi tài khoản hoặc nội dung bị xóa, và không bị cascade sửa (bảng chỉ được thêm) |
| 3 | Tên file ảnh là `<user id>/<thời điểm>-<chuỗi ngẫu nhiên>.jpg` thay vì `<uuid>.jpg` | Hermes không chắc có `crypto.randomUUID`; thêm thư viện chỉ để tạo uuid là không cần. Tải lên với `upsert: false`, nên trùng tên thì báo lỗi chứ không ghi đè |
| 4 | Xóa bình luận và ảnh **xác nhận ngay tại chỗ**, không dùng `Alert` | `Alert.alert` có nút không chạy trên bản web |
| 5 | Bình luận kiểm "không chỉ có khoảng trắng" bằng `content ~ '\S'` | `btrim` chỉ bỏ dấu cách, nên một bình luận toàn xuống dòng sẽ lọt |
| 6 | Embed tác giả ghi rõ tên FK (`profiles!comments_user_id_fkey`) ngay từ 3.4 | Khi 3.6 thêm `moderated_by` (cũng trỏ tới `profiles`), embed không bị nhập nhằng |

### 4.2 Cảnh báo advisors đã chấp nhận
| Cảnh báo | Lý do chấp nhận |
|---|---|
| `get_my_profile()` là DEFINER mà `authenticated` gọi được | Từ Phase 1 (O2): hàm chỉ trả dòng của chính người gọi |
| `moderate_community_content()` là DEFINER mà `authenticated` gọi được | Phải là DEFINER vì client không có quyền ghi `status`; hàm báo `42501` trừ khi `is_moderator()`; `anon` không gọi được |
| `multiple_permissive_policies` trên `comments` và `cooking_photos` (hiệu năng) | PostgreSQL gộp các policy permissive bằng OR, nên gộp tay cũng chạy cùng biểu thức; policy công khai phải tách riêng vì `anon` không có quyền trên schema `private` |
| `auth_leaked_password_protection` tắt | Cấu hình Auth của project, không thuộc migration; chủ dự án quyết |

### 4.3 Phần chưa làm, có chủ đích
- Không có giao diện **sửa chú thích ảnh**: database hỗ trợ, app chỉ có đăng và xóa.
- Thẻ công thức chưa có nút tim (D9); tim chỉ ở trang chi tiết và tab Yêu thích.
- `content_reports` (báo cáo vi phạm), `admin_audit_logs` và duyệt trên admin web để lại Phase 4 (D6).

## 5. Kiểm trên máy thật (chủ dự án)

Phase 3 có dependency native mới (`expo-image-manipulator`) và quyền camera mới trong `app.json`. Nếu dùng development build thì phải **build lại**; Expo Go có sẵn module này.

1. **Yêu thích:** bấm tim ở một công thức, mở tab Yêu thích thấy món đó, bỏ tim thì món biến mất. Đăng xuất: tab Yêu thích mời đăng nhập.
2. **Đi chợ:** ở công thức 4 người chọn 6 người, bấm "Thêm vào đi chợ (6 người)". Số lượng trong tab Đi chợ phải giống hệt trang công thức (ví dụ "2⅓"). Đánh dấu vài dòng, "Xóa các món đã mua", thêm một dòng tự nhập.
3. **Đánh giá:** chấm 4 sao, đổi sang 5, rồi "Xóa đánh giá của tôi". Trung bình và số lượt đổi theo.
4. **Bình luận:** gửi một bình luận, thấy nhãn "Đang chờ duyệt". Sửa, rồi xóa (có hỏi xác nhận). Đăng xuất: không thấy bình luận đang chờ.
5. **Ảnh:** bấm "Chụp ảnh". Máy hỏi quyền camera **một lần**, có lời giải thích tiếng Việt. Chụp, thêm chú thích, "Đăng ảnh": thấy ảnh có nhãn "Đang chờ duyệt". Làm lại với "Chọn từ thư viện". Xóa một ảnh.
6. **EXIF/GPS (D8):** bật định vị cho camera, chụp và đăng một ảnh. Trên Dashboard → Storage → `cooking-photos` → thư mục của bạn, tải file vừa đăng về. Mở Properties → Details (Windows) hoặc chạy `exiftool`: **không được có** vị trí GPS, hãng hay đời máy. Nếu vẫn còn thì bước 3.5 phải đổi cách mã hóa.
7. **Duyệt:** đăng nhập bằng M. Tab Tài khoản có nút "Duyệt nội dung", thấy bình luận và ảnh của bước 4 và 5 (nếu chưa xóa). Duyệt một mục: đăng xuất rồi xem công thức với tư cách khách thì thấy mục đó. Từ chối một mục: tài khoản tác giả không còn thấy mục đó. Với tài khoản không phải moderator thì không có nút.

Phase 2 vẫn còn chờ kiểm 2.6–2.12 trên máy thật (`docs/reports/PHASE_2_CHANGES.md` §4), nên chưa có tag `phase-2-complete`.

## 6. Điểm chưa hợp lý, cần bạn biết

1. **File ảnh mồ côi:** xóa người dùng hoặc công thức sẽ xóa dòng `cooking_photos` theo cascade nhưng để lại file trong bucket. Cần một tác vụ dọn ở Phase 4. Tương tự, nếu xóa dòng thành công mà xóa file lỗi (mạng rớt), file còn lại mà không ai thấy.
2. **Signed URL hết hạn sau 1 giờ:** để trang công thức mở quá 1 giờ thì ảnh hỏng cho tới khi mở lại trang.
3. **Hàng chờ duyệt tối đa 50 mục mỗi loại**, cũ nhất trước. Duyệt xong thì mục tiếp theo hiện ra; không có phân trang.
4. **"Xem thêm" của bình luận và ảnh tải lại từ đầu** tới số mục đang xem (20, 40… bình luận; 12, 24… ảnh). Đơn giản và không bị trùng hay sót khi có mục mới, nhưng tốn băng thông nếu xem rất nhiều trang.
5. **Smoke để lại lịch sử duyệt trên v2:** mỗi lần chạy `smoke:user` thêm 6 dòng vào `moderation_actions`, trỏ tới bình luận và ảnh đã bị xóa. Đây là thiết kế (lịch sử không xóa được); các dòng này mang tài khoản M.
6. **Màn "Duyệt nội dung" trong app là giải pháp tạm** (D6). Phase 4.2 chuyển việc duyệt sang admin web, kèm báo cáo vi phạm.
7. **Super admin đầu tiên (D7) chưa được xác nhận:** smoke không cần vai trò này, nên mình không kiểm. Khi cần, chủ dự án chạy SQL trong SQL Editor với email của mình (HANDOVER §8).
8. **EXIF chưa được kiểm** (§5 mục 6): mã hóa lại ảnh thường bỏ metadata, nhưng điều này chưa được chứng minh trên máy thật.
9. **`main` chưa push:** 16 commit của Phase 3 (gồm commit báo cáo này) mới chỉ ở máy local.
