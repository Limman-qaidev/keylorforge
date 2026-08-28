# Keylornet project state

Last updated: 2026-08-29

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
- FND-006 Local Docker/PostgreSQL environment — merged via PR #20; real clean Compose/PostgreSQL/Alembic/pytest validation completed
- FND-007 Backend CI — merged
- FND-008 Mobile CI — merged via PR #22; real `Mobile CI / mobile-quality` GitHub Actions run passed
- FND-009 Database migration CI — merged via PR #21; real `Database Migration CI / Database migration validation` GitHub Actions run passed and the integration migration test is guarded against skipping
- DOC-001 durable project context — merged; future sessions must read `docs/project-context/`

Current `main` after this wave is based on merge commit `ca6e069c9b38889acd81fd46623c2ba1716cef53` or later.

## Active M0 work

### FND-007A — Backend CI branch-protection safety

- Issue: #25
- Goal: remove backend CI path filters so the required check exists on every PR targeting `main`
- Preserve authoritative check: `Backend CI / Backend CI`
- Requires real GitHub Actions validation and independent QA before merge

### FND-010 — Mobile -> API health integration

- Issue: #26
- Owners: `mobile_engineer` + `backend_engineer`
- Acceptance path: `Mobile -> GET /health -> FastAPI -> 200 -> visible development status`
- Must use the existing mobile API abstraction/environment configuration
- Must support/document emulator/simulator plus reachable LAN host behavior for physical devices
- Must handle error state without crashing and include focused tests
- Independent QA verifies the M0 health path

### FND-011 — Foundation test architecture

- Issue: #27
- Primary owner: `qa_engineer`
- Define repository-wide test taxonomy, locations/ownership, PostgreSQL integration rules, isolation conventions and the M0 smoke path
- May proceed in parallel with FND-010 only when write-heavy changes do not overlap
- Reconcile final smoke-path documentation with FND-010 before acceptance

### FND-012 — Protect `main`

Not started yet.

Dependencies: backend/mobile/database required checks must be stable and guaranteed to report on every protected PR.

Before enabling protection, verify the exact GitHub check contexts again from real runs. Do not rely only on documentation.

## Current CI names

Observed deterministic contexts:

- Backend: `Backend CI / Backend CI`
- Mobile: `Mobile CI / mobile-quality`
- Database: `Database Migration CI / Database migration validation`

Mobile and Database CI now run for every PR targeting `main`. Backend CI still requires FND-007A before it is safe to configure as a globally required check.

## Immediate execution order

1. Implement and validate FND-007A.
2. Implement FND-010 and FND-011 in isolated worktrees; they may proceed in parallel subject to non-overlapping writes.
3. Merge accepted work only after independent QA and real CI where applicable.
4. Create/execute FND-012 using the exact observed required check names.
5. Run the complete M0 smoke path and close the milestone only when every gate is satisfied.

## Roadmap after M0

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
