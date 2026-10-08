# M3 Server Deletion and Retention Contract

**Status:** Proposed for Product Owner and Security approval — NOT ACCEPTED  
**Milestone:** M3 — Workout Engine  
**Issue:** #123 — R2-03 / second audit #117, N-P1-03 and G3  
**Date:** 2026-10-08  
**Parent authorities:** M1 Identity Contract / IDN-006/007, ADR-002, `M3_PERSISTENCE_AND_DATA_MODEL_CONTRACT.md` (#110), `M3_LOCAL_DATA_AND_IDENTITY_CONTINUITY_CONTRACT.md` (#112), `M3_TRAINING_PROFILE_AND_SESSION_CONTEXT_CONTRACT.md` (#122), `M3_WORKOUT_SYNC_CONTRACT.md`; sensitive persistence gate #116.

## 1. Purpose and boundary

M1 already prevents a deleted identity from silently re-provisioning: it retains an application-user/identity tombstone and commits `DELETION_IN_PROGRESS` before attempting Supabase Auth deletion. **This currently does not delete future M3 user-owned database entities**. R2-03 adds an explicit server deletion/retention contract before any M3 schema/API freeze.

On **confirmed account deletion**, the default is **hard deletion of account-owned M3 personal data and derivative personal records**. Reusable system-wide catalog/taxonomy/curated resources are not user property and must remain. Only a narrowly scoped **terminal anti-reprovision tombstone**, minimal deletion-operation reconciliation metadata, and genuinely anonymous aggregate data (if separately established to be non-identifying) may survive. A public or pseudonymous user identifier is **not** anonymous merely because a name/email is removed.

This is a **design decision proposal**, not a representation that deletion code, operational retries, data inventory or legal retention assessments already exist. Security/privacy/legal review must validate the final policy and concrete retention horizons before processing production user data. M3 does not acquire blanket authorization to store sensitive #116 data.

### Non-negotiable outcomes

- No active or previously issued valid token can re-enable reads/writes once deletion preparation is committed.
- All M3 user-owned relationships/caches/derived copies are accounted for, including rows unreachable from the normal UI.
- If account deletion succeeds, the server contains **zero surviving identifiable workout/profile/machine/history records** attributable to that account, except explicitly reviewed minimal terminal/reconciliation records.
- Retry, crash, provider outage, response loss and concurrent requests never resurrect personal data, accidentally delete another account, or falsely report completion.
- The local purge decision uses **confirmed terminal server deletion** under #112, not an expired/revoked session alone.

## 2. Existing M1 implementation and extension needed

Verified against the repository at the start of R2-03:

- `ApplicationUserRepository.start_deletion` (in `database/src/keylorforge_database/identity.py`) places an application user in `DELETION_IN_PROGRESS` and removes M1 display name where present. The external identity mapping is protected from re-provisioning.
- `services/api/app/identity/service.py` commits that state, calls `SupabaseAdminDeletionClient.delete_user`, then calls `finalize_deletion` and commits `DELETED`.
- The M1 relational model retains `application_users`, `application_user_identities`, `application_user_profiles` with `RESTRICT` foreign keys, so deleting the whole application-user row would break the accepted tombstone model. Do **not** introduce a blanket `ON DELETE CASCADE application_users` to remove the user.
- M1 tests cover committed tombstone before provider I/O, provider failure and a not-found provider delete. They do **not** yet prove deletion of M3 entities or a durable deletion receipt after a lost provider response.
- M3 local data already mandates `DELETION_PENDING`, account-partition freeze/quarantine and client purge only after confirmed terminal deletion.

The implementation must **extend** the existing endpoint/service lifecycle, not replace terminal identity semantics or try to delete the application identity row.

## 3. Ownership and deletion/retention matrix

All rows below are considered **personal/account-owned** when their ownership resolves to a user, even if they contain only UUID references, numbers or pseudonymous identifiers. Default action: **hard delete by owner**. No accidental cascade into other accounts or shared catalogue.

| Domain entity / data family | Required account-deletion treatment | Additional guard |
| --- | --- | --- |
| Training Intent revisions, body-goal/experience policy snapshots | Hard delete all user revisions and user-owned historical snapshots | No orphan policy rows; no reconstruction from decision traces |
| Training Profile, profile revisions, equipment/muscle/exercise preferences | Hard delete profile and preference relationships/revisions | Do not retain user ID in an alias/search index |
| Training Plans, user plan instances, plan revisions, stable logical Plan Steps, step revisions | Hard delete owned objects and dependent relationships | Global curated plan/source data is preserved separately |
| User-created Workout Templates, template revisions, template exercise items, execution-group memberships | Hard delete including version history and user-authored text | Shared system templates remain; future sharing requires its own deletion policy |
| Actual Workout Sessions, source/provenance, prescription and start snapshots | Hard delete sessions and their owned historical snapshots | No personal session residue in plan-history tables |
| Workout Exercise Occurrences, completed WorkoutSets, corrections, set prescription/load/machine snapshots | Hard delete all performed-work history and correction rows | No exercise history under a surviving pseudonymous subject |
| Active Session Agenda, agenda revisions, planned/omitted items, Set Drafts if server-owned | Hard delete all user-owned active/session intent | Local-only drafts are purged by #112 after confirmation |
| Future final agenda/adaptation events and accepted in-session adjustment provenance (R2-04) | Hard delete with their parent user/session | New R2-04 tables inherit this policy automatically |
| Gym Context, Machine Profile, Machine Configuration, units/load selections, calibration/user notes | Hard delete owned entities plus relationships, aliases, snapshots and version history | Never delete global equipment taxonomy |
| Session operational context, Training Profile-derived context snapshots | Hard delete session/user-owned revisions and copied inputs | No retained time/gym trail outside deleted session |
| Future generic readiness observations, symptoms, fatigue/recovery observations (G1) | Hard delete all user-linked inputs/observations and identifying cached outputs if collection is later approved | G1 is NOT authorized by this contract |
| Sensitive cycle/contraception/symptom-specific data (#116) | No such persistence allowed today; any later approved entity must be included in a reviewed updated deletion matrix | A broad JSON field is not an exemption |
| Personalized decision/recommendation traces, candidate/reason codes, overrides, model outputs (G2) | Hard delete traces, material inputs, labels and user-linked evaluations | G2 must inherit this rule before rollout |
| User-owned derived coverage, fatigue state, PRs, rankings, attendance, history/search/materialized views | Delete or invalidate all user-linkable derived copies; recompute shared aggregates only where truly anonymous | Do not treat cached/aggregate pseudonyms as anonymous |
| Server sync outbox/inbox, idempotency receipts/payloads, cursors, revisions, tombstones and dead letters | Delete user-owned business payloads and sync metadata once terminal conditions allow; retain only minimal **non-workout** deletion protocol record within reviewed horizon | Do not permit stale queued work to recreate rows |
| Object storage, export archives, attachments/media, user-submitted images, future audit/telemetry content | Delete account-linked objects/keys and references; address third-party queues/exports and user PII in logs | Must be added to resource inventory as features arrive |
| M1 application identity/profile | Follow M1 terminal lifecycle: null/remove profile personal fields, retain only required terminal user/subject mapping | Provider-subject UUID is pseudonymous personal data; minimized retention and protection required |
| Supabase Auth account | Delete server-side via privileged client after durable M3 purge; provider not-found can be idempotent success under existing M1 semantics | Never send privileged credentials to mobile |
| Global system exercise catalogue, taxonomy, vendored source metadata and global curated content | **Preserve**; they are not removed because one account is deleted | User-owned copies/links are still deleted |
| Clearly non-identifying analytics aggregates | May retain only after independent privacy review proves they cannot reasonably be linked back to the user, alone or with other data | Otherwise delete; do not rely on “no name” alone |

**Completeness rule:** each new structural M3 migration declares ownership, `ON DELETE` strategy, deletion executor/inventory inclusion, deletion test and any legitimate exception. No newly introduced user-owned table/queue/storage bucket may be considered production-ready without this contract's coverage. A future user-to-user sharing feature needs its own semantics before retaining another account's access to deleted-user content.

## 4. Database constraints, graph traversal and transactions

### 4.1 Owner-scoped deletion boundary

Derive `application_user_id` from the validated principal or from a persisted, authenticated server-side deletion operation. Never select the deletion target from a caller-supplied UUID alone.

For all M3 user-owned entities:
- owner must be explicitly recoverable from stable FKs or a clearly owned parent path;
- dependent rows must have a reviewed `RESTRICT` / carefully scoped `CASCADE` / explicit deletion approach;
- shared catalogue/curated records and other users' rows are never descendants of an account-deletion cascade;
- composite owner/parent constraints or equivalent checks guard cross-account references; no orphan snapshots, child set rows, idempotency payloads or soft-deleted PII remain.

Delete in dependency order where no safe cascade is available: auxiliary per-set/decision/adapter/correction records; workout sets and occurrences; session agenda/prescriptions/context; sessions; owned plan/template and revision graphs; Gym/Machine/Training Intent/Profile/context; per-user derived caches; sync payloads. The exact sequence must follow the **actual migration FK dependency graph**, not a hard-coded prose list if it differs.

A central, idempotent `purge_account_m3_data(application_user_id)` semantic operation is required. It MUST run with a database transactional boundary (or a durable, repeatable staged cleanup for external resources) and verify its ownership-scoped completeness before declaring `m3_purge_complete`. No partially failed relational purge can be reported as terminal success.

### 4.2 Stop concurrent writes first

Preparation transaction must:
1. lock/serialize the application user and commit `DELETION_IN_PROGRESS` plus a durable deletion operation/outbox job;
2. prevent any M3 authenticated read, create, correction, sync replay or dependent write under that terminalizing owner after the commit — **including a previously valid JWT or stale mutation**;
3. make all domain mutations recheck lifecycle under an appropriate transactional/locking protocol, so writes racing with preparation cannot commit after terminalization;
4. preserve a minimal terminal identity mapping that prevents automatic re-provision.

Exactly one owner deletion operation is logically active per subject. Concurrent requests use stable idempotency and cannot delete different users.

### 4.3 Proposed durable deletion state machine

Conceptual stages (implementation labels may differ):

`ACTIVE → DELETION_IN_PROGRESS → M3_PURGE_COMPLETE → PROVIDER_DELETED → DELETED`

- **Begin**: commit terminalizing account state plus a durable retriable job/operation before external I/O. Immediately deny normal protected M3 activity.
- **Purge**: delete all owned M3 records and personal derivatives in a transaction; retry safely if failed. Record completion only after verifiable successful commit.
- **Provider**: delete Supabase user using server-only privilege after M3 relational purge. A provider "not found" response counts as idempotent success where the accepted M1 provider adapter supports that condition. An outage retains the terminalizing tombstone and retriable operation; it never reopens user access.
- **Finalize**: commit `DELETED` and a status eligible for client reconciliation only when both M3 purge and provider deletion are confirmed. No terminal success before those conditions.
- **External copies**: address storage/exports/third parties as individually tracked deletion steps; terminal success must not falsely claim completion while a required live external deletion remains pending. Retained historical encrypted backups follow the separate bounded lifecycle in §7.

**R2-03 makes durable server-owned retry mandatory.** The existing M1 inline provider call alone is inadequate if the provider deletes the identity but the HTTP response is lost or the process crashes before finalization.

A failure **before** M3 purge finishes leaves the identity terminalizing, denies access and retries; do not delete the provider account first and strand unrecoverable user data. A failure **after** provider deletion but before final DB commit is reconciled from the durable job; repeat provider delete/not-found safely, then finalize.

## 5. Lost-response / deletion-pending client reconciliation (G3)

### 5.1 Proposed concrete protocol

Use a **deletion-status receipt capability**, separate from ordinary authenticated access. This is the proposed G3 mechanism to be security-reviewed before runtime implementation.

1. **Before** sending the authenticated Delete Account request, the mobile client generates a cryptographically random, high-entropy one-time deletion-reconciliation secret and a stable request idempotency key; it durably stores them with the local `DELETION_PENDING` marker **outside normal workout outbox**.
2. The server validates the normal authenticated deletion request, binds the receipt digest and request key to the single current account operation, and commits terminalization + the operation record before provider I/O. Only a cryptographic digest of the secret, not its plaintext, is stored. Request retries with same owner/key must resolve to the same deletion operation; reuse for a different owner is rejected.
3. A narrowly scoped `deletion-status` endpoint accepts the opaque capability over TLS **without restoring a normal Supabase auth session**. It returns only `PENDING`, `CONFIRMED_TERMINAL` or a deliberately non-disclosing unable-to-confirm response. Never include account email, subject UUID, workout data, provider internals, or cross-account diagnostics.
4. The endpoint has rate limits, constant/indistinguishable failure behavior where practical, high-entropy proof, scoped status only, and a **defined bounded expiry**. Deletion-operation records cannot become general bearer access tokens.
5. The device purges its own subject partition/outbox only on `CONFIRMED_TERMINAL`, then deletes the reconciliation secret and signs out. If the provider refresh fails while deletion is pending, the client **must not** infer ordinary sign-out or re-enable workouts.
6. If the original request never reached the server, or the capability expires before confirmation, the client preserves deletion-pending/quarantine and enters a **separately reviewed recovery path**; lack of a status record is not proof of either successful or failed deletion. No automatic destructive local purge on an ambiguous response.

A client-generated capability held before the request addresses the case where the server completes provider deletion but the response containing a server-generated receipt would itself be lost.

**Security review is a hard gate**: validate entropy, brute-force resistance, token binding, local secret storage, anti-enumeration, replay, expiration and what client recovery can safely do after expiry. This protocol is *proposed*, not an implemented API. Choose explicit limits before beta, not guessed here.

### 5.2 Device-side and other-device outcomes

M3 #112 already requires local `DELETION_PENDING` survival across restart and account switching. A second device that later discovers confirmed deletion must stop normal work, discard stale sync attempts and purge that subject's local partition when terminal proof is established. A simple auth-refresh failure is only revocation/unknown and cannot alone justify erasing unsynced local data.

## 6. Failure and recovery matrix

| Failure / race | Required server outcome |
| --- | --- |
| Client loses response to Delete request | Status receipt can recover terminal/pending without an active provider session; never duplicate deletion |
| Client deletes then crashes/restarts | Durable local marker and capability survive; remote operation continues independently |
| Provider unavailable / 5xx | User remains terminalizing; minimal tombstone and durable retry; no normal M3 access |
| Provider reports user already missing | Treat as idempotent provider deletion, provided server owns the original operation; confirm M3 purge first |
| Process crashes after provider success before `DELETED` commit | Durable operation is replayed; no user re-provision; complete final transition once conditions verified |
| DB purge raises FK error / rolls back | Remains pending; logs minimal error metadata; no false confirmation and no provider deletion before purge |
| Authenticated mutation races with deletion preparation | Per-owner lifecycle lock/check ensures no write can commit after terminalizing preparation |
| Offline outbox replay after terminalizing | Reject/quarantine, never recreate user/history; no remote `upsert` resurrection |
| Concurrent Delete requests (same owner) | One idempotent operation; later requests observe same state |
| Wrong owner attempts deletion-status/retry by guessing ID | Cannot affect another account or access sensitive status/data; status capability not an account selector |
| Account A deleted, B has different data / shared catalogue | Delete A-owned rows only; B and public catalogue unchanged |
| Old JWT still cryptographically valid | M1 terminal lifecycle prevents protected access and auto-provision |
| Receipt expired or absent | Unknown/recovery, not silent success; local `DELETION_PENDING` remains quarantined |
| Backup snapshot restored | Run terminal/deletion reconciliation before exposing restored data; never resurrect deleted accounts |
| Deletion of optional external storage fails | Remain pending on required resource step; retry and do not falsely say all personal data is gone |

## 7. Retention, observability, backups and exports

### 7.1 Terminal tombstone and operation receipts

The permanent-ish M1 tombstone is **not anonymous**: the Supabase subject UUID and retained identity mapping may still qualify as personal/pseudonymous information. Retain only what is demonstrably required to prevent re-provision and securely reconcile deletion; the **precise retention rule, legal basis, expiry/alternative anti-reprovision mechanism** must be reviewed before production. Do not use that row to store metrics, workouts, email, display name, gym, health data or device identifiers.

A deletion operation may retain only narrowly scoped non-workout metadata such as irreversible receipt digest, state/phase, sanitized timestamps and minimal failure category. Token/status lifetime, log retention and eventual purging must be bounded and approved before production; do not promise an arbitrary number of days here.

### 7.2 Logs / analytics / replicas

Logs, crashes, analytics events, error monitoring, queues, exports and read replicas must not indefinitely retain profile data or workout payloads. Suppress new business events as soon as deletion is terminalizing, purge/invalidate owned materialized/search/cache copies, and ensure no request logs, exception payloads, tracing tags or deletion-job diagnostics inadvertently replicate set measurements or subjective context.

For genuinely non-identifying aggregate metrics, retention is possible only with an explicit documented anonymization assessment. A tokenized user ID, sparse time-series of workouts or exact per-user series is not automatically anonymous.

### 7.3 Backups and recovery

Instant deletion from immutable disaster-recovery backups may not be technically feasible. Require **documented maximum backup retention and access controls** before production; backups expire on bounded schedules, are not repurposed for analytics, and restoring from backup must replay the authoritative terminal deletion ledger/status **before** exposing data or accepting sync so deleted personal rows cannot be resurrected. If such a guarantee cannot be demonstrated, the production deletion claim must be qualified and the design changed.

### 7.4 Data portability and timing

Any user-data export flow must not leak other accounts and must honor the active/deletion lifecycle. The app's confirmation UX must state only what the backend can actually guarantee and must not imply instant disappearance from every retained backup where that is not supported.

Regulatory retention duties/exceptions, deadlines and notice text are **privacy/legal review items**, not guessed in this document. Any approved exception must identify exactly which fields, purpose, duration and access restrictions apply and must never be used as a blanket exception for workouts, readiness or personal recommendations.

## 8. Required tests and release gates

### Database / migrations

1. Enumerate every M3 user-owned entity against the live SQLAlchemy/Alembic metadata and external resource inventory, including future R2-04 and G1/G2 additions; schema review fails if a user-owned table lacks an owner/deletion route.
2. Insert account A with realistic Plan/Step/Template/Profile/Intent/Gym/Machine/Session/Set/Snapshot/Decision/Sync dependents, and account B with parallel rows; delete A. Assert **zero A personal M3 rows** and no FK orphans, while B rows and system catalogue remain unchanged.
3. Inject DB constraint and transaction errors; purge rolls back/retains durable retry with no spurious `DELETED`.
4. Simulate deleted/absent child rows, duplicate deletion operations and provider 404; behavior is idempotent.
5. Validate cannot INSERT/UPDATE by a user whose lifecycle is terminalizing, including previously issued JWT and queued stale sync.

### Service / integration / security

6. Extend IDN-006/IDN-007 sequence tests to include M3 purge *before* provider delete and finalization after all mandatory steps.
7. Inject provider outage, crash between state transitions, lost HTTP response, timeout, repeated client request, worker restart and status polling without auth refresh.
8. Verify receipt high entropy/hashed storage, narrow scope, rate limiting, non-enumeration, expiry and failure behavior through independent security QA.
9. Verify cross-account A/B isolation, no accidental global catalogue cascade, no secrets in mobile.
10. Verify local deletion-pending markers/outbox only purge on verified terminal success, and do not resurrect on restart or sign-in for another subject.
11. Confirm logs, metrics, traces, exports, object storage and all cache layers do not preserve user payloads beyond a separately reviewed bounded requirement.
12. Restore a pre-deletion backup into a test environment and prove terminalization ledger/reconciliation prevents A's personal data from being served.

### Definition of Done before final schema/API freeze

- This contract is explicitly approved and merged; its relationship graph is reflected in actual Alembic migrations.
- R2-04 entity types inherit the matrix when introduced; G1/G2/#116 entities remain gated.
- Server deletion executor, durable retry, scoped receipt/status recovery, authorization and tests are implemented and independently reviewed.
- Product, engineering and privacy/security agree on finite retention, backup, log and external system policies.
- M3 no longer claims deletion complete on a mere provider deletion when server-owned personal data remains.

## 9. Decision requested

Approval of R2-03 accepts:

1. Hard-delete-by-default policy for **all account-owned M3 personal rows and derivatives**, while preserving shared system records and minimal reviewed M1 anti-reprovision tombstone.
2. A server **durable idempotent deletion operation** that blocks writes first, purges M3 user data, deletes provider identity and only then reports confirmed terminal deletion.
3. The proposed **pre-issued opaque deletion-status receipt** as the G3 architecture, subject to technical/security verification before production.
4. Owner-scoped cascades/FK-safe cleanup, zero cross-account loss, no stale-work resurrection and explicit backup/restore guarantees.
5. Mandatory privacy/security confirmation of tombstone, receipt, logs and backup retention policies before shipping with personal data.

This is **not approval of concrete SQL tables, API payloads, deletion status endpoints, background worker implementation or numerical retention periods**. Those require dedicated implementation review and testing.
