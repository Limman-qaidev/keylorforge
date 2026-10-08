# M3 Workout Sync Contract

**Status:** Accepted by Product Owner  
**Milestone:** M3 — Workout Engine  
**Issue:** #101  
**Parent authorities:** ADR-003, `M3_WORKOUT_ENGINE_PRODUCT_CONTRACT.md`, `M3_WORKOUT_DOMAIN_CONTRACT.md`, `TECHNICAL_BLUEPRINT.md`  
**Date:** 2026-10-08  
**Product Owner approval:** 2026-10-08

## 1. Purpose

This contract defines the synchronization semantics that make M3 genuinely offline-first.

The product requirement is:

> Recording a workout action succeeds locally first. Remote synchronization happens afterwards and must never duplicate, silently discard or ambiguously overwrite user training data.

The intended flow remains:

`user action -> SQLite domain state + outbox atomically -> immediate UI -> sync worker -> FastAPI -> PostgreSQL -> acknowledgement -> local reconciliation`

This document defines the behavior of that flow without fixing final REST paths, SQL table names or UI layout.

---

## 2. Authority model

### 2.1 Local authority before acknowledgement

Before a mutation has been successfully acknowledged by the server:

- the local SQLite state is the authoritative representation of the user's most recent action on that device;
- the UI must reflect that local state immediately;
- network failure must not roll the user action back merely because it is unsynced.

### 2.2 Server authority after acknowledgement

After successful synchronization:

- PostgreSQL is the persistent server-side authority;
- the client reconciles to the acknowledged server revision/state;
- derived analytics/rankings remain server-side authority.

### 2.3 No silent destructive reconciliation

If server authority conflicts with newer unsynced local intent, the client must not simply overwrite or discard that local intent.

Conflict must be resolved explicitly according to this contract.

---

## 3. Local transaction boundary

For every syncable workout mutation, the client must atomically persist in one SQLite transaction:

1. the resulting local domain state; and
2. the corresponding outbox mutation.

The contract requires:

> no domain change without an outbox record, and no outbox record without the matching local domain change.

This prevents crash windows such as:

- set visible locally but impossible to sync;
- sync mutation queued but local set missing.

If the local SQLite transaction fails, the user action has not succeeded.

---

## 4. Stable identities

### 4.1 Entity identity

Syncable entities must receive globally unique client-generated IDs before server contact.

At minimum this includes:

- Actual Workout Session;
- Workout Exercise Occurrence;
- Workout Set;
- any syncable local child entity needed by the active workout.

The server does not replace these with unrelated IDs.

The same ID identifies the same logical entity locally and remotely.

Exact UUID version is implementation detail.

### 4.2 Mutation identity

Every remote mutation receives its own globally unique `mutation_id`.

The mutation ID identifies one specific intent.

It must not be reused when the user changes the intent.

Example:

- “set reps from 8 to 10” = mutation A;
- user then changes 10 to 9 before A is sent/acked: either A is superseded locally before transmission under explicit compaction rules, or the new intent gets mutation B.

A sent or acknowledged mutation ID is never repurposed for different payload semantics.

### 4.3 Device/installation identity

The client may use a stable installation/device identifier for:

- diagnostics;
- conflict explanation;
- sync tracing.

It is not authentication and does not replace user/entity/mutation IDs.

---

## 5. Idempotency

Idempotency is mandatory.

The server must scope remote mutation idempotency at least by authenticated user + `mutation_id`.

### Same mutation, same intent

If the server already committed a mutation and receives the same mutation again:

- it returns the previously committed semantic result / acknowledgement;
- it does not create another session/set or repeat the mutation.

This protects the critical case:

1. server commits;
2. response is lost;
3. client retries;
4. no duplicate work is created.

### Same mutation ID, different intent

If the same mutation ID is presented with materially different mutation content:

- reject it as an idempotency violation;
- never guess which payload is correct.

This is a terminal client/protocol error, not a normal retry case.

---

## 6. Mutation model

M3 should prefer semantic mutations/commands over blind replacement of an entire session document.

Conceptual mutation families include:

- create/start session;
- create exercise occurrence;
- create/complete set;
- correct completed set;
- remove set;
- update actual machine/context where supported;
- finish session;
- cancel session;
- correction that causes completed session to become empty/cancelled;
- other explicit workout-domain mutations later approved.

A mutation contains only the data required for that intent plus concurrency/dependency metadata.

The server remains responsible for domain validation.

---

## 7. Causality and dependencies

Offline operations frequently depend on earlier local operations.

Example:

`create session -> create exercise occurrence -> create set -> complete session`

