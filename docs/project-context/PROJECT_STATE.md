# KeylorFit project state

Last updated: 2026-08-30

This is the fast handoff for resuming work. It is intentionally operational and may become stale if not updated after merges; GitHub issues, PRs and `main` are the final authority for real-time status.

## Current milestone

**M1 — Identity (planned; implementation not started)**

M0 Foundation is complete. M1 is the first user-facing product slice and is tracked by parent issue #36 and execution plan `docs/exec-plans/M1-identity.md`.

M1 exit requires a real physical-device identity journey: signed-out launch, registration/login, authenticated app shell, FastAPI-backed profile, persisted profile editing, session restoration and refresh, logout/login, password recovery, account deletion, and independent QA/security acceptance.

The milestone must explicitly exercise access-token expiry with a valid refresh session, safe behavior when refresh fails, and post-deletion rejection of credentials issued before deletion so deleted identity state cannot be silently reprovisioned.

Planned work:

- #37 IDN-001 identity contract and Supabase development configuration
- #38 IDN-002 backend JWT validation and application-user/profile foundation
- #39 IDN-003 mobile auth UX, session persistence/refresh and protected navigation
- #40 IDN-004 authenticated profile API and mobile profile editing
- #41 IDN-005 password recovery and auth deep-link handling
- #42 IDN-006 account deletion and identity privacy flow
- #43 IDN-007 M1 end-to-end, security and physical-device acceptance

Dependency shape:

`#37 -> (#38 || #39) -> #40`; `#39 -> #41`; `#38 + #39 + #40 -> #42`; all implementation work -> #43.

Do not start M2 until #43 passes and M1 completion evidence is recorded here.

## Completed M0 foundation

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

## Effective branch protection and CI

`main` is protected by classic GitHub branch protection; no repository ruleset also affects it.

Authoritative pull-request workflow/job checks:

- `Backend CI / Backend CI`
- `Mobile CI / mobile-quality`
- `Database Migration CI / Database migration validation`

The policy requires a pull request, requires all three checks with strict up-to-date branches, and requires all review conversations to be resolved. It has zero required approvals, no CODEOWNERS or signed-commit requirement, and no bypass actors. Administrators are included in enforcement; normal direct/force pushes and deletion of `main` are blocked, while a repository administrator can still recover by editing repository settings.

Disposable validation PR #34 proved the three checks appear while pending, block merging until green, and conversation resolution also blocks merging. After all checks passed and the temporary review thread was resolved, GitHub reported the PR merge-clean without an approving review requirement.

M0 physical-device/API and branch-protection evidence is complete.

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
