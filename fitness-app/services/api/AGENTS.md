# Backend Engineering Instructions

These instructions extend the repository-level `AGENTS.md` for `services/api/`.

## Ownership

Primary implementation owner: `backend_engineer`.

Use `data_engineer` for structural database schema changes and migrations. Use `qa_engineer` for independent API/integration verification. Use `tech_lead` for cross-module contracts, architectural changes, or major dependencies. Use `security_engineer` for authentication, authorization, privacy, upload, secret, or sensitive-data changes.

## Technology baseline

The backend uses:
- Python 3
- FastAPI
- Pydantic
- SQLAlchemy 2
- Alembic
- PostgreSQL
- Supabase Auth integration
- pytest

Do not replace these technologies or introduce a competing application framework without an approved architectural decision.

## Module structure

Use the modular-monolith pattern. Prefer feature/domain modules such as:
- auth
- users
- exercises
- workouts
- groups
- rankings
- analytics
- social
- media
- notifications

Within a feature, keep responsibilities separated conceptually as:

`router -> service -> repository -> database`

- Routers handle HTTP concerns, dependency injection, request/response mapping, and status codes.
- Services contain business rules and orchestration.
- Repositories contain persistence access.
- Pydantic schemas define public request/response contracts.
- SQLAlchemy models must not leak directly as public API contracts.

## Python quality

- Use explicit typing for public functions and important internal boundaries.
- Follow PEP 8 and the configured formatter/linter.
- Prefer small functions with single responsibilities.
- Avoid hidden global state.
- Avoid broad exception catches unless the error is translated intentionally.
- Do not suppress type errors without documenting why.

## API contracts

- Treat OpenAPI as a contract with the mobile client.
- Preserve backwards compatibility unless the Issue explicitly allows a breaking change.
- Use consistent naming, pagination, validation, and error semantics defined by repository architecture docs.
- Do not add undocumented response fields as an accidental side effect of ORM serialization.
- Return appropriate HTTP status codes; do not encode failures as successful `200` responses.
- Mutation endpoints that participate in offline synchronization must follow the approved idempotency/conflict strategy.

## Authentication and authorization

- Authentication proves identity; authorization must still be enforced for every protected resource.
- Never trust ownership, group membership, roles, visibility, or permissions supplied only by the client.
- Resource access must be checked server-side.
- Do not expose privileged Supabase credentials to mobile clients.
- Sensitive authorization changes require `security_engineer` review.

## Database boundary

`backend_engineer` must not create or modify structural Alembic migrations unless explicitly delegated by `data_engineer`.

If implementation requires a schema change:
1. describe the required table/column/constraint/index change,
2. coordinate with `data_engineer`,
3. continue only against the agreed schema/contract.

Do not work around missing schema by adding JSON blobs, duplicated columns, or ad-hoc persistence.

## Business rules

- Authoritative business rules live server-side.
- Ranking and derived-statistic formulas must have one authoritative implementation.
- Raw workout data remains the source of truth for reproducible analytics.
- Avoid embedding domain logic in SQL query construction when it belongs in a named service/domain function, unless the logic is inherently set-based and documented.

## Testing

For changes in this subtree, add relevant:
- unit tests for pure/domain logic
- service tests
- repository/database integration tests
- FastAPI endpoint tests
- authorization tests for protected resources
- regression tests for fixed bugs

Tests should use real PostgreSQL semantics for behavior that depends on PostgreSQL; do not assume SQLite is an equivalent integration database.

## Before completing work

- inspect the complete diff
- run configured formatting/lint checks
- run configured type checks
- run relevant pytest suites
- inspect OpenAPI changes when endpoints/schemas changed
- verify acceptance criteria
- report anything that could not be validated

Do not modify mobile code, structural database migrations, infrastructure, or unrelated modules as part of a backend task.