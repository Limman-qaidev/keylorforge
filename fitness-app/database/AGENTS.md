# Database and Analytics Engineering Instructions

These instructions extend the repository-level `AGENTS.md` for `database/`.

## Ownership

Primary owner: `data_engineer`.

Structural schema changes, Alembic migrations, data constraints, indexes, seed strategy, ranking SQL, and historical-data integrity belong to this role. Use `tech_lead` for material modelling decisions, `qa_engineer` for migration/integration validation, and `security_engineer` when RLS, privacy, ownership, or sensitive-data access is involved.

## Database principles

- PostgreSQL is the persistent system of record.
- Prefer normalized relational structures for core domain data.
- Raw workout records are authoritative source data.
- Derived statistics and rankings must be reproducible from source workout data.
- Use database constraints to enforce invariants that must never be violated.
- Foreign keys must be explicit unless a documented reason prevents them.
- Nullability must be intentional.
- Naming must remain consistent across schema, ORM and API design.
- Do not store opaque JSON for relational domain concepts merely to avoid proper modelling.

## Identifiers and timestamps

Follow the repository-wide conventions documented by architecture decisions. Do not introduce a new identifier strategy, timestamp timezone convention, or soft-delete pattern within an isolated migration.

## Migrations

Structural migrations are owned by `data_engineer`.

For every migration:
- make the intended schema transition explicit
- assess data-loss risk
- assess lock/runtime impact where relevant
- prefer additive and backwards-compatible changes
- consider deployment ordering between old/new application versions
- provide deterministic upgrade behavior
- provide downgrade behavior when reasonably safe; otherwise document why rollback requires a forward fix
- never silently discard, truncate, or reinterpret existing production data

Destructive operations require explicit authorization and a documented data-migration/backout strategy.

Do not modify an existing migration that may already have been applied to a shared environment; create a new migration instead unless the repository is unequivocally still pre-deployment and the task explicitly authorizes rewriting history.

## Constraints and indexes

- Use unique constraints for true domain uniqueness.
- Use check constraints for stable database-level invariants where practical.
- Indexes require a stated query/access pattern; avoid speculative indexing.
- Consider composite-index column order against actual filters/sorts.
- Consider partial indexes when they materially improve a known access pattern.
- Foreign-key columns used in common joins/deletes should be evaluated for indexes.

## Exercise and workout modelling

Keep distinctions explicit between:
- canonical exercises and user-defined/custom exercises
- exercises and their muscle relationships
- workout sessions, workout exercises and individual sets
- raw measurements and derived performance statistics

Do not assume every exercise is represented only by weight and repetitions. The schema must be able to accommodate the approved exercise measurement types without making irrelevant fields mandatory.

## Rankings and analytics

- Exercise rankings and aggregate muscle scores are different metrics.
- Do not compare raw weight values across arbitrary machines as equivalent measures of strength.
- Estimated 1RM methodology must be explicit, versionable if methodology may evolve, and covered by tests.
- Volume calculations must define exactly which sets count.
- Time-window boundaries for week/month/year must be explicit and timezone-aware according to the approved product convention.
- Ranking ties must have deterministic behavior.
- Group rankings must enforce membership/visibility semantics through the application/security design.
- Cached/materialized derived data must be regenerable from source data and must not become the sole source of truth.

## Seed and catalog data

- Keep seed operations deterministic and repeatable.
- Distinguish development/test fixtures from product catalog seed data.
- Imported exercise data must preserve provenance/licensing metadata when required by the product design.
- Do not make runtime application availability depend on an external exercise API when the architecture calls for an internal curated catalog.

## Testing

Changes should include relevant:
- migration upgrade tests
- migration/data-preservation tests when existing data is transformed
- constraint tests
- PostgreSQL integration tests
- analytical-query tests
- deterministic ranking/tie tests
- boundary-date tests for period calculations

Do not validate PostgreSQL-specific behavior solely against SQLite.

## Before completing work

- inspect the schema and migration diff
- run the complete migration chain on a clean database
- test upgrade from the relevant previous revision when applicable
- run database/integration tests
- inspect generated SQL for material analytical queries
- evaluate data-loss and deployment risks
- verify acceptance criteria
- report anything that could not be validated

Do not modify mobile UI, unrelated backend features, CI/CD, or infrastructure as part of a database task.