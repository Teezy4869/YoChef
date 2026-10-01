# Development Setup

Development environment setup for YoChef.

## Requirements

Based on `App in4.md`:

- **Node.js** (LTS version recommended)
- **npm** (comes with Node.js)
- **PostgreSQL** (version compatible with project)
- **Git** (for version control)

### External Services

- **Supabase account** (for storage)
- **YouTube Data API key** (for videos)

## Setup Steps

### 1. Clone the Repository

```bash
git clone <repository-url>
cd cooking-app
```

### 2. Install Dependencies

**Frontend:**
```bash
cd frontend
npm install
```

**Backend:**
```bash
cd backend
npm install
```

### 3. Configure Environment

Copy environment template:

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/yochef
JWT_SECRET=your-secret-key
YOUTUBE_API_KEY=your-youtube-api-key
SUPABASE_URL=your-supabase-url
SUPABASE_KEY=your-supabase-key
```

### 4. Setup Database

Create database:

```bash
createdb yochef
```

Run migrations:

```bash
cd database
psql -d postgresql://user:password@localhost:5432/yochef -f schema.sql
```

Run seeds (optional):

```bash
psql -d postgresql://user:password@localhost:5432/yochef -f seed.sql
```

### 5. Start Development Servers

**Backend:**
```bash
cd backend
npm run dev
```

**Frontend:**
```bash
cd frontend
npm run dev
```

## IDE Setup

### VS Code (Recommended)

Recommended extensions:

- ESLint
- Prettier
- React Native tools
- PostgreSQL

## Troubleshooting

See `development/troubleshooting.md`
