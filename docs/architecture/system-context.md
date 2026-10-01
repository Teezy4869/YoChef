# System Context

External actors and integrations for YoChef.

## System Context Diagram

```
                   ┌──────────────────────┐
                    │        User          │
                    │ Search / Cook / Share│
                    └──────────┬───────────┘
                               │
                               │
                               ▼
                 ┌───────────────────────────┐
                 │       YOCHEF APP          │
                 │                           │
                 │  Recipe                   │
                 │  Search & Filter          │
                 │  Cooking Mode             │
                 │  Community                │
                 │  Shopping List            │
                 └───────┬───────────┬───────┘
                         │           │
              ┌──────────┘           └──────────┐
              ▼                                 ▼
   ┌────────────────────┐             ┌────────────────────┐
   │ External Video     │             │ External Shopping  │
   │ Service            │             │ Service            │
   │ (YouTube Data API) │             │ (Optional)         │
   └────────────────────┘             └────────────────────┘
```

## Users and Actors

### Primary Actor: User

- Searches for recipes
- Selects and views recipes
- Cooks with step-by-step guidance
- Rates and comments on recipes
- Uploads cooking photos
- Manages favorites
- Creates shopping lists

### Secondary Actor: External Video Service

- Provides reference cooking videos
- Associated with recipes via YouTube links
- Not the source of truth for recipe content

### Secondary Actor: External Shopping Service

- Optional integration for ingredient search
- Not part of MVP
- External shopping is optional

## System Boundary

YoChef manages:

- Recipe data (name, ingredients, steps, nutrition)
- User accounts and authentication
- Community content (ratings, comments, photos)
- Shopping lists
- Favorites

YoChef does NOT manage:

- External recipe databases (YouTube)
- Payment processing
- Delivery logistics
- Social networking beyond recipe experiences

## External Integrations

### YouTube Data API

| Aspect | Detail |
|--------|--------|
| Purpose | Provide reference cooking videos |
| Data Flow | Backend fetches video metadata |
| Caching | Videos may be cached |
| Fallback | App works without video service |

### Supabase Storage

| Aspect | Detail |
|--------|--------|
| Purpose | Store user-uploaded cooking photos |
| Formats | JPG, PNG, WebP |
| Max Size | 5 MB original, ~1 MB compressed |
| Fallback | Feature unavailable if storage fails |

### PostgreSQL

| Aspect | Detail |
|--------|--------|
| Purpose | Source of truth for all core data |
| Tables | Recipe, Ingredient, User, Rating, Comment, etc. |
| Availability | Required for app to function |

## Data Source Hierarchy

1. **Recipe Database (PostgreSQL)** — Source of truth for recipe content
2. **YouTube** — Reference videos only, not recipe data
3. **User Input** — Ratings, comments, photos