The sync layer must represent this causal relationship.

### 7.1 Dependency identity

A mutation may declare dependencies on:

- parent entity creation;
- prior mutation IDs;
- prior required server revision.

### 7.2 M3 ordering rule

For mutations belonging to the same workout session, the M3 client may process them sequentially in local causal order.

This intentionally favors correctness and simplicity over maximum parallel throughput.

Independent session/account work may progress independently.

### 7.3 Dependent failure

If mutation B depends on mutation A and A is unresolved:

- B must not be applied remotely first;
- B remains blocked/pending.

A conflict in one session should not unnecessarily block unrelated syncable data elsewhere.

---

## 8. Outbox states

Conceptual mutation states:

- `PENDING`
- `SENDING`
- `ACKED`
- `RETRYABLE_FAILED`
- `CONFLICT`
- `TERMINAL_FAILED`

Exact persisted enum names are provisional.

### Crash recovery for SENDING

`SENDING` is not proof of remote success.

After a process crash/restart, an unacknowledged `SENDING` mutation must be safely retryable using the same mutation ID.

Idempotency makes this safe.

---

## 9. Entity-level sync state

The UI/domain may derive coarse entity/session sync state such as:

- local/pending;
- syncing;
- synced;
- conflict/error.

The exact labels are UX detail.

### Product behavior

Normal logging should not show disruptive “saving…” interactions for every set.

Sync is usually quiet.

The UI should surface state when material:

- prolonged unsynced work;
- explicit conflict;
- terminal error;
- account/auth issue preventing synchronization.

---

## 10. Server acknowledgement

A mutation is `ACKED` locally only after the client receives and durably records an acknowledgement that corresponds to a committed server transaction.

A server acknowledgement should conceptually include:

- `mutation_id`;
- semantic result: applied / already-applied;
- affected entity IDs;
- authoritative current revision(s);
- any canonical server representation needed for reconciliation.

### Local acknowledgement transaction

Applying the acknowledgement locally should itself be atomic:

- update local server revision/state;
- mark outbox mutation acknowledged;
- apply authoritative reconciliation data.

### Lost acknowledgement

If the server committed but local acknowledgement persistence never happened, retrying the same mutation must return the idempotent committed result.

---

## 11. Retry policy

### Retryable/transient

Examples:

- no network;
- timeout;
- connection reset;
- service unavailable;
- most server 5xx;
- explicit throttling/retry response.

Retry with bounded backoff.

Exact delay/jitter values are implementation details.

### Authentication-blocked

Expired/invalid authentication may temporarily block sending.

The client should:

- preserve local outbox;
- re-establish authentication where possible;
- retry with the same mutation IDs.

Authentication failure never justifies deleting local workout data.

### Terminal/non-retryable

Examples:

- malformed protocol;
- unsupported mutation version;
- authorization denial that will not change by retry;
- idempotency key reused with different intent;
- impossible domain payload.

These require user/developer-visible resolution rather than endless retry.

### Conflict

Optimistic-concurrency conflicts are not ordinary transient retries.

They enter explicit conflict handling.

---

## 12. Optimistic concurrency

Idempotency prevents duplicate execution.

It does **not** solve two legitimate edits made from different states.

M3 therefore requires explicit server revision/concurrency semantics.

### 12.1 Server revision

Mutable synchronized domain state should expose an opaque server revision/version at the appropriate concurrency scope.

Exact storage type is implementation detail.

### 12.2 Base revision

Mutations that change already-synced mutable state should include the server revision they were based on when relevant.

If the authoritative state has moved incompatibly:

- do not silently last-write-wins;
- return a conflict with enough current authoritative information for resolution.

### 12.3 Commutative creates

A child create with a globally unique entity ID may be accepted even if unrelated siblings were created meanwhile, provided:

- its parent still permits the operation;
- lifecycle/domain invariants remain valid;
- there is no semantic collision.

The implementation should not cause unnecessary conflicts solely because an unrelated set was added.

### 12.4 Corrections/deletions

Editing/removing an existing completed set requires concurrency protection against stale edits.

### 12.5 Terminal session transitions

Finish/cancel operations require concurrency protection because they change session lifecycle and plan-derived consequences.

They must depend on all prior local workout mutations that logically precede the transition.

---

## 13. Tombstones and deletion

Deletion must not allow stale devices to resurrect old data.

### 13.1 Removing a set

An explicit removal of a synchronized set becomes a sync mutation and server-side deletion/tombstone semantic.

The server retains enough identity/revision/deletion information to reject a stale device attempting to update/recreate the same historical ID as if it still existed.

