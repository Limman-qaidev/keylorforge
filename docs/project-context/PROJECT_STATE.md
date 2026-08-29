# Keylornet project state

Last updated: 2026-08-29

This is the fast handoff for resuming work. It is intentionally operational and may become stale if not updated after merges; GitHub issues, PRs and `main` are the final authority for real-time status.

## Current milestone

**M1 — Identity (planned; implementation not started)**

M0 Foundation is complete. M1 is now explicitly prioritized for planning and will deliver the first visibly product-like Keylornet slice: real signed-out/authenticated navigation, Supabase-backed registration/login/session handling, FastAPI-authenticated profile operations, recovery, logout and account deletion.

M1 parent issue: #36. Durable execution plan: `docs/exec-plans/M1-identity.md`.

### M1 work items

- #37 IDN-001 — identity contract and Supabase development configuration
- #38 IDN-002 — backend JWT validation and application-user/profile foundation
- #39 IDN-003 — mobile auth UX, session persistence and protected navigation
- #40 IDN-004 — authenticated profile API and mobile profile editing
- #41 IDN-005 — password recovery and auth deep-link handling
- #42 IDN-006 — account deletion and identity privacy flow
- #43 IDN-007 — end-to-end, security and physical-device acceptance

Dependency shape:

`#37 -> (#38 || #39) -> #40`, with #41 following the mobile auth lifecycle, #42 following the authenticated profile foundation, and #43 as the final integrated gate.

The first visible product checkpoint is IDN-003: the physical phone should show a real Keylornet welcome/login/register experience and authenticated shell rather than the M0 diagnostics screen. M1 is not complete until the physical-device demo gate in `M1-identity.md` passes.

## M0 — Foundation (complete)

M0 established the reproducible professional baseline required before product features:

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

### Merged foundation work

- FND-003 FastAPI skeleton — merged
- FND-004 Expo/React Native mobile skeleton — merged
- FND-005 PostgreSQL/Alembic baseline — merged
- FND-006 Local Docker/PostgreSQL environment — merged via PR #20; real clean Compose/PostgreSQL/Alembic/pytest validation completed
- FND-007 Backend CI — merged
- FND-007A Backend CI branch-protection safety — merged via PR #30; backend path filters removed and real Backend/Mobile/Database CI all passed on the final PR head
- FND-008 Mobile CI — merged via PR #22; real `Mobile CI / mobile-quality` GitHub Actions run passed
- FND-009 Database migration CI — merged via PR #21; real `Database Migration CI / Database migration validation` GitHub Actions run passed and the integration migration test is guarded against skipping
- FND-010 Mobile-to-API health integration — merged via PR #32; physical Android/Expo Go smoke passed with backend ON -> `API is healthy.`, backend OFF -> five-second `API health check failed: Health request timed out.`, then backend ON -> `API is healthy.` again
- FND-011 Foundation test architecture — merged via PR #31; the accepted smoke path and test taxonomy are recorded in `docs/architecture/foundation-test-architecture.md`
- FND-012 Protect `main` — effective branch protection validated through disposable PR #34; pull requests, strict CI checks, and resolved conversations are required without a mandatory approving review
- DOC-001 durable project context — merged; future sessions must read `docs/project-context/`

## FND-012 effective protection and validation

`main` is protected by classic GitHub branch protection; no repository ruleset also affects it. The GitHub Actions check-run identities configured by the REST API map to the following authoritative workflow/job names shown in pull requests:

- `Backend CI / Backend CI` — check-run `Backend CI`
- `Mobile CI / mobile-quality` — check-run `mobile-quality`
- `Database Migration CI / Database migration validation` — check-run `Database migration validation`

The effective policy requires a pull request, requires all three checks with strict up-to-date branches, and requires all review conversations to be resolved. It has zero required approvals, does not require CODEOWNERS or signed commits, and has no bypass actors. Administrators are included in enforcement, so normal direct and force pushes are blocked; a repository administrator can still recover by editing the repository's protection settings. Deletion of `main` is disabled.

Disposable validation PR #34 was created from protected `main` at `cda8611fb46cbd8bcd493d57a1cff12ee79d6aa0`. While its three checks were pending, GitHub reported the PR as blocked. The real workflow runs all passed:

- Backend CI: run `33269877012`
- Mobile CI: run `33269877008`
- Database Migration CI: run `33269877007`

Each relevant job step completed successfully, including the database migration execution and Alembic-head verification. After a temporary review thread was resolved, GitHub reported the PR as merge-clean without requesting an approving review. The disposable branch and PR were closed after recording the evidence.

## Roadmap after M1

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
