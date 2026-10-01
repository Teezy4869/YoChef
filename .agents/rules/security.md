# Security Rules

Security requirements for YoChef.

## 1. Secrets

### NEVER

- Commit secrets to Git
- Hard-code credentials in source code
- Include API keys in repository
- Include passwords in commits

### ALWAYS

- Use environment variables for secrets
- Store secrets in `.env` (not committed)
- Use `.env.example` to document required variables

## 2. Environment Variables

Required environment variables (document in `.env.example`):

```
DATABASE_URL=
JWT_SECRET=
YOUTUBE_API_KEY=
SUPABASE_URL=
SUPABASE_KEY=
```

Never commit `.env` files.

## 3. Authentication

- Use JWT for API authentication
- Hash passwords with bcrypt
- Implement token expiration
- Store tokens securely on client

## 4. Authorization

### Backend (Authoritative)

- Verify permissions server-side
- Don't trust frontend authorization checks
- Check ownership before modifications
- Validate user role for protected operations

### Frontend

- Only show UI based on user permissions
- Don't rely on UI hiding for security
- Always validate server-side

## 5. Input Validation

### Backend

- Validate all input at API endpoints
- Sanitize user input before database operations
- Use parameterized queries (prevent SQL injection)
- Validate data types and ranges

### Frontend

- Basic validation for UX
- Don't trust frontend validation for security

## 6. Sensitive Data

| Data | Storage | Access |
|------|---------|--------|
| Passwords | Hashed only | Never stored in plain text |
| JWT tokens | HttpOnly cookies or secure storage | Client + Server |
| API keys | Environment variables | Server only |
| User data | PostgreSQL | Server only |
| Cooking photos | Supabase Storage | Authenticated users |

## 7. API Security

- Validate authentication on protected routes
- Rate limit public endpoints
- Use HTTPS in production
- Don't expose internal errors to clients

## 8. Production Restrictions

### NEVER

- Log sensitive data (passwords, tokens)
- Expose stack traces to users
- Use debug mode in production
- Connect to non-production databases

### ASK FIRST

- Database migrations in production
- Configuration changes affecting security
- Access to production credentials

## 9. Security-Sensitive Files

Protect these files:

```
.env                    # Never commit
.env.local             # Never commit
*.key                  # Never commit
credentials.json        # Never commit
```

## 10. External Services

- Validate responses from external APIs
- Don't trust external data without validation
- YouTube API returns reference videos only
- Supabase Storage for user-uploaded images

## 11. Security Checklist

```
[ ] No secrets committed
[ ] Passwords hashed with bcrypt
[ ] JWT tokens properly validated
[ ] Input validated server-side
[ ] SQL injection prevented
[ ] Environment variables documented in .env.example
[ ] No sensitive data in logs
[ ] External API responses validated
```

## 12. Reporting Security Issues

If a security vulnerability is discovered:

1. Don't commit the vulnerability details publicly
2. Report to project maintainer
3. Wait for fix before disclosing
