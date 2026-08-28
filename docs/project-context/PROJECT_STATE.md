# Keylornet project state

Last updated: 2026-08-28

This is the fast handoff for resuming work. It is intentionally operational and may become stale if not updated after merges; GitHub issues, PRs and `main` are the final authority for real-time status.

## Current milestone

**M0 — Foundation**

Goal: establish a reproducible professional baseline before implementing identity or product-domain features.

M0 gate includes:

- backend skeleton
- mobile skeleton
- PostgreSQL/Alembic baseline
- reproducible local Docker/PostgreSQL environment
- backend CI
- mobile CI
- database migration CI
- real mobile-to-API health path
- coherent test architecture
- protected `main` using real CI checks
- independent QA/review gates

## Merged foundation work

- FND-003 FastAPI skeleton — merged
- FND-004 Expo/React Native mobile skeleton — merged
- FND-005 PostgreSQL/Alembic baseline — merged
- FND-007 Backend CI — merged

Current `main` at the time of this update includes FND-007.

## Open M0 work

### FND-006 — Local Docker environment

- Issue: #15
- PR: #20
- Branch: `codex/fnd-006-local-docker`
- State: draft, mergeable
- Implementation validation reported: Compose config, fresh PostgreSQL health, dev/test databases, Alembic upgrade/current and 11 database tests
- Remaining gate: independent QA completion before merge

### FND-008 — Mobile CI

- Issue: #17
- PR: #22
- Branch: `codex/fnd-008-mobile-ci`
- State: draft, mergeable
- Real GitHub Actions `Mobile CI / mobile-quality`: PASS
- Local clean install, format, lint, TypeScript and Jest validation: PASS
- Important repair included: the FND-004 lock/dependency baseline was not reproducible with `npm ci`; dependency versions/lockfile were repaired and Jest types added to TypeScript configuration
- Workflow was corrected to run the required mobile check for every PR targeting `main`, avoiding future branch-protection deadlocks caused by path-filtered required checks
- Remaining gate: independent `qa_engineer` verification, then Ready/merge

### FND-009 — Database migration CI

- Issue: #18
- PR: #21
- Branch: `codex/fnd-009-database-ci`
- State: draft, mergeable
- Real GitHub Actions migration workflow previously observed green
- Validates PostgreSQL service, constrained install, real migration integration test and Alembic current/head
- Remaining gate: independent QA
- Follow-up before FND-012: review/remove path filtering if this check is to become required on all PRs

## Next M0 work after current parallel wave

### FND-010 — Mobile -> API health path

Depends on the API/mobile foundations and usable local environment. Implement a real end-to-end development path where the mobile client can reach a FastAPI health endpoint with environment-safe configuration.

### FND-011 — Test architecture

Consolidate how unit/integration/domain tests are organized across API, mobile and database layers and ensure foundation tests reflect intended boundaries.

### FND-012 — Protect `main`

Depends on real backend/mobile/database CI checks and their exact GitHub check names.

Before enabling protection, ensure every check selected as required is guaranteed to report on every protected PR. Do not configure a path-filtered workflow as a globally required status check unless an always-reporting gating design is used.

Known corrective work: merged Backend CI currently uses path filters and needs adjustment before it is made globally required. Database CI should be corrected before merge or in a focused follow-up. Mobile CI has already been corrected on PR #22.

## Current CI names

Observed/intended deterministic contexts:

- Backend: `Backend CI / Backend CI`
- Mobile: `Mobile CI / mobile-quality`
- Database: `Database Migration CI / Database migration validation`

Verify exact GitHub check contexts again immediately before FND-012 rather than trusting this document.

## Roadmap after M0

The current roadmap is:

- M1 Identity
- M2 Exercise Catalog
- M3 Workout Engine
- M4 History / Analytics
- M5 Groups / Rankings
- M6 Robust Offline Sync
- M7 Social
- M8 Beta / advanced product

Do not reorder later features in a way that makes social/rankings depend on untrustworthy workout data.

## Engineering operating model

- Product Owner: user
- Main ChatGPT/Codex thread: orchestrator and final synthesis
- `project_manager`: backlog/dependencies/planning
- `tech_lead`: architecture, ADRs, contracts, high-risk review
- `backend_engineer`: `services/api/`
- `mobile_engineer`: `apps/mobile/`
- `data_engineer`: database/migrations/analytics/rankings; structural migration owner
- `qa_engineer`: independent verification
- `devops_engineer`: Docker/infra/GitHub Actions
- `security_engineer`: auth/privacy/security review

One focused issue should normally map to one branch and PR. Use isolated worktrees for parallel write-heavy tasks. Implementation agents do not self-approve; QA and architectural/security gates remain independent.

## Definition of Done reminder

A task is not done only because code exists or local commands pass. It should satisfy acceptance criteria, relevant tests, format/lint/type checks, documentation, focused diff, required architecture/security review, independent QA and real CI where applicable.

## Active documentation continuity task

DOC-001 / issue #23 introduces `docs/project-context/` so future sessions can recover the product and technical intent without relying on chat memory. Once merged, future agents should read this directory before planning or changing architecture.