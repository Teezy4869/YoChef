# Database Documentation

Database documentation for YoChef.

## Overview

PostgreSQL is used as the primary relational database.

## NOT SPECIFIED

The exact database schema is **NOT SPECIFIED** in the current repository.

The database schema should be defined in:

- `database/schema.sql`
- `docs/database/schema.md`

## Expected Tables

Based on `App in4.md`, the following tables are expected:

### Core Tables

| Table | Description |
|-------|-------------|
| `users` | User accounts |
| `recipes` | Recipe data |
| `ingredients` | Reusable ingredient definitions |
| `recipe_ingredients` | Recipe-ingredient relationships with quantities |
| `categories` | Recipe categories |
| `diets` | Diet types (vegetarian, vegan, etc.) |
| `recipe_diets` | Recipe-diet relationships |
| `nutrition` | Nutrition information per ingredient |

### Community Tables

| Table | Description |
|-------|-------------|
| `ratings` | User ratings for recipes |
| `comments` | User comments for recipes |
| `cooking_photos` | User-uploaded cooking photos |

### User Data Tables

| Table | Description |
|-------|-------------|
| `favorites` | User-recipe favorites |
| `shopping_lists` | User shopping lists |
| `shopping_list_items` | Items in shopping lists |

### Integration Tables

| Table | Description |
|-------|-------------|
| `recipe_videos` | Recipe-YouTube video associations |

## Update When Implemented

When the database is implemented:

1. Document actual schema in `database/schema.sql`
2. Document relationships
3. Document indexes
4. Document constraints
5. Add seed data documentation