### 13.2 Deleted identity is not reused

If the user later records a new set, it receives a new set ID.

Do not “undelete” by accidentally reusing a stale ID unless a future explicit restore domain operation is designed.

### 13.3 Local tombstone

The client retains deletion intent until acknowledged.

Exact post-ack tombstone retention/compaction is provisional.

### 13.4 Cancellation is not row deletion

A cancelled workout is a domain lifecycle state, not simply a missing session.

This preserves enough semantics for sync/conflict handling and avoids accidental resurrection.

---

## 14. Conflict principles

### 14.1 No silent user-data loss

An unresolved conflict must not silently discard unsynced local work.

### 14.2 No blind last-write-wins for performed-work conflicts

Where two devices changed the same historical/performed data, M3 does not silently choose “latest timestamp wins”.

### 14.3 Preserve conflict material

The client must retain:

- local unsynced intent;
- current server state/reference;
- enough metadata to let the user/system resolve safely.

### 14.4 Independent progress continues

A conflict blocks the affected mutation and its dependents.

It should not unnecessarily freeze all other independent sync activity.

### 14.5 Resolution creates new intent

After resolving a conflict, the chosen resolution should be submitted as a **new mutation** based on current authoritative revision.

Do not reuse the conflicted mutation ID with altered content.

---

## 15. Conflict classes

### 15.1 Duplicate delivery

Same mutation ID, same intent.

Resolution:

- automatic idempotent acknowledgement;
- not a user-visible conflict.

### 15.2 Concurrent edit of the same set

Example:

- Device A changes reps 8 -> 10;
- Device B, from the old revision, changes reps 8 -> 9.

Resolution:

- return conflict;
- preserve both intents;
- user chooses/edits the authoritative value;
- resolution uses a new mutation against current revision.

No field-level auto-merge is required in M3.

### 15.3 Delete versus stale edit

Example:

- server/device A deletes a set;
- stale device B edits that set offline.

Rule:

- stale edit cannot resurrect the deleted ID;
- surface conflict;
- user may discard the stale edit or, if product flow supports it, recreate the intended work as a **new** set with a new ID.

### 15.4 Session completed elsewhere versus stale continued logging

Example:

- Device A completes the session;
- Device B still believes it is active and records more sets.

M3 must not silently append those stale-device sets to a completed session as if intentional historical corrections.

Resolution:

- preserve the local sets;
- surface lifecycle conflict;
- user can explicitly choose to add them as a correction to the completed workout where valid, keep them as separate workout data where supported, or discard them.

Exact UX is deferred.

### 15.5 Complete versus cancel

Concurrent terminal transitions conflict.

Do not choose based solely on arrival time.

User resolution is required if both represent legitimate user actions.

### 15.6 Two active sessions from different devices

The Workout Domain permits only one logical active workout per user in M3.

If two offline devices independently start workouts:

- server must not silently merge them;
- server enforces the one-active-session invariant;
- the later conflicting sync preserves its local workout data;
- user resolves which session remains/was valid.

If both contain genuine performed work, the product must offer a path that does not destroy one silently. Automatic cross-session merge is not required in M3.

### 15.7 Session correction after downstream plan effect

If a completed workout is later corrected/cancelled:

- server recomputes/reverses derived plan/attendance effects from corrected authoritative history;
- stale clients must not preserve outdated derived truth as authoritative.

---

## 16. One-active-session server invariant

The server should enforce at most one authoritative `ACTIVE` workout per user.

A client can temporarily violate this locally only because it was offline and unaware of another device.

That becomes an explicit sync conflict.

A server-side unique/invariant mechanism is expected, but exact SQL implementation is deferred.

---

## 17. Session completion sync

### 17.1 Local completion is immediate

When the user explicitly finishes offline:

- local session becomes `COMPLETED`;
- UI may show the locally completed workout immediately;
- a completion mutation enters the outbox.

### 17.2 Completion depends on prior local work

The completion mutation must not be applied remotely before all prior local mutations required to represent that workout have succeeded.

Example:

sets A/B/C pending -> completion waits.

### 17.3 Server validation

Server validates domain invariants, including:

- session currently permits completion;
- at least one authoritative completed set remains;
- relevant concurrency conditions hold.

### 17.4 Conflict does not erase local completion

If server rejects completion due to a concurrency conflict:

- preserve the locally completed workout and unsynced mutations;
- surface sync conflict;
- resolve explicitly.

The client must not silently convert the workout back to a different state without user-visible resolution.

---

## 18. Cancellation sync

