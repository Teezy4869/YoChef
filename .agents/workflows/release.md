# Release Workflow

How to prepare and release changes in YoChef.

## When to Use

When preparing a release, merging to main, or deploying changes.

## Steps

### 1. Review Changes

- Review all changes since last release
- Check commit history
- Verify no unintended changes

### 2. Run Relevant Validation

```bash
# Run tests
npm test

# Run linting (if configured)
npm run lint

# Type check (if configured)
npm run typecheck
```

### 3. Verify Version Information

- Check package.json versions
- Update version if needed
- Document changes in CHANGELOG

### 4. Verify Configuration

- Environment variables configured
- No hardcoded values
- Secrets not committed

### 5. Verify Documentation

- Update README if needed
- Update API docs if endpoints changed
- Update database docs if schema changed

### 6. Inspect Final Diff

- Review all changes
- Ensure only intended changes
- Remove any debugging artifacts

### 7. Prepare Release

- Create release branch if needed
- Create git tag
- Write release notes
- Create pull request to main

## Pre-Release Checklist

```
[ ] All tests pass
[ ] Linting passes (if configured)
[ ] Type checking passes (if configured)
[ ] No console.log statements
[ ] No debugging code
[ ] No secrets committed
[ ] Dependencies updated
[ ] Documentation updated
[ ] Version bumped (if needed)
[ ] CHANGELOG updated
[ ] PR reviewed and approved
```

## Release Types

### Feature Release

- Contains new features
- Version bump (minor or major)
- Full testing required

### Bug Fix Release

- Contains bug fixes
- Version bump (patch)
- Regression testing required

### Hotfix Release

- Critical bug fix
- Version bump (patch)
- Immediate testing required
- May bypass normal PR process

## Post-Release

- Merge to main
- Tag the release
- Deploy if applicable
- Monitor for issues

## Verification

```
[ ] Changes reviewed
[ ] Tests pass
[ ] Documentation updated
[ ] Version updated
[ ] PR created
[ ] Review completed
[ ] Merged to main
[ ] Tagged (if applicable)
```

## Situations Requiring Approval

- Production deployments
- Database migrations
- Configuration changes
- Breaking changes
