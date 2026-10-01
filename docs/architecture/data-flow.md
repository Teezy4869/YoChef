# Data Flow

Important data flows in YoChef.

## Recipe Data Flow

```
Recipe Search
─────────────────────────────────────
User enters search query
        ↓
Frontend sends GET /api/recipes?search=query
        ↓
Backend validates request
        ↓
searchService searches PostgreSQL
        ↓
Results returned to frontend
        ↓
Frontend displays recipe list
```

## Recipe Detail Flow

```
Recipe Detail View
─────────────────────────────────────
User selects recipe
        ↓
Frontend sends GET /api/recipes/:id
        ↓
Backend loads recipe from PostgreSQL
        ↓
Backend loads ingredients via RecipeIngredient
        ↓
Backend calculates nutrition (optional)
        ↓
Response returned with full recipe
        ↓
Frontend displays detail view
```

## Cooking Flow

```
Cooking Mode
─────────────────────────────────────
User enters cooking mode
        ↓
Frontend requests GET /api/recipes/:id/steps
        ↓
Backend returns ordered steps
        ↓
Frontend displays current step
        ↓
User navigates steps (previous/next)
        ↓
Timer started for timed steps (client-side)
        ↓
User completes cooking
        ↓
Optional: User rates/comments
```

## Community Content Flow

```
Rating
─────────────────────────────────────
User rates recipe (1-5 stars)
        ↓
Frontend sends POST /api/ratings
        ↓
Backend validates and stores in PostgreSQL
        ↓
Average rating recalculated
        ↓
Response returned
        ↓
Frontend updates UI
```

```
Comment
─────────────────────────────────────
User submits comment
        ↓
Frontend sends POST /api/comments
        ↓
Backend validates content
        ↓
Comment stored in PostgreSQL
        ↓
Response returned
        ↓
Frontend displays new comment
```

## Shopping List Flow

```
Generate Shopping List
─────────────────────────────────────
User views recipe ingredients
        ↓
User clicks "Add to Shopping List"
        ↓
Frontend sends POST /api/shopping-lists
        ↓
Backend creates ShoppingList
        ↓
Backend creates ShoppingListItems from RecipeIngredient
        ↓
Response returned with list
        ↓
User can view/edit shopping list
```

## Image Upload Flow

```
Cooking Photo Upload
─────────────────────────────────────
User takes or selects photo
        ↓
Frontend compresses image (~1MB)
        ↓
Frontend uploads to Supabase Storage
        ↓
Frontend sends POST /api/cooking-photos with URL
        ↓
Backend stores metadata in PostgreSQL
        ↓
Photo associated with recipe
        ↓
Other users can view photo on recipe
```

## External Service Flows

```
YouTube Video Fetch
─────────────────────────────────────
Backend receives recipe detail request
        ↓
Backend checks for video associations
        ↓
If needed, queries YouTube Data API
        ↓
Video data cached (optional)
        ↓
Video links returned with recipe
```

```
Supabase Storage (Image Upload)
─────────────────────────────────────
Frontend uploads image directly to Supabase
        ↓
Supabase returns public URL
        ↓
Frontend sends URL to backend
        ↓
Backend stores URL in PostgreSQL
```

## Error Handling Flows

| Error Type | Handling |
|------------|----------|
| Validation Error | 400 response, client shows message |
| Authentication Error | 401 response, redirect to login |
| Authorization Error | 403 response, show access denied |
| Not Found | 404 response, show not found message |
| Server Error | 500 response, generic error message |
| External Service Error | Graceful degradation, log error |