Cancellation is an explicit domain mutation.

If the session has completed sets, the local product already requires destructive confirmation.

The cancel mutation:

- depends on prior required local mutations;
- carries concurrency protection;
- causes derived plan/attendance effects to be recomputed from authoritative state.

Cancel versus concurrent remote edits/finish may conflict.

---

## 19. Correction that removes the final set

The Workout Domain says an empty `COMPLETED` session is invalid.

Sync must preserve that invariant.

If a correction removes the final completed set:

- local transaction also records the required session transition to cancelled/discarded-training semantics;
- mutation dependencies ensure the server never settles into an authoritative empty `COMPLETED` state;
- derived plan/attendance effects are reversed after acknowledgement.

Exact API packaging may be:

- one atomic domain command; or
- causally linked mutations processed transactionally/serially.

The final server state must satisfy the domain invariant.

---

## 20. Pull/reconciliation

Synchronization is not only pushing the outbox.

Clients must also learn about authoritative changes created by:

- another device;
- server-side correction/process;
- prior successful mutation whose response was lost.

M3 requires a reconciliation mechanism.

Possible implementation strategies include:

- authoritative entity/session refresh;
- revision/cursor-based incremental pull;
- mutation acknowledgement snapshots.

Exact mechanism is deferred.

### Required behavior

On relevant app launch/resume/connectivity restoration:

- do not overwrite pending local intent;
- obtain sufficient authoritative revision/state to detect stale local bases;
- flush/reconcile safely.

A final authoritative refresh after a successful sync cycle is desirable for affected workout state.

---

## 21. Sync cycle

A conceptual sync cycle is:

1. confirm authentication/connectivity **and activate the matching local account partition**;
2. verify the local originating subject matches the authenticated application subject;
3. reconcile enough remote revision/state to detect obvious staleness;
4. select the next eligible outbox mutation from that same account partition;
5. verify dependencies;
6. send with stable `mutation_id` and base revision where relevant;
7. receive applied/already-applied/conflict/error result;
8. atomically persist acknowledgement/revision locally;
9. unblock dependents;
10. continue;
11. refresh affected authoritative state when needed.

The exact batching/protocol may differ as long as these semantics hold.

---

## 22. Triggers

M3 should attempt synchronization opportunistically when practical:

- after a local mutation while online;
- app launch/resume;
- connectivity restoration;
- user authentication restoration;
- explicit user retry;
- after local session completion/cancellation.

OS background execution may be used where supported but is **not** a correctness requirement.

A workout must remain safely stored locally if the OS never grants background time.

---

## 23. Crash/restart guarantees

### Crash after local domain write?

Impossible by contract if the outbox insert is in the same SQLite transaction.

### Crash after outbox enqueue but before send

Mutation remains pending and retries.

### Crash during send

Mutation returns to retryable/unacknowledged state and is retried with the same ID.

### Server commit, response lost

Retry returns idempotent already-applied result.

### Response received, app crashes before local ack transaction

Retry is safe because server idempotency returns the same result.

### App restart with active workout

Workout state and outbox restore from SQLite independently of network.

---

## 24. Mutation compaction

Compaction can reduce unnecessary network writes, but correctness comes first.

### Safe local-only compaction

Before any mutation has been sent, some successive intents may be collapsed if semantics are provably identical to applying them sequentially.

Example candidate:

- user edits a still-unsent note several times.

### High-risk data

Do not casually compact:

- performed set creation/deletion;
- session completion/cancellation;
- mutations with dependents;
- anything already sent or whose remote status is uncertain.

Exact compaction rules are provisional.

M3 can ship correctly with little/no compaction.

---

## 25. Mutation schema/versioning

Every mutation format should have an explicit protocol/schema version.

Server must:

- validate supported version;
- reject unknown incompatible versions explicitly.

This allows future mobile/server evolution without interpreting old payloads ambiguously.

---

## 26. Authentication and authorization

Every remote mutation is authorized by the authenticated application user.

### 26.1 Local account partition

All syncable local workout/domain state and outbox rows must retain the **originating application subject/account identity**.

Local state is partitioned by account.

Before the client:

- renders account-owned workout state;
- reconciles remote state;
- selects an outbox mutation;
- sends a mutation;

the originating local subject must match the currently authenticated application subject.

A queued mutation created by user A must never be sent while user B is authenticated on the same installation.

On sign-out/account switch:

- preserve user A's unsynced local data under A's partition;
- stop rendering/sending A's account-owned workout data;
- activate/render only the newly authenticated account's partition;
- resume A's sync only when A authenticates again.

