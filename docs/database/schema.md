# Database Schema

Schema documentation for YoChef PostgreSQL database.

## NOT SPECIFIED

The exact schema is **NOT SPECIFIED** in the current repository.

**Update this file when `database/schema.sql` is created.**

## Expected Schema Structure

### Users Table

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Recipes Table

```sql
CREATE TABLE recipes (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  servings INTEGER DEFAULT 1,
  prep_time INTEGER,  -- minutes
  cook_time INTEGER,    -- minutes
  difficulty VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Ingredients Table

```sql
CREATE TABLE ingredients (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  unit VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Recipe Ingredients Table

```sql
CREATE TABLE recipe_ingredients (
  id SERIAL PRIMARY KEY,
  recipe_id INTEGER REFERENCES recipes(id),
  ingredient_id INTEGER REFERENCES ingredients(id),
  quantity DECIMAL(10,2),
  notes TEXT,
  UNIQUE(recipe_id, ingredient_id)
);
```

## Relationships

```
Recipe
  ├── RecipeIngredient ── Ingredient
  ├── Nutrition
  ├── Rating
  ├── Comment
  ├── CookingPhoto
  ├── Favorite
  └── RecipeVideo ── YouTube

RecipeIngredient
  └── Ingredient (reusable across recipes)
```

## Update When Implemented

- Document all actual tables
- Document all constraints
- Document all indexes
- Document all foreign keys
