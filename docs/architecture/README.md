# Architecture Documentation

This directory is the source of truth for system-wide technical decisions.

## Baseline architecture

KeylorFit is designed as a modular monolith with a mobile client and a server-side API:

```text
React Native / Expo / TypeScript
            |
            | HTTPS / REST / JWT
            v
      FastAPI backend
            |
            v
 PostgreSQL / Supabase
```

Supporting services:
- Supabase Auth for identity
- Supabase Storage for user media
- Expo Notifications for push notifications
- Expo SQLite for mobile offline persistence
- Docker for reproducible development/deployment
- GitHub Actions for CI/CD

## Architectural principles

1. Prefer a modular monolith over microservices until a concrete scaling or organizational requirement justifies separation.
2. PostgreSQL is the persistent source of truth for server-side business data.
3. Raw workout data is authoritative; analytics and rankings must be reproducible from it.
4. Critical business rules and authorization live server-side.
5. The mobile client is offline-capable but is not authoritative for derived statistics or security decisions.
6. API contracts are explicit and versioned through OpenAPI.
7. Structural database changes require migrations and data-integrity review.
8. Security and privacy are design concerns, not post-release add-ons.
9. Prefer simple infrastructure until complexity is demonstrated to be necessary.

## Documentation map

- `adr/`: Architecture Decision Records.
- `foundation-test-architecture.md`: M0 repository-wide taxonomy, test
  locations, PostgreSQL integration rules, isolation conventions, and smoke
  path.
- `../design-docs/`: implementation-oriented designs for bounded features or subsystems.
- `../product-specs/`: product requirements and behavior.
- `../exec-plans/`: implementation plans for milestones and complex changes.

If a proposed change materially alters an architectural principle, create or update an ADR before implementation.
