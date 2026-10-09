# KeylorForge project state

Last updated: 2026-10-09

This is the fast handoff for resuming work. GitHub issues, PRs and `main` remain the final authority for real-time status.

## Current milestone

**M3 — Workout Engine (implementation: first vertical slice underway)**

M2 — Exercise Catalog is complete.

M3 product discovery and the first design-contract pass are accepted. The current authoritative M3 design package merged on `main` comprises:

- `M3_WORKOUT_ENGINE_PRODUCT_CONTRACT.md`;
- `M3_TRAINING_GOAL_POLICIES.md`;
- `M3_EXERCISE_AND_EQUIPMENT_CONTRACT.md`;
- `M3_WORKOUT_DOMAIN_CONTRACT.md`;
- `M3_DECISION_ENGINE_CONTRACT.md`;
- `M3_WORKOUT_SYNC_CONTRACT.md`;
- `M3_PERSISTENCE_AND_DATA_MODEL_CONTRACT.md` (#110);
- `M3_LOCAL_DATA_AND_IDENTITY_CONTINUITY_CONTRACT.md` (#112);
- `M3_USER_JOURNEY.md` (including scenarios 21–30, #114);
- `M3_TRAINING_PROFILE_AND_SESSION_CONTEXT_CONTRACT.md` (#121 / merged PR #122);
- `M3_SERVER_DELETION_AND_RETENTION_CONTRACT.md` (#123 / merged PR #124), a **design contract**, not a completed server-side deletion implementation.

- `M3_EXERCISE_OCCURRENCE_AND_ADAPTATION_PROVENANCE_CONTRACT.md` (#125 / merged PR #126), accepted as a design contract; **not yet implemented**.

The first cross-contract audit is issue #105 / merged PR #106. The first remediation merged in order: #108, #110, #112, #114. The **second audit** is issue #117 / merged PR #118, report `M3_POST_REMEDIATION_AUDIT.md`. It found no P0 redesign, but remaining P1 gates before freezing a production-grade workout schema/API.

Current focused remediation after audit #117:

1. **R2-01 / issue #119 / PR #120 — MERGED** (commit `5681b596`) — accepted authorities reconciled; second-audit N-P1-01 addressed at contract level.
2. **R2-02 / issue #121 / PR #122 — MERGED** (commit `6b1989d4`) — optional Training Profile, cold-start Free Workout and per-session context accepted at contract level; CI 4/4 after P1 reviewer fix.
3. **R2-03 / issue #123 / PR #124 — MERGED** (commit `1dd51d87`) — server deletion/retention and G3 recovery **contract accepted**, Codex 2 P1 + 1 P2 closed; runtime purge/ledger/security review still not implemented.
4. **R2-04 / issue #125 / PR #126 — MERGED** (commit `7b2986f9`) — accepted first-performed-set occurrence boundary, applied agenda changes and immutable final snapshot; SQL/API/mobile behavior still **not implemented**.
5. **#89 / PR #128 — MERGED** (commit `ef65d5ac`) — canonical exercise alias curation retains 899 source identities and serves 897 canonical exercises; physical Android acceptance (5 checks) confirmed by Product Owner on 2026-10-08.
6. **G4 / audit #117 / PR #127 — MERGED** (commit `2b4c4121`) — local logout barrier, stale restoration fencing and regression tests integrated. Confirmed CI; does not by itself prove new M3 offline features on device.

### M3 implementation execution queue (open focused issues for real implementation slices as needed)

The following is execution order and dependency tracking, **not another round of contracts**. **#129 / PR #130 MERGED** (commit `8da41d75`) — backend Free Workout start/active lookup, account-owned persistence and idempotency with security-review corrections. **#131 / PR #132 MERGED** (commit `9ef5e64b`) — subject-scoped local SQLite start/outbox, native Expo SQLite binding and isolated QA screen; Samsung physical validation confirmed persistence across relaunch and local reads in airplane mode. **#133 / PR #134 MERGED** (commit `8e0ea1a7`) — SQLite v1→v2 performed occurrence/set/outbox local history, Samsung physical persistence/offline/QA teardown PASS and four checks green. **#135 / PR #136 MERGED** (commit `a28ea9e3`) — authoritative PostgreSQL/FastAPI occurrence and first/additional performed-set confirmation, committed receipt idempotency, owner isolation and NULL-safe database constraints. **#137 / PR #138 MERGED** (commit `06f840fb`) — owner-scoped Machine Profiles/Configurations, PostgreSQL/FastAPI create receipts and causal performed-set machine checks; Codex review unavailable due quota, CI 4/4 passed. **#139 / PR #140 IN IMPLEMENTATION** — mobile START_SESSION HTTP transport and atomic SQLite ACK, without automatically dispatching performed sets or running background sync. Full Free Workout UI, machine/agenda dependency sync, catalogue offline cache, Finish and sync worker remain pending. Each implementation PR must include code and tests, remain scoped, and require **physical Android validation of its user-visible flow and explicit Product Owner approval before merge**. CI/Codex alone are insufficient.

| Order | Deliverable | Concrete Done/verification | Dependencies / tracking |
| --- | --- | --- | --- |
| 1 | **G4 local logout barrier** | Local protected navigation closes immediately; provider error/restart/stale auth event cannot expose the old account; Jest/CI green | Audit #117 (G4); current implementation branch |
| 2 | **Canonical exercise identity cleanup** | Keep 899 source identities; collapse 2 true semantic aliases into 897 visible canonical results; disambiguate the 2 distinct ES jumping movements; test API/import/migration and run physical Android catalogue acceptance **on PR branch before merge** | Existing #89; required before history schema freeze |
| 3 | **M3 database/API foundation** | Owner-scoped Session → performed Occurrence → Set, native measures, snapshot/correction invariants, idempotent mutation and FK migrations with PostgreSQL integration tests | Accepted #110/#122/#124/#126; server deletion executor/retention implementation tracked in existing #123 |
| 4 | **Mobile offline foundation** | Subject-partitioned SQLite, correctly seeded M2 read catalogue, local domain+outbox transaction, persistent one-active-session and safe restore | #112, #117; depends on G4 and canonical catalogue IDs |
| 5 | **First Free Workout end-to-end** | On device: add/select exercise → confirm working set → explicit Finish → durable history → sync/retry; works after lost network and relaunch without forced goals | Data/API and offline slices; warmup-only cannot Finish |
| 6 | **Hardening and user acceptance** | Multi-device conflict/retry, logout/account isolation, account deletion integration, source-vs-actual history and device QA; publish clear readiness verdict | Server deletion #123 + relevant slice tests |
| Later | Plans, machine-aware recommendations, supersets/adaptation engine, G1/G2 and Exercise Intelligence | Incremental feature PRs only after core logging is trustworthy | #115 content; #116 privacy gate applies only to sensitive context |

**Implementation gates remain real:** no final workout-history schema/API freeze without #89, required server deletion/retention design implementation, and applicable security/identity checks. The contract PRs alone do not make M3 functional.

**Issue hygiene:** #105 and #117 are audit/umbrella trackers, not separate code deliverables per finding; #123 tracks real server deletion work despite its contract PR merge; #89 tracks the catalogue fix. Close issues only when their intended acceptance scope is actually met; avoid opening new issues for every PR or already-tracked finding.

Parallel optional work: #115 Exercise Intelligence and #116 sensitive-context privacy. Neither should delay manual Free Workout logging.


## Completed M2 work


- #82 CAT-001 canonical exercise model and deterministic Kinetic importer — merged via PR #86
- #83 CAT-002 read-only authenticated exercise catalogue API — merged via PR #87
- #84 CAT-003 mobile catalogue browse/search/filter/detail — merged via PR #88
- #85 CAT-004 end-to-end, independent QA and physical-device acceptance — PASS

### M2 canonical catalogue evidence

KeylorForge owns the runtime catalogue. The bootstrap source is the vendored Kinetic Exercises DB snapshot:

- source: `kinetic-place/exercises-db`
- pinned commit: `1783421f145e546fa168c591a0e4d11cae6f23df`
- license: upstream MIT notice retained in `database/src/keylorforge_database/catalog_data/KINETIC_LICENSE`
- importer is offline/deterministic and does not call Kinetic at runtime
- 899 exercises
- 17 muscle groups
- 36 equipment taxonomy entries
- 2,629 exercise-muscle relations
- 899 exercise-equipment relations
- supported measurement types: `reps`, `time`, `distance`
- muscle roles: `primary`, `secondary`, `tertiary`

The importer/idempotency integration coverage verifies that re-running the pinned snapshot does not silently duplicate catalogue rows.

### M2 API/mobile outcome

Authenticated users can use the canonical catalogue through KeylorForge's own FastAPI/PostgreSQL path:

- browse active system exercises in the existing `Entrenar` destination
- search by Spanish exercise name
- filter by primary muscle
- filter by equipment
- combine search and filters
- page deterministically with explicit load-more behavior
- open exercise detail
- inspect localized name, measurement, difficulty/category, force/mechanics, muscle roles and equipment
- encounter intentional loading, empty, partial-error, pagination-error and retry states
- use the catalogue without images/media or untranslated English instruction bodies

The mobile app and API have no runtime Kinetic dependency.

### M2 physical-device acceptance evidence

On 2026-10-05 the Product Owner completed the required smoke on a physical Android device using the installed KeylorForge development build, local FastAPI, local PostgreSQL through Docker Compose, and Supabase Auth.

Verified on device:

- authenticated launch and entry to `Entrenar`
- catalogue loads through the local KeylorForge FastAPI/PostgreSQL path
- 899 exercises are reported
- browse and load-more pagination work
- Spanish-name search works
- primary-muscle filtering works
- equipment filtering works
- combined filters/search work
- changed filters do not leave stale previous results visible
- multiple distinct exercise detail views open and return correctly
- text-only M2 presentation is coherent with no broken image placeholders or English instruction bodies
- empty state and clear-filter recovery work
- deliberate network failure shows a retryable error without losing the authenticated session
- restoring connectivity and retrying recovers the catalogue
- fully dismissing and reopening the Android app restores the authenticated session
- re-entering `Entrenar` after restart reloads a coherent 899-exercise catalogue

Product Owner reports physical-device **PASS**. Evidence is recorded on #85.

### M2 independent QA acceptance

Independent CAT-004 QA reports **PASS for M2/M3 entry**.

Validated against the vendored EN/ES snapshot on `main`:

- EN/ES exercise counts both equal 899 and use identical exercise ID sets
- EN/ES muscle counts both equal 17 and use identical muscle ID sets
- EN/ES equipment taxonomy counts both equal 36 and use identical equipment ID sets
- no duplicate IDs exist in exercises, muscles or equipment
- every Spanish exercise has at least one primary muscle
- every Spanish exercise has at least one equipment relationship
- every exercise uses a supported measurement type
- no exercise-muscle or exercise-equipment relationship points outside its canonical taxonomy
- embedded Spanish muscle/equipment names match canonical Spanish taxonomy names
- EN/ES records preserve the same measurement/difficulty/force/mechanics/category and relationship IDs
- all 17 primary-muscle categories are represented

Three Spanish display-name collisions from the pinned upstream snapshot were identified. They are not importer-created duplicate rows and do not block M3 because each exercise preserves a distinct stable internal/source identity. Follow-up curation is tracked in #89 before analytics/rankings rely on cross-session exercise comparability.

### M2 CI evidence

All four repository workflows passed on the final implementation head of each M2 implementation PR:

- CAT-001 / PR #86 head `6b2fba0d620d0c8c0f512c9bc42c15f2799a6ec3` — Backend CI, Mobile CI, Database Migration CI, residual check: success
- CAT-002 / PR #87 head `3251e6e4b4f50d87137c9698df057f63bee53571` — Backend CI, Mobile CI, Database Migration CI, residual check: success
- CAT-003 / PR #88 head `9041254a7589026f4743cddb9d77366f4e4688fa` — Backend CI, Mobile CI, Database Migration CI, residual check: success

### M2 exit decision

M2 satisfies its Definition of Done. Once this documentation exit is merged, #85 and parent milestone #81 can close and work may proceed to **M3 — Workout Engine**.

Deferred/non-blocking catalogue work includes:

- #89 — curate upstream exercise aliases and Spanish display-name collisions before derived analytics/rankings depend on comparability
- exercise images/media and AI generation
- translated execution instructions
- user-created/custom exercises

## Completed M1 identity

**M1 — Identity (complete)**

M0 Foundation and M1 Identity are complete. M1 passed its final end-to-end, security, QA and physical-device exit gate on 2026-09-05. Issue #43 records the exit evidence and parent milestone #36 is closed as completed in the same exit sequence.

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

## Roadmap

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
