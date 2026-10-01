# API Documentation

API documentation for YoChef backend.

## Overview

The YoChef backend exposes REST APIs for frontend communication.

## API Groups

| Group | Base Path | Purpose |
|-------|-----------|---------|
| Auth | `/api/auth` | Authentication |
| Recipes | `/api/recipes` | Recipe management |
| Ingredients | `/api/ingredients` | Ingredient lookup |
| Favorites | `/api/favorites` | Favorite recipes |
| Ratings | `/api/ratings` | Recipe ratings |
| Comments | `/api/comments` | Recipe comments |
| Cooking Photos | `/api/cooking-photos` | User cooking photos |
| Shopping Lists | `/api/shopping-lists` | Shopping list management |
| Videos | `/api/videos` | Reference videos |

## Common Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Content-Type` | Yes | `application/json` |
| `Authorization` | Yes* | `Bearer <token>` for protected routes |

## Response Format

### Success

```json
{
  "success": true,
  "data": { ... }
}
```

### Error

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 500 | Internal Server Error |

## API Endpoints

See `endpoints.md` for detailed endpoint documentation.

## Authentication

Most endpoints require authentication. Use JWT tokens:

1. Login at `POST /api/auth/login`
2. Receive JWT token
3. Include in subsequent requests: `Authorization: Bearer <token>`

## Validation

- All input is validated server-side
- Validation errors return 400 with details
- See `error-codes.md` for error codes
