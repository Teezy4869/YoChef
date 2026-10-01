# Architecture Overview

High-level architecture documentation for YoChef.

## System Purpose

YoChef is a mobile cooking app that helps users:

- Discover and search recipes
- Cook with step-by-step guidance
- Share cooking experiences (ratings, comments, photos)
- Manage shopping lists

## High-Level Architecture

**Layered Architecture:**

```
┌─────────────────────────────────────────┐
│              Presentation               │
│       User Interface / Client           │
└───────────────────┬─────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│             Application / API            │
│                                         │
│ Recipe | Search | Cooking | Community   │
│ Favorite | Shopping List | Media         │
└───────────────────┬─────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│              Data Layer                 │
│                                         │
│ Recipe | Ingredient                     │
│ Rating | Comment | Photo                │
│ Favorite | Shopping List                │
└─────────────────────────────────────────┘
```

## Major Subsystems

| Subsystem | Responsibility |
|-----------|----------------|
| Recipe Management | CRUD for recipes, ingredients, nutrition |
| Search | Recipe search and filtering |
| Cooking Mode | Step-by-step cooking guidance |
| Community | Ratings, comments, cooking photos |
| Favorites | Save and manage favorite recipes |
| Shopping List | Generate and manage shopping lists |
| Authentication | User login, registration, JWT |

## Technology Roles

| Technology | Role |
|-----------|------|
| React Native | Mobile UI |
| Node.js + Express | Backend API |
| PostgreSQL | Relational data storage |
| Supabase Storage | User-uploaded images |
| YouTube Data API | Reference cooking videos |
| JWT + bcrypt | Authentication |

## Architectural Constraints

1. **Recipe is the top-level entity** — No Dish entity exists
2. **Frontend → Backend only via REST** — Direct DB access forbidden
3. **PostgreSQL is source of truth** — External services are optional
4. **YouTube is reference only** — Not source of recipe data
5. **No Elasticsearch** — PostgreSQL search sufficient for MVP

## Project Structure

```
cooking-app/
├── frontend/           # React Native app
├── backend/           # Node.js + Express API
├── database/          # PostgreSQL schema
└── docs/              # Documentation
```

## Key Decisions

See `architecture/decisions/` for architectural decision records.
