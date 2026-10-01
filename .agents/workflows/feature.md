# Feature Workflow

How to implement a new feature in YoChef.

## When to Use

When implementing a new feature, enhancement, or capability.

## Required Context

1. Understand the feature requirement
2. Identify the affected domain (Recipe, Community, Shopping List, etc.)
3. Check the project scope (MVP features only)

## Steps

### 1. Understand

- Read the feature requirement
- Check if feature is in MVP scope
- Identify the owning domain

### 2. Inspect

- Read existing related code
- Check `docs/api/` for API contracts
- Check `docs/database/` for data models
- Search for existing implementations

### 3. Identify Existing Implementations

```bash
# Search for related code
grep -r "relatedTerm" src/
```

### 4. Plan

- Identify affected files
- Design the minimal change
- Check naming conventions
- Plan API endpoints if needed

### 5. Implement

- Follow coding style rules
- Use appropriate naming conventions
- Keep business logic in backend
- Keep UI in frontend
- Add inline comments for complex logic

### 6. Test

- Run relevant tests
- Verify existing tests still pass
- Manual testing for UI changes

### 7. Review

- Check for scope creep
- Verify naming conventions followed
- Check security implications
- Review diff for unintended changes

### 8. Report

- Summarize what was implemented
- List affected files
- Note any breaking changes
- Report test results

## Verification

```
[ ] Feature implemented
[ ] In MVP scope
[ ] Naming conventions followed
[ ] Tests added/updated
[ ] Tests pass
[ ] No unrelated changes
```

## Completion Requirements

- Feature works as specified
- Tests pass
- No security issues introduced
- Documentation updated if needed

## Situations Requiring Approval

- New API endpoints
- Database schema changes
- New dependencies
- Out-of-scope features
- Changes to authentication/authorization
