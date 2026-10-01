# Database Migrations

Database migration guidelines for YoChef.

## NOT SPECIFIED

Migration procedures are **NOT SPECIFIED** in the current repository.

## Expected Migration Process

### Migration Tools

Based on the technology stack:

- Option 1: Manual SQL migrations in `database/migrations/`
- Option 2: Drizzle Kit migrations (if Drizzle ORM is used)
- Option 3: Sequelize migrations (if Sequelize ORM is used)

### Migration File Naming

```
database/migrations/
├── 001_initial_schema.sql
├── 002_add_recipe_videos.sql
├── 003_add_user_profiles.sql
└── ...
```

### Migration Process

1. Create migration file with timestamp/sequential number
2. Test migration on development database
3. Review migration for safety
4. Apply to production (with backup)

### Before Running Migrations

- [ ] Backup production database
- [ ] Test migration on development
- [ ] Test migration on staging (if available)
- [ ] Schedule maintenance window (if needed)

### Migration Safety Rules

1. **NEVER** delete columns directly — use deprecation first
2. **ALWAYS** add columns as nullable initially
3. **ALWAYS** test rollback procedures
4. **ALWAYS** document rollback steps

## Update When Implemented

- Document actual migration tools used
- Document migration procedures
- Document rollback procedures
