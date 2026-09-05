# KeylorForge project state

Last updated: 2026-09-05

This is the fast handoff for resuming work. GitHub issues, PRs and `main` remain the final authority for real-time status.

## Current milestone

**M1 — Identity (complete)**

M0 Foundation and M1 Identity are complete. M1 passed its final end-to-end, security, QA and physical-device exit gate on 2026-09-05. Issue #43 records the exit evidence and parent milestone #36 is closed as completed in the same exit sequence.

The next planned milestone is **M2 — Exercise Catalog**.

Completed M1 implementation/product-shell/acceptance work:

- #37 IDN-001 identity contract and Supabase development configuration
- #38 IDN-002 backend JWT validation and application-user/profile foundation
- #39 IDN-003 mobile auth UX, session persistence/refresh and protected navigation
- #40 IDN-004 authenticated profile API and mobile profile editing
- #41 IDN-005 password recovery and auth deep-link handling
- #42 IDN-006 account deletion and identity privacy flow
- #43 IDN-007 end-to-end, security and physical-device acceptance
- #49 confirmation redirect physical-device fix
- #51 M1 visual/product-shell foundation
- #59 reliable development SMTP for Supabase Auth
- #66 Google/Apple social-auth implementation
- #67 authenticated five-destination product shell

Google/Apple external provider configuration and UI activation were explicitly deferred by the Product Owner on 2026-09-05. The implementation remains in the codebase, social controls are intentionally hidden, and #79 tracks future activation. This did not block M1.

Production auth-callback hardening remains tracked separately in #58 (PKCE / verified app links) and is required before production/beta with real user data. It did not block the M1 development milestone.

### M1 physical-device acceptance evidence

On 2026-09-05 the Product Owner completed the required smoke on a physical Android device using the installed KeylorForge development build, local FastAPI, local PostgreSQL through Docker Compose, and Supabase Auth.

Verified on device:

- signed-out Welcome/Auth experience renders correctly
- deferred Google/Apple controls are not rendered
- email/password registration and confirmation succeed
- authenticated five-destination shell is reachable
- protected FastAPI identity/profile path succeeds
- profile data loads, edits save, and edits persist
- app restart restores the authenticated session
- sign-out returns to auth and protected routes are inaccessible
- sign-in succeeds again
- password recovery succeeds and the new password can be used
- disposable second-account deletion succeeds end-to-end
- deleted identity can no longer be used normally

Product Owner reports visual/device PASS. Evidence is recorded on #43.

### Final QA and security acceptance

Final independent M1 exit review reports **PASS with no M1-blocking findings**.

The accepted evidence includes:

- missing, malformed and invalid bearer credentials fail closed
- protected identity/profile/delete operations derive ownership from the validated authenticated principal rather than client-supplied identifiers
- terminal/deleted identities remain protected from normal profile access
- account deletion durably commits the terminal/tombstone state before external provider deletion
- provider deletion failure does not reactivate the application identity
- provider diagnostics are reduced to safe application errors
- the Supabase administrative credential is server-only and represented with a secret-aware type; it is not mobile configuration
- the previously identified JWKS refresh/provider-outage security findings were fixed under #54 and independently accepted
- dormant Google/Apple social authentication remains inaccessible through the M1 UI; its production callback hardening remains explicitly owned by #58
- no new blocking security finding was identified during the final M1 synthesis

### CI evidence

The documentation exit PR #80 final reviewed head passed all repository workflows before merge:

- Backend CI — success
- Mobile CI — success
- Database Migration CI — success
- KeylorForge residual check — success

The preceding `main` commit after PR #78 (`b0a4929d3c41d9b54d46ffd14074db8ab03d27bb`) also passed the three authoritative Backend, Mobile and Database Migration workflows.

### M1 exit decision

M1 satisfies its Definition of Done and is closed. Work may proceed to M2 Exercise Catalog.

Deferred work remains explicitly outside the M1 exit:

- #79 — configure/activate Google and Apple social authentication
- #58 — migrate production auth callbacks to PKCE / verified app links before production/beta with real user data

## Completed M0 foundation

- FND-003 FastAPI skeleton — merged
- FND-004 Expo/React Native mobile skeleton — merged
- FND-005 PostgreSQL/Alembic baseline — merged
- FND-006 Local Docker/PostgreSQL environment — merged via PR #20; real clean Compose/PostgreSQL/Alembic/pytest validation completed
- FND-007 Backend CI — merged
- FND-007A Backend CI branch-protection safety — merged via PR #30; backend path filters removed and real Backend/Mobile/Database CI all passed on the final PR head
- FND-008 Mobile CI — merged via PR #22; real `Mobile CI / mobile-quality` GitHub Actions run passed
- FND-009 Database migration CI — merged via PR #21; real `Database Migration CI / Database migration validation` GitHub Actions run passed and the integration migration test is guarded against skipping
- FND-010 Mobile-to-API health integration — merged via PR #32; physical Android smoke passed
- FND-011 Foundation test architecture — merged via PR #31; the accepted smoke path and test taxonomy are recorded in `docs/architecture/foundation-test-architecture.md`
- FND-012 Protect `main` — effective branch protection validated through disposable PR #34
- DOC-001 durable project context — merged; future sessions must read `docs/project-context/`

## Effective branch protection and CI

`main` is protected by classic GitHub branch protection.

Authoritative pull-request workflow/job checks:

- `Backend CI / Backend CI`
- `Mobile CI / mobile-quality`
- `Database Migration CI / Database migration validation`

The policy requires a pull request, requires all three checks with strict up-to-date branches, and requires all review conversations to be resolved. It has zero required approvals. Administrators are included in enforcement.

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
