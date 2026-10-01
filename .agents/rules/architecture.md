# Architecture Rules

Project-specific architectural constraints for YoChef.

## 1. Architectural Style

**Layered Architecture** with clear separation:

```
Presentation (React Native) → Application/API (Node.js + Express) → Data (PostgreSQL + External Services)
```

## 2. Major Layers

| Layer | Responsibility | Technology |
|-------|----------------|------------|
| Presentation | UI, user interaction | React Native |
| Application | Business logic, API endpoints | Node.js + Express.js |
| Data | Persistence, external data | PostgreSQL, Supabase, YouTube API |

## 3. Frontend Modules

```
frontend/
├── components/      # Reusable UI components
├── screens/         # Screen/page components
├── hooks/           # Custom React hooks
├── services/        # API clients
├── context/         # React context providers
└── utils/           # Utility functions
```

## 4. Backend Modules

```
backend/
├── controllers/     # Request handlers
├── routes/          # API route definitions
├── services/         # Business logic
├── models/           # Data models
├── middleware/       # Express middleware
├── utils/            # Utility functions
└── config/           # Configuration
```

## 5. Allowed Relationships

- Frontend → Backend (via REST API)
- Backend → PostgreSQL
- Backend → Supabase Storage
- Backend → YouTube Data API
- Frontend → Supabase Storage (for image uploads)

## 6. Forbidden Relationships

- Frontend → PostgreSQL directly
- Frontend → YouTube Data API directly
- Frontend → External Services directly
- Any layer → Elasticsearch (not used)

## 7. Domain Structure

```
                    RECIPE (Top-level entity)
                       │
       ┌───────────┬────┼────────┬───────────┐
       │           │    │        │           │
       ▼           ▼    ▼        ▼           ▼
    Ingredient   Nutrition Rating  Comment   Favorite
       │
       └── Shopping List

                    RECIPE
                       │
                       ▼
                 CookingPhoto
```

## 8. Architectural Constraints

1. **Recipe is top-level** — No Dish entity exists
2. **Business logic in backend** — Frontend for presentation only
3. **Database source of truth** — PostgreSQL for core data
4. **External services are optional** — App works without YouTube/Supabase
5. **No social network features** — Community focused on Recipe experiences

## 9. API Contract

- REST API with JSON
- Frontend and backend communicate via `/api/*` endpoints
- API contracts defined in `docs/api/`

## 10. Data Flow

```
User → React Native UI → REST API → Express.js → PostgreSQL
                                            → Supabase Storage (images)
                                            → YouTube Data API (videos)
```
