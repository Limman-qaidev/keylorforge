# Foundation test architecture

- Status: Proposed for M0; pending independent review and FND-010 reconciliation
- Owner: `qa_engineer`
- Scope: repository-wide test strategy and conventions

## Purpose and scope

This document defines the test foundation for Keylornet's modular monolith and
mobile client. It complements the accepted architecture decisions; it does not
change API, database, authentication, or offline-sync contracts.

The strategy keeps the fastest useful checks close to the code they validate,
uses real PostgreSQL whenever PostgreSQL behaviour is at stake, and reserves
device-level end-to-end testing for a demonstrated product risk. It intentionally
sets no arbitrary coverage-percentage gate: test selection is driven by the
behaviour, risk, and boundary being changed.

## M0 inventory

The following inventory is the starting point for this strategy. Existing files
may stay where they are; new tests follow the locations below without a
mechanical relocation of passing M0 coverage.

| Area | Existing coverage | Current classification |
| --- | --- | --- |
| `services/api/tests/test_config.py` | Settings validation | Unit |
| `services/api/tests/test_logging_config.py` | Logging configuration preserves external handlers | Unit |
| `services/api/tests/test_health.py` | `GET /health` returns the stable HTTP response through FastAPI's test client | Contract/component |
| `database/tests/test_config.py` | URL driver and disposable-test-target validation; engine/session construction | Unit |
| `database/tests/test_migrations.py` | Upgrade an explicitly configured clean PostgreSQL database and record Alembic head | Integration |
| `apps/mobile/components/__tests__/development-status.test.tsx` | Development-status component rendering | Component |

The backend, mobile, and database CI workflows execute their own validation
commands on every pull request targeting `main`. Database CI additionally
asserts that its migration integration test was executed rather than skipped.

## Taxonomy

### Unit

Unit tests exercise a deterministic function, class, validation rule, or
state transition without a network, device, database, filesystem, process, or
wall-clock dependency. Mock only the direct boundary when it is necessary to
keep the test unit-scoped. Examples include Pydantic settings validation,
pure domain services, normalisation helpers, and API-client URL construction.

### Integration

Integration tests exercise two or more real application components or an
external technology boundary. PostgreSQL integration tests use a real
PostgreSQL database, never SQLite. Examples include migrations, SQLAlchemy
repositories, transactions, constraints, PostgreSQL-specific SQL, and later
FastAPI dependencies backed by PostgreSQL.

### Contract/component

Contract tests protect the published behaviour at a module boundary. For the
backend, they use FastAPI's test client to assert HTTP status, JSON schema,
and documented error semantics without making a production network call. For
mobile, component tests render a user-visible component and assert meaningful
loading, success, and failure states. API-client tests protect how the mobile
client consumes an already-defined HTTP contract; they do not duplicate server
business-rule coverage.

### Smoke

Smoke checks validate the smallest deployable development path after the
component suites pass. They favour a short, representative journey over an
exhaustive feature matrix. The M0 smoke path is defined below and is an
acceptance check, not a substitute for unit, contract/component, or database
integration coverage.

### Future E2E

End-to-end tests will cover a user journey across a built mobile client and a
reachable API only when a later feature has a demonstrated cross-device or
cross-process risk that component and integration tests cannot cover. The
first such proposal must identify the journey, platform/device matrix,
reproducibility approach, CI cost, and owner. M0 does not add a heavyweight
mobile E2E framework or an E2E coverage gate.

## Authoritative locations and ownership

| Test kind | Authoritative location | Primary owner | Independent validation |
| --- | --- | --- | --- |
| Backend unit and contract/component | `services/api/tests/unit/` and `services/api/tests/contract/` | `backend_engineer` | `qa_engineer` |
| Backend PostgreSQL integration | `services/api/tests/integration/` | `backend_engineer`, with `data_engineer` for migration/schema semantics | `qa_engineer` |
| Database unit | `database/tests/unit/` | `data_engineer` | `qa_engineer` |
| Database migration/integration | `database/tests/integration/` | `data_engineer` | `qa_engineer` |
| Mobile unit/component/API-client | feature-local `__tests__/` directories in `apps/mobile/`, or `apps/mobile/lib/**/__tests__/` for shared client code | `mobile_engineer` | `qa_engineer` |
| Future mobile E2E | `apps/mobile/e2e/` only after an approved need | `mobile_engineer` | `qa_engineer` |
| Cross-repository smoke runbook | this document and the relevant feature runbook | feature owner | `qa_engineer` |

Existing flat M0 test files remain valid and are classified by behaviour in the
inventory. A feature that adds tests should use the authoritative directory
for its type; a focused change may retain an existing file when moving it would
be unrelated churn.

`qa_engineer` owns the cross-repository strategy, independent acceptance
criteria, and regression-risk assessment. `devops_engineer` owns the workflow
implementation that runs these commands, but does not replace the feature
owner's responsibility for meaningful tests. A change to an API contract,
migration strategy, or mobile offline boundary requires the existing specialist
review rules in the scoped `AGENTS.md` files.

