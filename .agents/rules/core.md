# Core Working Principles

Universal principles for all work on YoChef.

## 1. Inspect Before Modifying

Always read and understand existing code before making changes.

1. Identify the relevant files
2. Read the existing implementation
3. Understand the existing patterns
4. Then plan your changes

## 2. Search Before Creating

Search for existing implementations before creating new abstractions.

```bash
# Search for related code
grep -r "existingTerm" src/
```

## 3. Minimal Changes

Make the smallest correct change that satisfies the requirement.

- Avoid refactoring unrelated code
- Avoid scope expansion
- Prefer additive changes over restructuring

## 4. Reuse Existing Abstractions

Use existing patterns, utilities, and components.

- Follow established module boundaries
- Reuse existing types and interfaces
- Don't duplicate business logic

## 5. Avoid Unrelated Changes

Stay focused on the task at hand.

- Don't rename variables "for consistency"
- Don't reformat code unless required
- Don't add "improvements" outside the scope

## 6. Evidence Over Assumptions

Base decisions on actual repository evidence.

- Check existing implementations
- Verify commands exist before documenting
- Check project documentation for stated decisions
- Mark information as `NOT SPECIFIED` when unavailable

## 7. Explicit Verification

Never claim success without observing the result.

- Run actual commands
- Observe actual test results
- Report what was actually verified

## 8. No Fabricated Results

Never fabricate:

- Commands
- API endpoints
- Configuration values
- Dependencies
- Test results
- Project decisions

## 9. Respect Boundaries

Follow project-wide invariants:

- Recipe is the top-level entity (no Dish)
- PostgreSQL is source of truth
- YouTube is reference only, not data source
- No Elasticsearch (PostgreSQL search sufficient)
- No AI agents for MVP

## 10. Follow Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `RecipeDetail.jsx` |
| Functions | camelCase | `getRecipeById()` |
| Variables | camelCase | `recipeId` |
| Database | snake_case | `recipe_id` |
| API paths | kebab-case | `/api/recipes` |
