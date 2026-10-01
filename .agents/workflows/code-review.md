# Code Review Workflow

How to review code changes in YoChef.

## When to Use

When reviewing pull requests or before merging changes.

## Review Checklist

### 1. Correctness

- [ ] Code does what it claims to do
- [ ] Edge cases handled
- [ ] No obvious bugs
- [ ] Logic is sound

### 2. Architecture

- [ ] Follows layered architecture
- [ ] Business logic in backend
- [ ] UI logic in frontend
- [ ] No tight coupling

### 3. Security

- [ ] No secrets committed
- [ ] Input validation present
- [ ] SQL injection prevented
- [ ] Authentication/authorization correct
- [ ] No sensitive data in logs

### 4. Error Handling

- [ ] Errors caught and handled
- [ ] Appropriate error messages
- [ ] No unhandled promise rejections
- [ ] Graceful degradation

### 5. Testing

- [ ] Tests added for new functionality
- [ ] Existing tests pass
- [ ] Edge cases tested
- [ ] No test pollution

### 6. Maintainability

- [ ] Code is readable
- [ ] Naming conventions followed
- [ ] Functions are focused
- [ ] No code duplication

### 7. Scope Adherence

- [ ] Changes are minimal
- [ ] No scope creep
- [ ] No unrelated changes
- [ ] In MVP scope

### 8. Unintended Changes

- [ ] No unnecessary formatting changes
- [ ] No unintended deletions
- [ ] Lockfiles intentional
- [ ] Dependencies appropriate

## Review Process

### 1. Read the Description

- Understand what the PR does
- Check linked issues
- Note any special requirements

### 2. Review the Diff

- Check file changes
- Understand each change
- Look for potential issues

### 3. Run the Code

- Pull the branch
- Install dependencies
- Run tests
- Manual testing if applicable

### 4. Provide Feedback

- Be specific and actionable
- Distinguish blocking vs non-blocking
- Suggest improvements
- Approve or request changes

## Feedback Categories

### Blocking

Issues that must be fixed:

- Security vulnerabilities
- Breaking bugs
- Violations of project rules
- Out of scope changes

### Non-Blocking

Suggestions for improvement:

- Code style preferences
- Alternative approaches
- Minor optimizations
- Documentation improvements

## Verification

```
[ ] Code reviewed
[ ] Tests run
[ ] Manual testing done (if applicable)
[ ] Security checked
[ ] Feedback provided
[ ] Decision recorded (approve/request changes)
```

## Completion

- Write clear feedback
- Distinguish blocking/non-blocking
- Be constructive
- Document review decision
