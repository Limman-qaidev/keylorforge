# Keylornet technical blueprint

This document summarizes the technical direction and rationale established during the original design work. Accepted ADRs remain authoritative where they exist.

## Architectural shape

**Accepted:** start as a modular monolith, not microservices.

Primary flow:

`React Native / Expo -> FastAPI -> PostgreSQL`

Supporting managed infrastructure:

- Supabase PostgreSQL
- Supabase Auth
- Supabase Storage
- Expo Notifications

This deliberately avoids premature Kubernetes, Kafka, Redis and service decomposition. The separation between mobile, API and PostgreSQL keeps a path open for a future web client, external integrations and infrastructure migration without coupling the mobile app directly to database implementation details.

See `docs/architecture/adr/ADR-001-modular-monolith.md`.

## Mobile

Chosen stack/direction:

- React Native
- Expo
- TypeScript
- Expo Router
- TanStack Query for server state
- Zustand for appropriate local UI/app state
- React Hook Form + Zod for forms/validation where useful
- Expo SQLite for persistent offline data
- Expo ImagePicker for media selection
- Expo Notifications for push notifications

### Offline-first invariant

**Accepted:** workout recording must be local-first. See ADR-003.

Client-generated identifiers, local persistence and explicit sync state should be used so a set can be captured without server connectivity. Mature synchronization should include retry behavior and idempotency; conflict rules are to be specified when the workout/sync domain is implemented.

The server remains authoritative after successful synchronization; offline-first does not mean duplicating business/ranking authority in the mobile client.

## Backend

Chosen stack:

- Python
- FastAPI
- Pydantic
- SQLAlchemy 2
- Alembic
- pytest

The backend is organized by domain modules rather than deployed services. Expected long-term modules include auth/users, exercises, workouts, analytics, groups, rankings, social, media and notifications.

Preferred internal flow:

`HTTP router -> service/domain logic -> repository/data access -> PostgreSQL`

Authoritative business rules, authorization and ranking methodology belong server-side.

## API contract

REST/OpenAPI is the baseline. FastAPI's OpenAPI document should become the contract used to generate a typed TypeScript client rather than manually maintaining duplicate request/response definitions in Python and TypeScript.

The generated client is a future implementation milestone; do not hand-build parallel contracts when generation becomes available.

## Database

**Accepted:** PostgreSQL with Alembic migrations.

PostgreSQL is preferred because the product is highly relational and analytics-heavy: users, sessions, sets, exercises, muscles, groups, rankings, records and social relationships need joins, constraints and reproducible aggregation.

Core conceptual model:

- `users`, `profiles`
- `groups`, `group_members`
- `muscles`, `equipment`, `exercise_categories`
- `exercises`, `exercise_muscles`, exercise instruction/media data
- `workout_sessions`, `workout_exercises`, `workout_sets`
- personal records / derived statistics
- `posts`, `post_media`, `comments`, `reactions`
- notifications / device tokens

Exact schemas, constraints and indexes must be introduced through migrations and dedicated design/implementation work; this blueprint does not substitute for migration review.

## Exercise-muscle model

Design intent is many-to-many. An exercise may contribute to several muscles with semantic roles such as `PRIMARY`, `SECONDARY`, and potentially `STABILIZER`.

A numeric contribution may eventually support normalized muscle analytics, but weights such as 1.0 / 0.5 / 0.2 are provisional examples, not committed scientific constants.

Exercise identity should preserve variant/equipment differences sufficiently for fair comparisons.

## Derived statistics

Raw workout data is authoritative:

`workout source data -> reproducible derived statistics`

For performance, derived tables/materialized calculations may later include concepts such as:

- per-user/per-exercise best weight/e1RM/volume/last performed
- activity counts by week/month/year
- cached group ranking outputs

These are accelerators, never substitutes for raw history.

## Ranking methodology guardrails

- Attendance: count qualifying completed sessions in a period; anti-gaming qualification can be added.
- Exercise strength: compare compatible exercise variants; estimated 1RM is preferred over naive max weight for rep-based strength comparison.
- Volume: `sum(weight * reps)` where that metric is meaningful.
- Muscle score: never sum raw kilograms across heterogeneous machines. Normalize comparable exercise performance first, then aggregate with explainable muscle contribution weights.

The exact formulas and eligibility rules should be versioned as business rules/tests when rankings are implemented.

## Authentication and authorization

**Accepted direction:** Supabase Auth provides identity; FastAPI validates identity/token information and applies application authorization. See ADR-002.

Never place privileged Supabase/service credentials in the mobile app.

Where Supabase Data API access is used directly, exposed tables must be protected appropriately (for example via RLS). Prefer clear server-side authorization boundaries for application business operations.

## Media

Binary images belong in object storage, not PostgreSQL. Database rows store metadata/object keys and relationships.

Media handling should include:

- allowed MIME/type checks
- size/dimension constraints
- ownership/authorization
- removal of unnecessary EXIF/location metadata before publishing
- safe deletion lifecycle

## Security and GDPR baseline

Architecture must leave room for and eventually implement:

- account deletion
- data export
- explicit privacy/visibility
- user blocking and content reporting
- server-side validation
- rate limiting
- privileged secrets only server-side
- audit trails for sensitive operations
- backups/recovery
- media constraints and EXIF hygiene

Security should not be postponed until after social features are built.

## Infrastructure

Deployment direction:

- Dockerized FastAPI
- GitHub repository and GitHub Actions CI
- PostgreSQL/Supabase managed database
- Supabase Auth and Storage
- Cloudflare DNS when public deployment is introduced

The API may eventually use `api.fit.jonathansalgadonieto.com`; a project/web/admin surface may later use related subdomains. The existing personal website should remain independent.

Containerization should keep the API portable across reasonable hosting providers rather than binding core architecture to one vendor.

## Repository shape

Monorepo is intentional. Current/target top-level areas include:

- `apps/mobile/`
- `services/api/`
- `database/`
- `packages/` (for example a generated API client later)
- `infra/`
- `.github/`
- `docs/`

## Testing and delivery principles

Foundation quality gates should include:

- backend formatting/lint/type/tests
- mobile formatting/lint/type/tests
- real PostgreSQL migration/integration validation
- reproducible local Docker environment
- branch protection using real, deterministic CI check names

Later layers add domain integration tests and mobile E2E/device tests where they provide value.

## Decision hygiene

If implementation needs to change one of these architectural fundamentals, do not silently drift the code. Raise the decision, update/supersede the relevant ADR, then update this blueprint.

Examples that require architectural review include:

- replacing the modular monolith with services
- changing auth authority/boundaries
- abandoning offline-first workout recording
- bypassing FastAPI as the business-rule layer
- changing the primary database technology
- making mobile authoritative for ranking calculations