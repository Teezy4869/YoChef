# YoChef

Ứng dụng nấu ăn món Việt: tra cứu công thức chuẩn, tùy chỉnh khẩu phần, hỗ trợ nấu từng bước kèm hẹn giờ thông minh, quản lý danh sách đi chợ và tương tác cộng đồng. Dự án gồm ứng dụng di động và trang quản trị web.

---

## 🛠 Công nghệ sử dụng

- **Mobile App (`mobile/`)**: Expo SDK 58, React Native 0.88.1, React 19.3, React Navigation 7, TypeScript.
- **Admin Web (`admin/`)**: React 18, Vite 6, React Router 7, Tailwind CSS 3.
- **Backend (`supabase/`)**: Supabase (PostgreSQL 17, Auth, Storage, Edge Functions).

---

## 📋 Yêu cầu môi trường

- **Node.js** >= 22
- **npm** >= 11

---

## 🚀 Cài đặt & Cấu hình

### 1. Cài đặt dependencies

Cài đặt toàn bộ dependencies cho dự án gốc, mobile app và admin web:

```bash
npm run install:all
```

### 2. Thiết lập biến môi trường

Tạo file `.env` từ các template có sẵn:

```bash
cp mobile/.env.example mobile/.env
cp admin/.env.example admin/.env
```

Cập nhật thông tin Supabase (`URL` và `Publishable Key`) vào cả hai file:

- `mobile/.env`: `EXPO_PUBLIC_SUPABASE_URL` và `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `admin/.env`: `VITE_SUPABASE_URL` và `VITE_SUPABASE_PUBLISHABLE_KEY`

---

## 💻 Hướng dẫn chạy ứng dụng

### 1. Chạy Mobile App

```bash
npm --prefix mobile start
```

- Quét mã QR bằng ứng dụng **Expo Go** trên điện thoại.
- Hoặc nhấn `a` để mở trên Android Emulator, `i` trên iOS Simulator, `w` trên trình duyệt web.

### 2. Chạy Admin Web

```bash
npm --prefix admin run dev
```

Truy cập giao diện quản trị tại: `http://localhost:5173`

---

## 🧪 Kiểm tra mã nguồn (Tests & Checks)

- **Kiểm tra toàn bộ (Typecheck + Lint + Tests)**:
  ```bash
  npm run check
  ```
- **Kiểm tra riêng thư mục mobile**:
  ```bash
  npm --prefix mobile run typecheck
  npm --prefix mobile run lint
  npm --prefix mobile test
  ```
- **Kiểm tra database migrations**:
  ```bash
  npm run test:db
  ```
