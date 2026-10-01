# Agent Instructions Guide

Hướng dẫn sử dụng hệ thống instruction cho YoChef project.

## Tổng Quan Hệ Thống

```
YoChef/
├── AGENTS.md                    # Root - Đọc TRƯỚC TIÊN
├── .agents/
│   ├── rules/                  # Quy tắc dự án
│   ├── workflows/              # Quy trình thực hiện
│   └── AGENTS-GUIDE.md         # File này
└── docs/                      # Tài liệu chi tiết
```

## Thứ Tự Đọc

### Khi Bắt Đầu Một Task Mới

1. **`AGENTS.md`** (root) - Đọc trước khi làm bất cứ điều gì
2. **`App in4.md`** - Nguồn thông tin chính về dự án
3. **Rules liên quan** - Đọc các rule liên quan đến task
4. **Workflow liên quan** - Đọc workflow phù hợp

### Khi Cần Thông Tin Chi Tiết

- **Architecture** → `docs/architecture/`
- **API** → `docs/api/`
- **Database** → `docs/database/`
- **Development** → `docs/development/`
- **Testing** → `docs/testing/`
- **Deployment** → `docs/deployment/`

## Cấu Trúc Rules (`.agents/rules/`)

### 1. `core.md` - Nguyên Tắc Cơ Bản

**Luôn tuân thủ:**
- Inspect trước khi modify
- Search trước khi tạo mới
- Thay đổi tối thiểu
- Tái sử dụng abstractions có sẵn
- Không thay đổi không liên quan
- Evidence over assumptions
- Verification rõ ràng
- Không bịa đặt kết quả

### 2. `architecture.md` - Kiến Trúc

**Quy tắc kiến trúc:**
- Frontend → Backend (REST API)
- Backend → PostgreSQL
- Backend → Supabase Storage
- Backend → YouTube API
- **Cấm**: Frontend → PostgreSQL trực tiếp

### 3. `coding-style.md` - Quy ước Code

| Loại | Quy ước | Ví dụ |
|------|---------|--------|
| Components | PascalCase | `RecipeDetail.jsx` |
| Functions | camelCase | `getRecipeById()` |
| Variables | camelCase | `recipeId` |
| Database | snake_case | `recipe_id` |
| API paths | kebab-case | `/api/recipes` |

### 4. `testing.md` - Testing

- Tests cần thiết cho bug fixes và features mới
- Regression tests bắt buộc
- Không claim tests pass nếu không chạy

### 5. `security.md` - Bảo Mật

**NEVER:**
- Commit secrets
- Hard-code credentials
- Log sensitive data

**ALWAYS:**
- Environment variables cho secrets
- `.env.example` để document
- Validate input server-side

### 6. `git.md` - Git Workflow

```
main (stable)
  ├── feat/recipe
  ├── feat/search
  └── feat/community
```

**Quy tắc:**
- Không push trực tiếp lên `main`
- Feature branches cho mỗi feature
- PR required cho mọi merge

### 7. `documentation.md` - Documentation

Cập nhật docs khi:
- Architecture thay đổi
- API thay đổi
- Database schema thay đổi
- Testing thay đổi
- Deployment thay đổi

### 8. `dependencies.md` - Dependencies

**Cần approval trước khi thêm:**
- New packages
- New technologies
- Thay đổi tech stack

## Cấu Trúc Workflows (`.agents/workflows/`)

### Feature Workflow

```
Understand → Inspect → Identify → Plan → Implement → Test → Review → Report
```

**Khi nào dùng:** Implement feature mới

### Bug Fix Workflow

```
Reproduce → Collect Evidence → Identify Root Cause → Implement → Test → Report
```

**Khi nào dùng:** Fix bug hoặc defect

### Debugging Workflow

```
Reproduce → Capture Error → Identify Boundary → Form Hypothesis → Test → Apply Fix → Verify
```

**Khi nào dùng:** Investigate errors hoặc unexpected behavior

### Refactor Workflow

```
Understand → Identify Tests → Define Change → Refactor Incrementally → Verify
```

**Khi nào dùng:** Cải thiện code structure không thay đổi behavior

### Code Review Workflow

```
Read Description → Review Diff → Run Code → Provide Feedback
```

**Khi nào dùng:** Review pull requests

### Testing Workflow

