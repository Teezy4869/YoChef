# ADR-001: Technology Stack Selection

> This is an EXAMPLE ADR template. Replace with actual decisions when documented.

## Status

Accepted

## Date

Not specified

## Context

We need to select the technology stack for the YoChef cooking app MVP.

## Decision

The following technology stack has been selected:

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Frontend | React Native | Cross-platform mobile development |
| Backend | Node.js + Express.js | JavaScript ecosystem, familiar to team |
| Database | PostgreSQL | Relational data, full-text search |
| Auth | JWT + bcrypt | Stateless auth, secure password storage |
| Storage | Supabase Storage | Managed image storage |
| External Video | YouTube Data API | Reference videos for recipes |

## Alternatives Considered

### Frontend

- **Flutter**: Rejected — less team familiarity
- **Native (iOS/Android)**: Rejected — separate codebases

### Backend

- **Python + Flask/Django**: Considered — selected Node.js for consistency
- **Go**: Considered — steeper learning curve

### Database

- **MongoDB**: Rejected — relational data fits SQL better
- **Elasticsearch**: Rejected — PostgreSQL search sufficient for MVP

## Consequences

### Positive

- Single language (JavaScript/TypeScript) across stack
- React Native enables cross-platform mobile
- PostgreSQL handles structured recipe data well
- Full-text search available without additional infrastructure

### Negative

- React Native may have performance limitations for complex animations
- Node.js not optimal for CPU-intensive operations
- PostgreSQL full-text search has limitations vs. dedicated search engines

## Notes

- Stack may evolve as project requirements clarify
- Consider Elasticsearch only if PostgreSQL search proves insufficient at scale
