# Development Commands

Common development commands for YoChef.

## NOT SPECIFIED

The exact commands are **NOT SPECIFIED** until `package.json` files are created.

**Update this file when the project is initialized.**

## Expected Frontend Commands

### Setup

```bash
cd frontend
npm install          # Install dependencies
```

### Development

```bash
npm run dev          # Start development server
npm start            # Start Expo/React Native
```

### Build

```bash
npm run build        # Build for production
npm run build:android # Build Android APK
npm run build:ios    # Build iOS app
```

### Testing

```bash
npm test             # Run tests
npm run test:watch   # Watch mode
npm run test:coverage # With coverage
```

### Linting

```bash
npm run lint         # Run ESLint
npm run lint:fix     # Fix linting issues
```

## Expected Backend Commands

### Setup

```bash
cd backend
npm install          # Install dependencies
```

### Development

```bash
npm run dev          # Start with hot reload
npm start            # Start production server
```

### Database

```bash
npm run db:migrate   # Run migrations
npm run db:seed      # Run seed data
npm run db:reset     # Reset database
```

### Testing

```bash
npm test             # Run tests
npm run test:watch   # Watch mode
npm run test:coverage # With coverage
```

### Linting

```bash
npm run lint         # Run ESLint
npm run lint:fix     # Fix linting issues
```

## Common Workflow Commands

### Install All Dependencies

```bash
# Frontend
cd frontend && npm install

# Backend
cd backend && npm install
```

### Run Full Stack

```bash
# Terminal 1: Backend
cd backend && npm run dev

# Terminal 2: Frontend
cd frontend && npm run dev
```

## Update When Implemented

- Document actual npm scripts
- Document additional commands
- Document environment setup
