# Coding Style

Project-specific coding conventions for YoChef.

## 1. Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `RecipeDetail.jsx` |
| Functions | camelCase | `getRecipeById()` |
| Variables | camelCase | `recipeId` |
| Database | snake_case | `recipe_id` |
| API paths | kebab-case | `/api/recipes` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |

## 2. File Organization

### Frontend (React Native)

```
src/
├── components/     # Reusable UI components
├── screens/        # Screen components (one per route)
├── hooks/          # Custom React hooks (useXxx)
├── services/       # API services (XxxService)
├── context/        # React context providers
└── utils/          # Pure utility functions
```

### Backend (Node.js + Express)

```
src/
├── controllers/    # One file per resource (recipesController.js)
├── routes/         # Route definitions
├── services/       # Business logic
├── models/         # Data models
├── middleware/     # Express middleware
├── utils/          # Utility functions
└── config/         # Configuration
```

## 3. Component Structure

### React Native Components

```jsx
// Good
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const RecipeCard = ({ recipe, onPress }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{recipe.name}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { padding: 16 },
  title: { fontSize: 18, fontWeight: 'bold' },
});

export default RecipeCard;
```

## 4. Function Structure

### Backend Services

```javascript
// Good - Single responsibility
const createRecipe = async (recipeData) => {
  const { name, servings, ingredients } = recipeData;
  
  // Validate input
  if (!name || !servings) {
    throw new ValidationError('Name and servings are required');
  }
  
  // Create recipe
  const recipe = await RecipeRepository.create(recipeData);
  
  return recipe;
};
```

## 5. Error Handling

### Frontend

```javascript
// Good - Handle errors gracefully
const fetchRecipes = async () => {
  try {
    const response = await RecipeService.getAll();
    return response.data;
  } catch (error) {
    console.error('Failed to fetch recipes:', error);
    throw error; // or return default value
  }
};
```

### Backend

```javascript
// Good - Consistent error format
const errorHandler = (err, req, res, next) => {
  console.error(err.stack);
  
  if (err instanceof ValidationError) {
    return res.status(400).json({ error: err.message });
  }
  
  res.status(500).json({ error: 'Internal server error' });
};
```

## 6. Comments

- Use JSDoc for public functions
- Explain **why**, not **what**
- Keep comments updated with code changes

```javascript
// Good - Explains purpose
// Cache recipes for 5 minutes to reduce database load
const getCachedRecipes = async () => { ... };
```

## 7. Logging

### Backend Only

```javascript
// Use appropriate log levels
console.log('Starting server...');     // Initialization
console.log('Recipe created:', id);   // Business events
console.error('Database error:', err); // Errors
```

**No logging in frontend** unless for debugging during development.

## 8. Formatting

- Use ESLint and Prettier (if configured)
- 2 spaces for indentation
- Single quotes for strings
- No semicolons (if using ESLint/Prettier)

## 9. Import Order

```javascript
// 1. React/React Native
import React, { useState, useEffect } from 'react';

// 2. Third-party libraries
import axios from 'axios';

// 3. Project modules
import { RecipeService } from '../services/RecipeService';
import { RECIPE_STATES } from '../constants';

// 4. Relative imports
import RecipeCard from './RecipeCard';
```

## 10. Frontend Conventions

- Use functional components with hooks
- Keep components focused (single responsibility)
- Extract reusable logic into custom hooks
- Use React Navigation for routing
- Use Axios for API calls

## 11. Backend Conventions

- Use async/await for asynchronous operations
- Validate input with middleware
- Return consistent response format
- Use middleware for cross-cutting concerns
- Keep routes clean (delegate to controllers)
