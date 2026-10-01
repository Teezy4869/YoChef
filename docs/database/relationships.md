# Database Relationships

Entity relationships in YoChef database.

## NOT SPECIFIED

The exact relationships are **NOT SPECIFIED** in the current repository.

## Expected Relationships

### Recipe Relationships

```
Recipe (1)
  └── RecipeIngredient (many)
        └── Ingredient (1)
              └── Nutrition (1)
                    └── Ingredient State (raw/cooked)

Recipe (1)
  └── Category (many) - via recipe_categories

Recipe (1)
  └── Diet (many) - via recipe_diets

Recipe (1)
  └── RecipeVideo (many)
        └── YouTube Video

Recipe (1)
  └── Rating (many)
        └── User (1)

Recipe (1)
  └── Comment (many)
        └── User (1)

Recipe (1)
  └── CookingPhoto (many)
        └── User (1)

Recipe (1)
  └── Favorite (many)
        └── User (1)
```

### User Relationships

```
User (1)
  └── Rating (many)
        └── Recipe (1)

User (1)
  └── Comment (many)
        └── Recipe (1)

User (1)
  └── CookingPhoto (many)
        └── Recipe (1)

User (1)
  └── Favorite (many)
        └── Recipe (1)

User (1)
  └── ShoppingList (many)
        └── ShoppingListItem (many)
              └── Ingredient (1)
```

## Entity Relationship Diagram

```
         ┌─────────┐
         │  User   │
         └────┬────┘
              │
    ┌─────────┼─────────┐
    │         │         │
    ▼         ▼         ▼
┌───────┐ ┌───────┐ ┌───────┐
│Rating │ │Comment│ │ Photo │
└───┬───┘ └───┬───┘ └───┬───┘
    │         │         │
    └────┬────┴────┬────┘
         │         │
         ▼         ▼
      ┌────────────────┐
      │     Recipe      │
      └────────┬───────┘
               │
    ┌──────────┼──────────┐
    │          │          │
    ▼          ▼          ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│RecipeIng│ │Nutrition│ │ Favorite│
└────┬────┘ └─────────┘ └─────────┘
     │
     ▼
┌────────────┐
│ Ingredient │
└────────────┘
```

## Update When Implemented

Document actual foreign key relationships.
