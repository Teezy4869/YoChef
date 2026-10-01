# Documentation Rules

When and how to update documentation for YoChef.

## 1. Documentation Source of Truth

| Concern | Documentation |
|---------|---------------|
| Project overview | `App in4.md` |
| Architecture | `docs/architecture/` |
| API contracts | `docs/api/` |
| Database schema | `docs/database/` |
| Development setup | `docs/development/` |
| Testing | `docs/testing/` |
| Deployment | `docs/deployment/` |

## 2. When to Update Documentation

### Architecture Changes
Update: `docs/architecture/`

### API Changes
Update: `docs/api/`
- Add new endpoint documentation
- Update existing endpoint documentation
- Document parameter changes

### Database Changes
Update: `docs/database/`
- Update schema diagrams
- Add migration notes
- Document new tables/columns

### Testing Changes
Update: `docs/testing/`

### Deployment Changes
Update: `docs/deployment/`

### Project Configuration Changes
Update: `App in4.md`

## 3. Documentation Quality

### Good Documentation

- Uses project-specific terminology
- Includes concrete examples
- Is verifiable (can check against implementation)
- Is kept up-to-date with code changes

### Bad Documentation

- Generic advice that applies to any project
- Instructions that don't match implementation
- Outdated information
- Missing for new features

## 4. API Documentation

Each API endpoint should document:

- Endpoint path (e.g., `/api/recipes`)
- HTTP method (GET, POST, etc.)
- Request parameters
- Request body (if applicable)
- Response format
- Error responses
- Authentication requirements

## 5. README Updates

Update `README.md` when:

- Project setup changes
- New commands are added
- Configuration requirements change

## 6. Inline Documentation

Add comments when:

- Purpose is not obvious from code
- Business logic is complex
- Workarounds or temporary solutions are used
- Important decisions need explanation

Don't add comments when:

- Code is self-explanatory
- Comment would duplicate what code says

## 7. Keeping Docs Current

- Update documentation in same PR as changes
- Don't leave documentation debt
- Mark incomplete documentation as "TODO" or "NOT SPECIFIED"

## 8. Project Memory

Use `docs/project-memory/` for:

- Current implementation state
- Known issues
- Lessons learned
- Not documented elsewhere

Project memory is NOT:

- A transcript of work
- A duplicate specification
- A comprehensive encyclopedia

## 9. Documentation Files

### Required Documentation

```
README.md              # Project overview and setup
AGENTS.md              # Agent operating guide
docs/
├── architecture/      # System architecture
├── api/               # API documentation
└── database/          # Database documentation
```

### Optional Documentation

```
docs/
├── development/       # Development guides
├── testing/           # Testing documentation
├── deployment/        # Deployment guides
└── project-memory/    # Implementation notes
```

## 10. Verification

After updating documentation:

1. Verify documentation is accurate
2. Check links are valid
3. Ensure examples work
4. Review for consistency with other docs
