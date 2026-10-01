# Bug Fix Workflow

How to fix a bug in YoChef.

## When to Use

When fixing a bug, defect, or unexpected behavior.

## Required Context

1. Understand the bug report
2. Identify the affected component
3. Know the expected behavior

## Steps

### 1. Reproduce

- Understand the bug from the report
- Create a minimal reproduction scenario
- Verify the bug exists

### 2. Collect Evidence

- Capture the exact error message
- Note the environment (frontend/backend)
- Document the steps to reproduce
- Identify affected versions

### 3. Identify Root Cause

- Search for related code
- Inspect the failing code path
- Check recent changes that might have caused it
- Form a hypothesis about the cause

### 4. Inspect Related Code

```bash
# Search for related functionality
grep -r "relatedTerm" src/
```

### 5. Design Minimal Fix

- Design the smallest fix that resolves the bug
- Avoid unrelated changes
- Consider edge cases

### 6. Implement

- Apply the minimal fix
- Don't make unrelated improvements
- Follow coding conventions

### 7. Add Regression Coverage

- Add or update a test for the bug
- Test the exact scenario that was broken
- Test related scenarios

### 8. Verify

- Run the test that reproduces the bug
- Verify the test now passes
- Run related tests to ensure no regression
- Manual verification if applicable

### 9. Report

- Describe the bug
- Explain the root cause
- Describe the fix
- Include test evidence

## Verification

```
[ ] Bug reproduced
[ ] Root cause identified
[ ] Fix implemented
[ ] Regression test added/updated
[ ] Bug test passes
[ ] Related tests pass
[ ] No regression in existing functionality
```

## Completion Requirements

- Bug is fixed
- Test coverage added
- No new bugs introduced
- Documentation updated if needed

## Situations Requiring Approval

- Database changes
- Security implications
- Changes to public API contracts
- Complex fixes requiring review

## Prohibited

- Random trial-and-error changes
- Fixing multiple unrelated issues at once
- Claiming "fixed" without reproduction
- Adding new features while fixing bugs
