# Development Troubleshooting

Common development issues and solutions for YoChef.

## NOT SPECIFIED

Troubleshooting procedures are **NOT SPECIFIED** in the current repository.

**Update with actual issues and solutions as they arise.**

## Common Issues

### Node.js Issues

#### "command not found: npm"

```bash
# Install Node.js from nodejs.org
# or use nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install node
nvm use node
```

#### "EACCES: permission denied"

```bash
# Fix npm permissions
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

### Database Issues

#### "Connection refused" / "ECONNREFUSED"

1. Check PostgreSQL is running:
```bash
# macOS
brew services start postgresql

# Linux
sudo systemctl start postgresql
```

2. Check connection string in `.env`:
```
DATABASE_URL=postgresql://user:password@localhost:5432/yochef
```

3. Check database exists:
```bash
createdb yochef
```

#### "relation does not exist"

1. Run migrations:
```bash
npm run db:migrate
```

2. Or recreate database:
```bash
npm run db:reset
```

### API Issues

#### "Network Error" / CORS errors

1. Check backend is running
2. Check `CORS` configuration in backend
3. Check `API_URL` in frontend environment

#### "401 Unauthorized"

1. Check JWT token is valid
2. Check token hasn't expired
3. Check `Authorization` header is included

### Frontend Issues

#### Metro Bundler not starting

```bash
cd frontend
rm -rf node_modules/.cache
npm start -- --reset-cache
```

#### "Unable to resolve module"

1. Check module is installed
2. Check import path is correct
3. Run `npm install` again

### External Service Issues

#### Supabase Storage errors

1. Check `SUPABASE_URL` and `SUPABASE_KEY`
2. Check bucket permissions
3. Check network connectivity

#### YouTube API errors

1. Check `YOUTUBE_API_KEY` is valid
2. Check API quotas haven't been exceeded
3. Check request format is correct

## Getting Help

If issues persist:

1. Check project documentation
2. Check error logs
3. Search for similar issues
4. Ask project maintainer

## Update When Implemented

Add actual issues and solutions as they arise during development.