```
Select Tests → Run Tests → Diagnose Failures → Report Results
```

**Khi nào dùng:** Verify changes

### Release Workflow

```
Review Changes → Validate → Update Version → Inspect Diff → Release
```

**Khi nào dùng:** Prepare release

## Documentation Map (`docs/`)

### Architecture (`docs/architecture/`)

| File | Nội dung |
|------|----------|
| `overview.md` | System overview, subsystems |
| `system-context.md` | Users, external services |
| `component-architecture.md` | Components, dependencies |
| `data-flow.md` | Data flows |
| `decisions/` | Architecture decisions |

### API (`docs/api/`)

| File | Nội dung |
|------|----------|
| `README.md` | API overview |
| `endpoints.md` | Endpoint documentation |
| `error-codes.md` | Error codes |

### Database (`docs/database/`)

| File | Nội dung |
|------|----------|
| `README.md` | Database overview |
| `schema.md` | Schema documentation |
| `relationships.md` | Entity relationships |
| `migrations.md` | Migration guidelines |
| `seed-data.md` | Seed data |

### Development (`docs/development/`)

| File | Nội dung |
|------|----------|
| `setup.md` | Setup instructions |
| `commands.md` | Common commands |
| `environment.md` | Environment variables |
| `troubleshooting.md` | Common issues |

### Testing (`docs/testing/`)

| File | Nội dung |
|------|----------|
| `strategy.md` | Test strategy |
| `test-cases.md` | Important test cases |
| `troubleshooting.md` | Testing issues |

### Deployment (`docs/deployment/`)

| File | Nội dung |
|------|----------|
| `overview.md` | Deployment overview |
| `development.md` | Dev deployment |
| `production.md` | Production deployment |

## Boundary Rules

### ALWAYS

- Inspect before modifying
- Search before creating
- Follow naming conventions
- Use environment variables
- Validate input server-side
- Run tests before reporting
- Keep business logic in backend

### ASK FIRST

- Database schema changes
- Adding new dependencies
- Authentication/authorization changes
- Public API changes
- Major refactoring
- Destructive operations

### NEVER

- Push directly to `main`
- Commit secrets
- Hard-code credentials
- Disable security controls
- Claim verified without evidence
- Fabricate missing information
- Use Elasticsearch (PostgreSQL sufficient)
- Use TikTok API (out of scope)
- Create "Dish" entity (Recipe is top-level)

## Project Constraints

### MVP Features (In Scope)

1. User Authentication
2. Search / Browse Recipe
3. View Recipe Detail
4. View Ingredients
5. Customize Servings
6. View Nutrition
7. Cooking Mode
8. Cooking Timer
9. Favorite Recipe
10. Rating & Comment
11. Cooking Photo
12. Shopping List
13. YouTube Reference Video

### Out of Scope

- TikTok API
- Social network/feed
- Follow/Friend system
- Private/group chat
- Stories
- Full video platform
- E-commerce system
- Online payment
- Elasticsearch
- AI services

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React Native |
| Backend | Node.js + Express.js |
| Database | PostgreSQL |
| Auth | JWT + bcrypt |
| Storage | Supabase Storage |
| Video | YouTube Data API |
| Search | PostgreSQL Full-Text Search |

## Verification Checklist

Trước khi report completion:

```
[ ] Code implemented correctly
[ ] Naming conventions followed
[ ] Tests added/updated
[ ] Tests pass (actually ran)
[ ] No secrets committed
[ ] No out-of-scope features
[ ] Documentation updated
[ ] No unrelated changes
```

## Quick Reference

### Tìm kiếm information

1. **Tech stack** → `AGENTS.md` Section 3
2. **Architecture** → `docs/architecture/`
3. **API** → `docs/api/`
4. **Database** → `docs/database/`
5. **Commands** → `docs/development/commands.md`

### Khi cần approval

1. Database changes
2. New dependencies
3. Security changes
4. API contract changes
5. Major refactoring

### Khi gặp bug

1. Reproduce bug
2. Collect evidence
3. Identify root cause
4. Apply minimal fix
5. Add regression test
6. Verify fix

### Khi implement feature

1. Understand requirement
2. Check MVP scope
3. Inspect existing code
4. Design minimal change
5. Implement
6. Test
7. Review
8. Report
