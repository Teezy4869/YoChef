# Environment Configuration

Environment variables for YoChef.

## Environment Files

| Environment | File | Purpose |
|-------------|------|---------|
| Development | `.env.development` | Local development |
| Production | `.env.production` | Production deployment |
| Testing | `.env.test` | Test environment |

## NEVER COMMIT

```
.env                 # Never commit this
.env.local          # Never commit this
.env.*.local        # Never commit these
```

## ALWAYS COMMIT

```
.env.example         # Document required variables
```

## Required Variables

### Database

```env
DATABASE_URL=postgresql://user:password@host:port/database
```

### Authentication

```env
JWT_SECRET=your-secret-key-minimum-32-characters
JWT_EXPIRES_IN=7d
```

### External Services

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key

# YouTube
YOUTUBE_API_KEY=your-youtube-api-key
```

### Application

```env
NODE_ENV=development
PORT=3000
API_URL=http://localhost:3000
```

## Optional Variables

```env
# Logging
LOG_LEVEL=info

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=60000

# File Upload
MAX_FILE_SIZE=5242880  # 5MB
ALLOWED_FILE_TYPES=image/jpeg,image/png,image/webp
```

## Environment-Specific Configuration

### Development

- Debug logging enabled
- CORS enabled for localhost
- Hot reload enabled

### Production

- Debug logging disabled
- CORS restricted
- Minification enabled

### Testing

- In-memory database (optional)
- Mocked external services
- Verbose test output

## Security Rules

1. **NEVER** commit `.env` files
2. **ALWAYS** use `.env.example` as template
3. **ALWAYS** use strong JWT secrets
4. **NEVER** expose secrets in client-side code
5. **ROTATE** secrets periodically in production
