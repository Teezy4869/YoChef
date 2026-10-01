# Refactoring Workflow

How to safely refactor code in YoChef.

## When to Use

When improving code structure without changing behavior.

## Required Context

1. Understand the current behavior
2. Know the refactoring goal
3. Identify affected tests

## Steps

### 1. Understand Current Behavior

- Read the existing code
- Understand the purpose
- Identify all use cases
- Document the behavior

### 2. Identify Current Tests

```bash
# Find related tests
find . -name "*.test.js" -exec grep -l "FunctionName" {}
```

### 3. Define the Intended Structural Change

- What will change?
- What will stay the same?
- What's the expected benefit?

### 4. Confirm Scope

- Define exact files affected
- Limit scope to necessary changes
- Avoid unrelated refactoring

### 5. Refactor Incrementally

Make small, verifiable changes:

1. Make one change
2. Run tests
3. Verify behavior preserved
4. Repeat

### 6. Run Relevant Tests

```bash
# Run tests for affected module
npm test -- affected-module.test.js

# Run all tests
npm test
```

### 7. Compare Final Diff

- Review the changes
- Ensure only intended changes
- Remove debugging artifacts

### 8. Verify Behavior Preserved

- All tests pass
- Manual testing of affected functionality
- No regressions in related features

## Refactoring Types

### Rename Variable/Function

1. Rename in all locations
2. Update tests
3. Verify tests pass

### Extract Function

1. Create new function
2. Move logic
3. Update call sites
4. Run tests

### Move Code to Different Module

1. Create new module
2. Move code
3. Update imports
4. Run tests

### Simplify Complex Logic

1. Understand current logic
2. Design simpler version
3. Verify equivalence
4. Replace
5. Run tests

## Verification

```
[ ] Current behavior understood
[ ] Tests identified
[ ] Scope defined
[ ] Changes are incremental
[ ] Tests pass after each change
[ ] Final tests pass
[ ] No regression
[ ] No unintended changes
```

## Completion Requirements

- Behavior preserved
- Tests pass
- No performance degradation
- No new bugs introduced

## Situations Requiring Approval

- Cross-module refactoring
- API contract changes
- Database schema changes
- Large-scale refactoring (>5 files)

## Prohibited

- Mixing feature development with refactoring
- Changing behavior "while refactoring"
- Skipping tests to "save time"
- Refactoring without understanding
