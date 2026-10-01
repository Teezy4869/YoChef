# Git Rules

Git workflow conventions for YoChef.

## 1. Branch Conventions

### Branch Structure

```
main                    # Stable production code
├── feat/recipe         # Feature branches
├── feat/search
├── feat/community
└── feat/shopping-list
```

### Branch Naming

| Type | Pattern | Example |
|------|---------|---------|
| Feature | `feat/<name>` | `feat/recipe-detail` |
| Bugfix | `fix/<name>` | `fix/login-redirect` |
| Refactor | `refactor/<name>` | `refactor/auth-service` |
| Documentation | `docs/<name>` | `docs/api-endpoints` |

## 2. Commit Conventions

### Commit Message Format

```
type: description

[optional body]
```

### Types

| Type | Use |
|------|-----|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Code refactoring (no behavior change) |
| `docs` | Documentation changes |
| `style` | Formatting, missing semicolons, etc. |
| `test` | Adding or updating tests |
| `chore` | Build process, dependencies, tooling |

### Examples

```bash
# Good commit messages
git commit -m "feat: add recipe detail screen"
git commit -m "fix: resolve login redirect issue"
git commit -m "docs: update API documentation"

# Bad commit messages
git commit -m "fixed stuff"
git commit -m "WIP"
git commit -m "asdfgh"
```

## 3. Pull Request Expectations

### Before Creating PR

1. Update branch from main
2. Resolve any conflicts
3. Run tests locally
4. Review your changes

### PR Requirements

- Clear title describing the change
- Description of what changed and why
- Link to related issues
- All tests pass
- No merge conflicts

### Review Process

1. Create PR on GitHub
2. Wait for maintainer review
3. Address feedback if requested
4. Maintainer merges when approved

## 4. Merging

### NEVER

- Merge your own PR without review
- Push directly to `main`
- Force push to `main`
- Rewrite history on shared branches

### After PR Merged

```bash
git checkout main
git pull origin main
# Delete feature branch if desired
git branch -d feat/your-feature
```

## 5. Generated Files

These files are generated and should not be committed manually:

```
node_modules/
```

These should be committed with changes:

```
package-lock.json    # Lockfile for frontend
backend/package-lock.json
```

## 6. Lockfiles

- Always commit `package-lock.json` when adding dependencies
- Don't manually edit lockfiles
- Run `npm install` after pulling changes

## 7. Gitignore

Ensure `.gitignore` includes:

```
# Dependencies
node_modules/

# Environment
.env
.env.local
.env.*.local

# Build outputs
dist/
build/

# OS files
.DS_Store
Thumbs.db

# IDE
.idea/
.vscode/

# Logs
*.log
npm-debug.log*
```

## 8. History Rewriting

### NEVER

- Rebase branches that are pushed and shared
- Force push to shared branches
- Amend commits that are pushed

### Allowed

- Amend unpushed commits (local only)
- Rebase local branches before pushing

## 9. Working with Branches

### Starting a New Feature

```bash
git checkout main
git pull origin main
git checkout -b feat/your-feature
```

### Keeping Branch Updated

```bash
git checkout main
git pull origin main
git checkout feat/your-feature
git merge main
```

### Resolving Conflicts

1. Understand the conflict
2. Keep your changes that are correct
3. Keep incoming changes that are needed
4. Remove conflict markers
5. Test the result

## 10. Attribution

End commit messages with:

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

End PR descriptions with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