This rule applies even to creates whose entity does not yet exist remotely, because server ownership would otherwise be derived from the wrong current JWT.

### 26.2 Server authorization

Rules:

- never trust a payload `user_id` as authorization;
- entity ownership is validated server-side;
- authenticated subject owns newly created workout entities;
- device/installation ID is diagnostic only;
- one user cannot mutate another user's workout by guessing IDs;
- local offline state does not grant remote authorization.

If authentication expires, keep local data in its originating account partition and resume sync only after that same subject is authenticated again.

---

## 27. Sync observability

Engineering/runtime should be able to inspect enough metadata to diagnose synchronization without reading hidden reasoning.

Useful fields include:

- mutation ID;
- user/account scope;
- entity/session IDs;
- mutation type/version;
- local created time;
- dependency IDs;
- base revision;
- attempt count;
- latest attempt/result;
- server acknowledgement revision;
- conflict/error code;
- device/installation identifier where appropriate.

Avoid duplicating sensitive workout payloads into verbose logs unnecessarily.

---

## 28. User-facing conflict principles

Final UI belongs in the User Journey, but conflict UX must obey:

- explain what is conflicting in plain language;
- never show raw database/version jargon as the primary message;
- never imply unsynced work is lost if it is preserved;
- offer the smallest safe choice set;
- preserve ability to leave conflict unresolved without destroying local data.

Example:

> This workout was completed on another device while you continued adding sets here. Your local sets are safe. Choose how you want to keep them.

---

## 29. M3 versus M6

### M3 must deliver

- local-first SQLite recording;
- atomic domain + outbox write;
- stable IDs;
- idempotent remote mutations;
- causal/dependency ordering;
- retry/restart safety;
- optimistic concurrency;
- tombstones / anti-resurrection semantics;
- explicit conflict detection;
- safe basic manual conflict resolution;
- one-active-session conflict handling;
- observable sync state;
- no silent data loss.

### M6 may mature

- richer automatic multi-device merge;
- high-volume batching/compaction;
- generalized sync framework across all domains;
- sophisticated background scheduling;
- near-real-time multi-device updates;
- advanced delta/cursor optimization;
- broad offline plan/social editing;
- conflict-resolution UX polish;
- storage/outbox compaction and long-term maintenance.

“M6 later” must not remove any M3 correctness guarantee listed above.

---

## 30. Tests implied by this contract

Implementation must include at least:

1. local set + outbox written atomically;
2. restart restores active workout and pending mutations;
3. same create-set mutation retried does not duplicate;
4. server commit + lost response + retry returns same semantic result;
5. same mutation ID with different content rejected;
6. child mutation waits for parent creation dependency;
7. completion waits for prior set mutations;
8. transient failure retries without data loss;
9. auth expiry preserves outbox;
10. stale edit of same set returns conflict, not silent LWW;
11. delete then stale edit cannot resurrect same set ID;
12. complete versus cancel conflict is explicit;
13. session completed on device A while B adds offline sets preserves B's local work and conflicts;
14. two offline active sessions are not silently merged;
15. conflict in one session does not block independent queue work;
16. correction deleting final set cannot produce empty completed server session;
17. cancellation reverses derived completion effects;
18. app crash during `SENDING` safely retries;
19. model/decision-engine availability is irrelevant to core sync correctness.

---

## 31. Explicitly unresolved

Do not hard-code yet:

- final REST endpoint shape;
- batch versus single-mutation HTTP protocol;
- exact UUID version;
- exact outbox table schema;
- exact server revision granularity/type;
- exact mutation payloads;
- exact HTTP status mapping;
- exact retry/backoff constants;
- exact delta-pull/cursor design;
- exact tombstone retention duration;
- exact local compaction policy;
- exact conflict UI;
- exact automatic merge rules beyond approved safe cases;
- background task implementation;
- offline plan/template authoring sync beyond workout-core requirements.

---

## 32. Acceptance

This contract becomes M3 sync authority when the Product Owner approves:

- SQLite domain+outbox atomicity;
- stable client entity/mutation identity;
- strict idempotency;
- causal dependency ordering;
- explicit acknowledgement semantics;
- retry versus conflict distinction;
- optimistic concurrency rather than blind LWW;
- tombstones preventing stale resurrection;
- no silent loss of local unsynced work;
- explicit multi-device session conflicts;
- completion/cancellation dependency semantics;
- server authority after acknowledgement;
- reconciliation/pull requirement;
- restart/crash guarantees;
- M3/M6 scope boundary.

Approval does not authorize final API payloads, SQL schema or conflict UI.

