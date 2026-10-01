# Testing Workflow

How to test changes in YoChef.

## When to Use

When verifying changes, running regression tests, or diagnosing failures.

## Test Selection Strategy

### Unit Tests

Test individual functions in isolation:
- Pure functions
- Utility functions
- Business logic functions

### Integration Tests

Test API endpoints with database:
- CRUD operations
- Authentication flows
- Data validation

### Manual Tests

Test UI and user flows:
- Screen navigation
- User interactions
- Visual verification

## Running Tests

### Select Targeted Tests

```bash
# Run tests for specific file
npm test -- filename.test.js

# Run tests matching pattern
npm test -- --testPathPattern=recipe
```

### Run Regression Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage
```

### Diagnose Failures

When a test fails:

1. Read the error message
2. Identify the failing test
3. Check the test expectation
4. Inspect the implementation
5. Determine if it's:
   - Implementation bug
   - Test bug
   - Environment issue

## Environment vs Implementation Failures

| Symptom | Likely Cause |
|---------|--------------|
| Test passes locally, fails in CI | Environment difference |
| All tests fail | Environment issue |
| One test fails | Implementation or test bug |
| Flaky tests | Race condition or timing |

## Distinguish Implementation from Environment

### Environment Issues

- Missing dependencies
- Database connection failed
- Environment variables not set
- Port already in use

### Implementation Bugs

- Logic error
- Missing null check
- Wrong return value
- Incorrect comparison

## Test Results Reporting

Always report:

```
Test: [name]
Status: [passed/failed]
Command: [actual command run]
Output: [relevant output]
```

## Verification Requirements

```
[ ] Tests run
[ ] Output observed
[ ] Results reported accurately
[ ] Failures analyzed
[ ] Root cause identified
```

## Prohibited

- Claiming tests pass without running them
- Claiming tests pass without observing output
- Ignoring test failures
- Modifying tests to make them pass instead of fixing code
