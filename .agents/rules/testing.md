# Testing Rules

Testing strategy and requirements for YoChef.

## 1. Testing Strategy

Testing is essential for all new features and bug fixes.

## 2. Test Levels

### Unit Tests
- Test individual functions in isolation
- Mock external dependencies
- Located with source files or in `__tests__` directory

### Integration Tests
- Test API endpoints with database
- Verify request/response contracts
- Located in `__tests__/api/` or `__tests__/integration/`

### Manual Testing
- UI components verified manually during development
- End-to-end flows tested via app inspection

## 3. Test Commands

**NOT SPECIFIED** — No test commands defined in current repository.

When package.json is created, expected commands:
```bash
# Run all tests
npm test

# Run specific test file
npm test -- filename.test.js

# Run with coverage
npm run test:coverage
```

## 4. Regression Expectations

### Required for Bug Fixes
- Reproduce the bug with a test
- Fix the bug
- Verify test passes
- No existing tests should break

### Required for New Features
- Add tests for new functionality
- Verify existing related tests still pass

## 5. When Tests Are Required

| Change Type | Tests Required |
|-------------|----------------|
| Bug fix | Regression test + original bug test |
| New feature | Unit tests + integration tests |
| Refactor | Verify existing tests pass |

## 6. Verification Requirements

- Run tests before reporting completion
- Report actual test results, not assumptions
- Include failing tests in bug reports
- Never claim tests pass without running them

## 7. Test File Naming

```
RecipeService.test.js      # Unit test
recipes.test.js            # Integration test
RecipeCard.test.js         # Component test
```

## 8. Test Structure

```javascript
describe('RecipeService', () => {
  describe('getRecipeById', () => {
    it('should return recipe when id exists', async () => {
      // Arrange
      const recipeId = 1;
      
      // Act
      const recipe = await RecipeService.getRecipeById(recipeId);
      
      // Assert
      expect(recipe).toBeDefined();
      expect(recipe.id).toBe(recipeId);
    });
    
    it('should throw error when id does not exist', async () => {
      // ...
    });
  });
});
```

## 9. Mocking

Mock external dependencies:
- API calls (use mocked responses)
- Database (use test database or mocks)
- External services (YouTube API, Supabase)

## 10. Test Database

- Use separate test database for integration tests
- Reset database state between tests
- Use transactions for test isolation

## 11. Coverage

- Aim for meaningful coverage, not 100%
- Prioritize business logic paths
- Cover error cases and edge cases

## 12. Environment

- Tests should run in clean environment
- Don't rely on development data
- Use environment variables for test configuration
