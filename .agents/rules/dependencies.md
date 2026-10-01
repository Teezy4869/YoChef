# Dependencies Rules

Managing dependencies for YoChef.

## 1. Core Dependencies

Technology stack is fixed. Do not replace or duplicate:

| Layer | Technology |
|-------|------------|
| Frontend | React Native |
| Backend | Node.js + Express.js |
| Database | PostgreSQL |
| Auth | JWT + bcrypt |
| Storage | Supabase Storage |
| HTTP Client | Axios |
| Routing | React Navigation |

## 2. Adding Dependencies

### ASK FIRST

Before adding any new dependency:

1. Explain the concrete requirement
2. Show existing dependencies that don't meet the need
3. Evaluate alternatives
4. Get approval from project maintainer

### When a New Dependency Might Be Needed

- Requirement cannot be met with existing dependencies
- Benefit clearly outweighs maintenance cost
- Well-maintained library with good documentation
- Compatible with existing stack

### When NOT to Add Dependencies

- "It might be useful later"
- Existing solution works but isn't "perfect"
- Project already has similar functionality
- Overkill for the use case

## 3. Inspecting Existing Functionality

Before adding dependencies:

1. Search existing codebase for related functionality
2. Check if existing modules can be extended
3. Verify the need cannot be met with vanilla JS/Node
4. Check package.json for related packages

```bash
# Search for related code
grep -r "relatedTerm" src/

# Check package.json
cat package.json
```

## 4. Dependency Locations

| Application | Dependency File |
|-------------|-----------------|
| Frontend | `frontend/package.json` |
| Backend | `backend/package.json` |

Each application manages its own dependencies.

## 5. Adding a New Dependency

After approval:

```bash
# Frontend
cd frontend
npm install <package-name>

# Backend
cd backend
npm install <package-name>
```

Commit the dependency and lockfile together.

## 6. Removing Dependencies

When removing a dependency:

1. Verify no code uses it
2. Remove from package.json
3. Update any code that imported it
4. Run tests to verify nothing broke

## 7. Lockfiles

- Commit `package-lock.json` with dependency changes
- Don't manually edit lockfiles
- Run `npm install` after pulling changes

## 8. Peer Dependencies

Check for peer dependency conflicts:

```bash
npm install <package-name>
# Watch for peer dependency warnings
```

## 9. Environment-Specific Dependencies

### Development Dependencies

```bash
npm install --save-dev <package-name>
```

### Production Dependencies

```bash
npm install --save <package-name>
```

Use `--save-dev` for:
- Testing frameworks
- Build tools
- Linters
- Formatters

## 10. Version Updates

When updating dependencies:

1. Check changelog for breaking changes
2. Update in isolation first
3. Run tests after update
4. Update lockfile
5. Commit with descriptive message

## 11. Forbidden Dependencies

Do NOT add:

- Elasticsearch (PostgreSQL search is sufficient)
- Additional database ORMs (Drizzle is not specified, but use what's in package.json)
- TikTok API (out of scope)
- AI services for MVP (out of scope)

## 12. Dependency Verification

After adding dependencies:

```bash
# Verify installation
npm list

# Check for vulnerabilities
npm audit

# Update lockfile
npm install
```
