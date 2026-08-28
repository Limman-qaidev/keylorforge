# FND-005 — Establish PostgreSQL and Alembic baseline

## Status

Ready for implementation.

## Primary owner

`data_engineer`

## Context

M0 needs a reproducible database foundation before domain tables and product migrations are introduced.

## Goal

Create the PostgreSQL/Alembic baseline, migration conventions and test-database strategy without defining product-domain schema yet.

## Scope

- create database project/configuration under `database/`
- PostgreSQL connection/config pattern using environment variables
- Alembic initialization and migration conventions
- baseline migration strategy suitable for later SQLAlchemy integration
- test database strategy and documented local commands
- validation that migrations can be applied from a clean database state

## Out of scope

- users/profiles/workouts/exercises/groups/social domain tables
- Supabase production provisioning
- authentication/RLS policies
- ranking/analytics schema
- CI workflow implementation

## Dependencies

- FND-001 completed
- FND-002 completed

## Expected affected modules

- `database/`
- only minimal backend integration points if strictly required and explicitly documented

## Acceptance criteria

- [ ] Alembic is initialized and has documented conventions
- [ ] database connection settings are environment-driven
- [ ] no credentials or secrets are committed
- [ ] a clean local/test PostgreSQL database can run the baseline migration path successfully
- [ ] migration validation commands are documented
- [ ] test database strategy is documented
- [ ] no product-domain tables are introduced
- [ ] destructive migration behavior is not introduced

## Required validation

- initialize a clean PostgreSQL test database
- run Alembic upgrade through the baseline
- verify current/head state
- verify configuration fails safely when required environment settings are missing or invalid as appropriate

## Review gates

- structural migrations are owned by `data_engineer`
- use `tech_lead` for read-only review if changing persistence architecture or ORM/migration boundaries is proposed
- coordinate with FND-003 only where backend/database configuration must align
- use `qa_engineer` for independent migration verification after implementation

## Codex execution rules

- work in an isolated worktree/branch dedicated to FND-005
- do not modify `main`
- primary write scope is `database/`
- inspect the complete diff before completion
- do not require GitHub CLI access to begin implementation
- if remote push/PR creation is unavailable in the sandbox, finish with a clean local commit and report the branch name and commit SHA for external publication
