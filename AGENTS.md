# YoChef Cooking App — Agent Operating Guide

## 1. Purpose

This file is the repository-level operating guide for coding agents working on YoChef (Cooking App).

It exists to:
- Orient the agent before repository work begins
- Route the agent to the correct source of truth
- Summarize project-wide invariants
- Define the expected engineering workflow
- Provide command and verification guidance

---

## 2. Project Snapshot

YoChef is a mobile cooking app that helps users discover recipes, cook with step-by-step guidance, and share their cooking experiences.

**Core concept:**
```
Recipe → Cooking Experience
```

**MVP Scope:**
```
Search → Recipe → Prepare → Cook → Community → Shopping List
```

---

## 3. Technology Baseline

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | React Native | Mobile user interface |
| Build Tool | Metro | Mobile app bundling and build |
| Routing | React Navigation | In-app screen navigation |
| HTTP Client | Axios | API communication |
| Backend | Node.js + Express.js | REST API and business logic |
| Database | PostgreSQL | Structured relational data |
| Authentication | JWT + bcrypt | Login, authorization, password hashing |
| Image Storage | Supabase Storage | User cooking photos |
| External Video | YouTube Data API | Reference cooking videos |
| Nutrition Data | Vietnam Food Composition Tables + USDA FoodData Central | Ingredient nutrition data |
| Search | PostgreSQL Full-Text Search / ILIKE | Recipe search |
| Cooking Timer | JavaScript / React | Client-side cooking timer |

**No Elasticsearch for MVP.** PostgreSQL search is sufficient for expected scale.

---

## 4. Domain Model

```
                    RECIPE
                       │
       ┌───────────┬────┼────────┬───────────┐
       │           │    │        │           │
       ▼           ▼    ▼        ▼           ▼
    Ingredient   Nutrition Rating  Comment   Favorite
       │
       ├── Customize Servings
       └── Shopping List

                    RECIPE
                       │
                       ▼
                 Cooking Photo

                    RECIPE
                       │
                       ▼
               YouTube Reference
```

**Entity Rules:**
- Recipe is the top-level entity; there is NO Dish entity
- Rating, Comment, and CookingPhoto belong to Recipe
- Ingredient is reusable across multiple Recipes
- Shopping List is generated from Recipe ingredients

---

## 5. Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `RecipeDetail.jsx` |
| Functions | camelCase | `getRecipeById()` |
| Variables | camelCase | `recipeId` |
| Database | snake_case | `recipe_id` |
| API paths | kebab-case | `/api/recipes` |

---

## 6. Architecture Summary

```
                         USER
                            │
                            ▼
                  ┌──────────────────┐
                  │   React Native   │
                  │    Frontend      │
                  └────────┬─────────┘
                           │
                        REST API
                           │
                           ▼
                  ┌──────────────────┐
                  │  Node.js +       │
                  │  Express.js      │
                  └───────┬──────────┘
                          │
           ┌──────────────┼────────────────┐
           │              │                │
           ▼              ▼                ▼
    ┌────────────┐ ┌──────────────┐ ┌──────────────┐
    │ PostgreSQL │ │   Supabase  │ │   YouTube    │
    │            │ │   Storage   │ │   Data API   │
    │ Core Data  │ │ User Photos │ │ Ref. Videos  │
    └────────────┘ └──────────────┘ └──────────────┘
```

**Layered Architecture:**
1. Presentation (React Native UI)
2. Application/API (Node.js + Express.js)
3. Data Layer (PostgreSQL, Supabase, External APIs)

---

## 7. Important Commands

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

**Backend:**
```bash
cd backend
npm install
npm run dev
```

**Configuration:**
- Copy `.env.example` to `.env` and configure environment variables

**Required Environment Variables:**
- `DATABASE_URL`
- `JWT_SECRET`
- `YOUTUBE_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_KEY`

---

## 8. Source of Truth

| Concern | Authority |
|---------|-----------|
| Product identity/principles | `App in4.md` |
| Functional behavior/scope | `App in4.md` Section 6 |
| Technology stack | `App in4.md` Section 7.4 |
| Database schema | `database/schema.sql` |
| API contracts | `docs/api/` |
| Naming conventions | `App in4.md` Section 8.5 |
| Git workflow | `App in4.md` Section 8.2, 12.3 |

