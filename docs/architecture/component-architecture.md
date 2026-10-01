# Component Architecture

Major components and their relationships in YoChef.

## Frontend Components (React Native)

### Screen Components

| Screen | Responsibility |
|--------|----------------|
| HomeScreen | Recipe discovery, search, browse |
| RecipeDetailScreen | View recipe details, ingredients, steps |
| CookingModeScreen | Step-by-step cooking guidance |
| FavoritesScreen | View saved recipes |
| ProfileScreen | User profile, settings |
| ShoppingListScreen | Manage shopping lists |
| AuthScreen | Login, registration |

### Reusable Components

| Component | Responsibility |
|-----------|----------------|
| RecipeCard | Display recipe summary |
| IngredientList | Display ingredients with quantities |
| StepCard | Display cooking step |
| RatingStars | Display rating input/display |
| CommentList | Display recipe comments |
| PhotoGallery | Display cooking photos |
| Timer | Cooking timer component |

## Backend Components (Node.js + Express)

### Controllers

| Controller | Responsibility |
|------------|----------------|
| authController | User authentication |
| recipeController | Recipe CRUD operations |
| ingredientController | Ingredient management |
| ratingController | Rate recipes |
| commentController | Manage comments |
| favoriteController | Manage favorites |
| shoppingListController | Shopping list operations |
| cookingPhotoController | Photo uploads |

### Services

| Service | Responsibility |
|---------|----------------|
| authService | Authentication logic, JWT |
| recipeService | Recipe business logic |
| nutritionService | Calculate nutrition |
| searchService | Recipe search logic |
| emailService | Email notifications (future) |

### Models

| Model | Responsibility |
|-------|----------------|
| User | User data and relationships |
| Recipe | Recipe data |
| Ingredient | Reusable ingredient definitions |
| RecipeIngredient | Recipe-ingredient relationship with quantities |
| Rating | User ratings for recipes |
| Comment | User comments for recipes |
| CookingPhoto | User-uploaded cooking photos |
| Favorite | User-recipe favorites |
| ShoppingList | User shopping lists |
| ShoppingListItem | Items in shopping lists |

## Data Flow

### Recipe Search Flow

```
User → HomeScreen → Search Input
                        ↓
                   recipeService (Frontend)
                        ↓
                   GET /api/recipes/search
                        ↓
                   searchService (Backend)
                        ↓
                   PostgreSQL (Full-Text Search)
                        ↓
                   Response ← Frontend updates state
```

### Cooking Flow

```
User → RecipeDetailScreen → Start Cooking
                                    ↓
                           CookingModeScreen
                                    ↓
                           Step Navigation
                                    ↓
                           Timer (if needed)
                                    ↓
                           Complete → Rate/Comment
```

### Upload Photo Flow

```
User → Take/Select Photo
              ↓
        Photo Gallery
              ↓
        Supabase Storage (direct upload)
              ↓
        POST /api/cooking-photos (metadata)
              ↓
        PostgreSQL (CookingPhoto record)
```

## Dependency Relationships

### Allowed

- Frontend → Backend (REST API)
- Backend → PostgreSQL
- Backend → Supabase Storage
- Backend → YouTube API
- Frontend → Supabase Storage (image upload)

### Forbidden

- Frontend → PostgreSQL
- Frontend → YouTube API directly
- Backend → Elasticsearch (not used)