## PostgreSQL integration rules and test-database safety

Real PostgreSQL is mandatory for:

- every Alembic upgrade/downgrade or migration-chain test;
- PostgreSQL-specific SQLAlchemy URL/driver, SQL, type, constraint, index,
  transaction, locking, isolation, or query-plan behaviour;
- repository behaviour whose correctness depends on PostgreSQL semantics;
- any defect reproduced against PostgreSQL or the production-compatible
  database boundary.

Pure validation, formatting, type checking, FastAPI contract tests without
persistence, and mobile rendering/client-state tests do not require a database.
They must not pretend to validate database semantics.

The test target contract is intentionally defensive:

1. Integration tests receive `KEYLORNET_TEST_DATABASE_URL`, never an inferred
   development or production URL.
2. Test setup sets `KEYLORNET_ENVIRONMENT=test` and validates that the database
   name ends in `_test` before touching it.
3. The supported driver is only `postgresql+psycopg://` with psycopg 3.
4. Migration tests require a clean, explicitly provisioned disposable target
   and fail if the public schema is not clean. They do not drop, truncate, or
   recreate a database automatically.
5. Docker/local cleanup remains an explicit operator action. No test helper
   may widen its target or delete a non-test database for convenience.

GitHub Actions provisions its ephemeral `keylornet_test` PostgreSQL service
and must continue to fail if the migration test is skipped. Local runs use the
separately provisioned `keylornet_test` database described in `infra/README.md`.

## Fixtures, environment, and isolation conventions

- Tests set environment variables through their framework's scoped mechanism
  (for example, pytest's `monkeypatch`) and restore process state afterwards.
  Do not depend on a developer's `.env` file or committed credentials.
- Tests create a fresh app/client or component render for each case unless a
  documented fixture has a narrower safe lifecycle. Tests must clean up mutable
  global state such as logging handlers.
- A test needing external time, randomness, HTTP, storage, notifications, or
  device APIs injects or mocks that direct boundary at the smallest useful
  scope. Assertions stay on observable behaviour rather than implementation
  details.
- Database tests declare the fixture they need and use a unique, disposable
  `_test` target. A migration-chain test starts from a clean target; tests that
  need seeded data own deterministic fixtures and leave no hidden shared state.
- Mobile tests reset mocked API/environment state between cases. They must
  assert a user-visible loading/success/failure outcome where networking is
  part of the feature, rather than relying only on implementation calls.

## M0 foundation smoke path

The authoritative M0 health route is:

```text
Mobile -> GET /health -> FastAPI -> 200 -> visible development status
```

Before the final FND-010 acceptance, the mobile-specific execution details in
this section are provisional. FND-011 does not invent a second client path or
override FND-010's validated API abstraction. When FND-010 is ready, reconcile
this runbook with its actual tests, configuration names, supported emulator /
simulator host, and physical-device LAN instructions.

The smoke run is:

1. From a clean local Docker state, use the documented Compose commands to
   start PostgreSQL and confirm the development and `keylornet_test` databases
   are healthy.
2. Install constrained database dependencies; run Alembic upgrade/current on
   the development database and the real database pytest suite against the
   disposable `_test` target.
3. Install constrained backend dependencies; start FastAPI locally and verify
   `GET /health` returns HTTP `200` with `{"status":"ok"}`.
4. Configure the mobile app through its documented public development API base
   URL. For an emulator/simulator use its documented host mapping; for a
   physical device use a reachable LAN address, never an assumed `localhost`.
5. Start the mobile development build and observe the FND-010 loading then
   healthy state. Exercise an unavailable API target and confirm the visible
   error state is recoverable and the app does not crash.
6. Stop local services using the documented non-destructive teardown. Reset
   the named Docker volume only when an explicit clean-state run is required.

The required CI checks remain complementary evidence, not a replacement for
this local end-to-end development smoke run:

- `Backend CI / Backend CI`
- `Mobile CI / mobile-quality`
- `Database Migration CI / Database migration validation`

## Duplication and gaps

- Keep endpoint contract assertions at the FastAPI boundary and client
  consumption/state assertions in mobile. Do not repeat backend business-rule
  matrices in React Native tests.
- Keep migration-chain correctness in database integration tests. Backend
  repositories add PostgreSQL integration coverage only for their own query or
  transaction behaviour, not to repeat baseline migration tests.
- M0 currently has no real device E2E automation, authentication,
  authorization, offline synchronization, domain database schema, or product
  workflow coverage. These are intentional gaps for later milestones, not
  permission to skip the appropriate tests when those features are introduced.
- FND-010 must add focused coverage for the mobile API abstraction and visible
  health states. Its final validated configuration is the pending reconciliation
  item for this smoke path.
