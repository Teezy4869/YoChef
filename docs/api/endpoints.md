# API Endpoints

Detailed endpoint documentation for YoChef.

## NOT SPECIFIED

The exact API endpoints are **NOT SPECIFIED** in the current documentation.

The project specifies the following API groups:

```
/api/auth
/api/recipes
/api/ingredients
/api/favorites
/api/ratings
/api/comments
/api/cooking-photos
/api/shopping-lists
/api/videos
```

**When implementing, document actual endpoints here.**

## Expected Endpoints (Template)

### Auth Endpoints

```
POST /api/auth/register    - Register new user
POST /api/auth/login      - Login user
POST /api/auth/logout     - Logout user
GET  /api/auth/me         - Get current user
```

### Recipe Endpoints

```
GET    /api/recipes           - List recipes (with search/filter)
GET    /api/recipes/:id       - Get recipe details
POST   /api/recipes           - Create recipe
PUT    /api/recipes/:id       - Update recipe
DELETE /api/recipes/:id       - Delete recipe
GET    /api/recipes/:id/nutrition - Get nutrition info
GET    /api/recipes/:id/steps - Get cooking steps
```

### Ingredient Endpoints

```
GET    /api/ingredients       - List ingredients
GET    /api/ingredients/:id   - Get ingredient details
```

### Favorites Endpoints

```
GET    /api/favorites         - List user favorites
POST   /api/favorites          - Add favorite
DELETE /api/favorites/:id     - Remove favorite
```

### Rating Endpoints

```
POST   /api/ratings           - Rate a recipe
GET    /api/ratings/:recipeId - Get recipe ratings
```

### Comment Endpoints

```
GET    /api/comments/:recipeId - Get recipe comments
POST   /api/comments          - Add comment
DELETE /api/comments/:id     - Delete comment
```

### Cooking Photo Endpoints

```
GET    /api/cooking-photos/:recipeId - Get recipe photos
POST   /api/cooking-photos   - Upload photo
DELETE /api/cooking-photos/:id - Delete photo
```

### Shopping List Endpoints

```
GET    /api/shopping-lists        - List user shopping lists
GET    /api/shopping-lists/:id    - Get shopping list details
POST   /api/shopping-lists        - Create shopping list
PUT    /api/shopping-lists/:id    - Update shopping list
DELETE /api/shopping-lists/:id    - Delete shopping list
POST   /api/shopping-lists/from-recipe/:recipeId - Generate from recipe
```

### Video Endpoints

```
GET    /api/videos/:recipeId - Get recipe videos
```

## Update When Implemented

When the API is implemented:

1. Document actual endpoints
2. Document request/response formats
3. Document validation rules
4. Document authentication requirements
