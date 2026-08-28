# FND-003 — Create FastAPI backend skeleton

## Status

Ready for implementation.

## Primary owner

`backend_engineer`

## Context

The architecture baseline is accepted and M0 now needs an executable backend foundation before product-domain implementation begins.

## Goal

Create a minimal, production-oriented FastAPI application skeleton with a health endpoint and automated local validation commands.

## Scope

- create backend project under `services/api/`
- FastAPI application entry point
- typed configuration/settings structure
- `/health` endpoint returning a stable success contract
- baseline logging/config organization
- pytest test skeleton and health endpoint test
- formatting, linting and static type-check configuration
- local developer commands documented in the backend README or equivalent

## Out of scope

- authentication implementation
- database domain models
- Alembic structural migrations
- exercise/workout/group/social APIs
- deployment/CI workflows

## Dependencies

- FND-001 completed
- FND-002 completed

## Expected affected modules

- `services/api/`

## Acceptance criteria

- [ ] backend starts locally using the documented command
- [ ] `GET /health` returns HTTP 200 with a stable JSON response
- [ ] application configuration is typed and environment-driven
- [ ] no secrets are committed
- [ ] pytest includes a passing health endpoint test
- [ ] formatting/lint/type-check commands are configured and documented
- [ ] package/dependency declarations are reproducible
- [ ] no product-domain functionality is introduced

## Required validation

- run backend test suite
- run formatter/linter in check mode
- run static type checking
- start application and verify `/health`

## Review gates

- use `tech_lead` for read-only review if a different backend layering or dependency-management strategy is proposed
- do not create structural database migrations
- do not change repository-wide architecture
- use `qa_engineer` for independent verification after implementation

## Codex execution rules

- work in an isolated worktree/branch dedicated to FND-003
- do not modify `main`
- stay within `services/api/`
- inspect the complete diff before completion
- do not require GitHub CLI access to begin implementation
- if remote push/PR creation is unavailable in the sandbox, finish with a clean local commit and report the branch name and commit SHA for external publication
