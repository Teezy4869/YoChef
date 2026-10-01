# Production Deployment

Production deployment for YoChef.

## NOT SPECIFIED

Production deployment is **NOT SPECIFIED** in the current repository.

## Expected Requirements

### Production Environment Variables

```env
NODE_ENV=production
DATABASE_URL=postgresql://...
JWT_SECRET=<strong-secret>
SUPABASE_URL=https://...
SUPABASE_KEY=<production-key>
YOUTUBE_API_KEY=<production-key>
```

### Production Security

- HTTPS enabled
- JWT secrets rotated
- Database credentials secured
- No debug logging
- Rate limiting enabled

### Monitoring

**NOT SPECIFIED** - Document when configured:

- Error tracking
- Performance monitoring
- Uptime monitoring
- Log aggregation

## Update When Implemented

- Document actual production deployment
- Document CI/CD pipeline
- Document monitoring setup
- Document rollback procedures
