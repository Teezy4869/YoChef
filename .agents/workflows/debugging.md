# Debugging Workflow

Systematic approach to debugging issues in YoChef.

## When to Use

When investigating errors, unexpected behavior, or failures.

## Steps

### 1. Reproduce the Problem

- Get exact error message or behavior
- Note environment (frontend/backend)
- Document exact steps to reproduce

### 2. Capture the Exact Error

- Copy error message exactly
- Note error type (compile, runtime, API)
- Capture stack trace if available
- Note timestamps

### 3. Identify the Failing Boundary

Determine where the failure occurs:

| Failure Type | Check |
|--------------|-------|
| Frontend error | Browser console, React Native logs |
| API error | Server logs, response codes |
| Database error | Database logs, connection errors |
| External service error | Service status, API responses |

### 4. Inspect Logs and Relevant Code

```bash
# Check server logs
tail -f logs/server.log

# Search for related code
grep -r "errorTerm" src/
```

### 5. Form a Hypothesis

Based on evidence:
- What should happen?
- What is actually happening?
- What's the difference?

### 6. Test the Hypothesis

- Design a test case
- Run the test
- Observe the result

### 7. Apply the Smallest Valid Correction

- Fix only the identified issue
- Avoid scope creep
- Prefer minimal changes

### 8. Re-run the Failing Scenario

- Run the exact scenario that failed
- Verify the error is resolved
- Check for side effects

### 9. Verify No Regression

- Run related tests
- Check similar functionality
- Manual testing if applicable

### 10. Report Evidence

- Document the original error
- Document the root cause
- Document the fix
- Include verification evidence

## Debugging Frontend Issues

```javascript
// Add console logging
console.log('Debug value:', value);

// Check component state
console.log('State:', this.state);

// Check props
console.log('Props:', this.props);
```

## Debugging Backend Issues

```javascript
// Add logging
console.log('Request:', req.body);
console.log('Database result:', result);

// Check error details
console.error('Error:', error);
```

## Debugging API Issues

```bash
# Test API endpoint
curl -X GET http://localhost:3000/api/recipes

# Test with body
curl -X POST http://localhost:3000/api/recipes \
  -H "Content-Type: application/json" \
  -d '{"name": "Test"}'
```

## Common Issues

| Issue | Check |
|-------|-------|
| CORS errors | Backend CORS configuration |
| 401 Unauthorized | JWT token validity |
| 500 Internal Error | Server logs, database connection |
| Connection refused | Server running, port correct |

## Verification Requirements

```
[ ] Problem reproduced
[ ] Root cause identified
[ ] Fix applied
[ ] Original scenario passes
[ ] No regression in related functionality
```

## Prohibited

- Claiming "fixed" without reproduction
- Changing code without evidence
- Fixing symptoms instead of root cause
- Making multiple unrelated changes
