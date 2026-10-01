# Deployment Overview

Deployment documentation for YoChef.

## NOT SPECIFIED

Production deployment is **NOT SPECIFIED** in the current repository.

The project uses the following technology stack but deployment procedures need to be defined:

- **Frontend**: React Native (Expo or CLI)
- **Backend**: Node.js + Express.js
- **Database**: PostgreSQL (Supabase or self-hosted)
- **Storage**: Supabase Storage

## Expected Deployment Options

### Frontend

1. **Expo** (if using Expo)
   - `eas build`
   - `eas submit`

2. **React Native CLI**
   - Android: Gradle build → APK/AAB
   - iOS: Xcode build → IPA

### Backend

1. **Vercel** (if configured)
   - `vercel deploy`

2. **Docker** (if containerized)
   - `docker build`
   - `docker run`

3. **Traditional**
   - PM2 or similar process manager
   - Reverse proxy (nginx)

### Database

1. **Supabase** (managed PostgreSQL)
2. **Self-hosted PostgreSQL**
3. **Cloud provider** (AWS RDS, etc.)

## Pre-Deployment Checklist

- [ ] All tests pass
- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Build succeeds
- [ ] Secrets configured in production
- [ ] Monitoring/alerting configured

## Update When Implemented

- Document actual deployment process
- Document deployment commands
- Document CI/CD pipeline
- Document rollback procedures