---

## 9. Global Boundaries

### ALWAYS

- Inspect existing code before modifying
- Search for existing implementations before creating new abstractions
- Follow naming conventions (Section 5)
- Keep business logic in the backend
- Keep frontend components focused on presentation
- Test features before merging
- Use `snake_case` for database columns
- Use `kebab-case` for API paths

### ASK FIRST

Actions requiring explicit approval:
- Destructive operations (deleting data, dropping tables)
- Database schema changes
- Adding new dependencies
- Adding new technologies not in Section 3
- Major architectural changes
- Authentication/authorization changes
- Public API contract changes
- Large-scale refactoring

### NEVER

- Push directly to `main`
- Commit secrets or hard-code credentials
- Delete production data
- Disable security controls to make a task pass
- Create a "Dish" entity (Recipe is the top-level entity)
- Use Elasticsearch (PostgreSQL search is sufficient)
- Use YouTube as source of truth for Recipe data
- Claim a command, test, or deployment was successful without verification
- Fabricate missing project information

---

## 10. Git Workflow

```
main
  │
  ├── feat/recipe
  ├── feat/search
  ├── feat/community
  └── feat/shopping-list
```

**For each feature:**
```bash
git checkout main
git pull origin main
git checkout -b feat/<feature-name>

# Code and test locally
git status
git diff
git add .
git commit -m "feat: <describe change>"
git push origin feat/<feature-name>

# Before creating PR
git checkout main
git pull origin main
git checkout feat/<feature-name>
git merge main
git push origin feat/<feature-name>
# Then create Pull Request on GitHub
```

**Rule: Never push directly to `main`.**

---

## 11. Security Rules

- Never commit secrets to Git
- Use `.env.example` to document required variables
- Validate untrusted input server-side
- Keep business logic in backend, not frontend
- Password hashing with bcrypt
- JWT for authentication tokens

---

## 12. MVP Features (In Scope)

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

### Out of Scope (Do NOT implement)

- TikTok API
- Generic social network/feed
- Follow/Friend system
- Private or group chat
- Stories
- Full video platform
- Full e-commerce system
- Online payment
- Direct external shopping cart integration
- Elasticsearch
- AI Agent for video discovery
- Real-time cooking/social features

---

## 13. Verification Rules

- Run the smallest relevant tests first
- Use real PostgreSQL when DB semantics, constraints, or transactions matter
- Authorization changes require forbidden-path coverage
- Time-sensitive behavior uses deterministic timezone-aware tests
- Important bug fixes should add regression coverage when practical
- Run lint, typecheck, tests, and build checks as applicable

---

## 14. Documentation Map

| Directory | Purpose |
|-----------|---------|
| `.agents/rules/` | Engineering rules (coding standards, testing, security) |
| `.agents/workflows/` | Workflows (feature, bugfix, code review, release) |
| `docs/architecture/` | System architecture diagrams and decisions |
| `docs/api/` | API contracts and endpoint documentation |
| `docs/database/` | Database schema, ERD, migrations |
| `docs/deployment/` | Deployment guides |
| `docs/development/` | Development setup guides |
| `docs/testing/` | Testing strategies |

---

## 15. Definition of Done

```
[ ] Requested behavior is implemented
[ ] Project invariants are preserved
[ ] Untrusted input is validated where required
[ ] Authorization is server-side where required
[ ] Naming conventions followed
[ ] Database uses snake_case
[ ] API paths use kebab-case
[ ] No secrets committed
[ ] No out-of-scope features implemented
[ ] Tests added or updated
[ ] Lint/typecheck/tests/build pass
[ ] No unrelated changes
[ ] Documentation updated only where responsibility changed
```

---

## 16. Project Invariants

Unless an explicit product decision changes them:

1. Recipe is the top-level entity; there is NO Dish entity
2. User interaction is centered on Recipe
3. Comment, Rating, and CookingPhoto belong to Recipe
4. PostgreSQL is the source of truth for core data
5. YouTube provides reference videos only, not Recipe content
6. Shopping List is part of MVP; external shopping is optional
7. PostgreSQL search is sufficient for MVP
8. No unnecessary AI, Elasticsearch, or social-network features
9. No TikTok API integration
10. Do not expand scope beyond MVP features
