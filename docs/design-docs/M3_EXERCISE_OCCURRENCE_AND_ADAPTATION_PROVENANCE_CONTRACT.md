# M3 Exercise Occurrence and Adaptation Provenance Contract

**Status:** Proposed for Product Owner approval — NOT YET ACCEPTED  
**Milestone:** M3 — Workout Engine  
**Issue:** #125 — R2-04 / audit #117 N-P1-04 and N-P1-05  
**Date:** 2026-10-08  
**Parent authorities:** `M3_WORKOUT_DOMAIN_CONTRACT.md`, `M3_PERSISTENCE_AND_DATA_MODEL_CONTRACT.md` (#110), `M3_WORKOUT_SYNC_CONTRACT.md`, `M3_USER_JOURNEY.md`, `M3_TRAINING_PROFILE_AND_SESSION_CONTEXT_CONTRACT.md` (#122), `M3_SERVER_DELETION_AND_RETENTION_CONTRACT.md` (#124), ADR-003 and accepted exercise/equipment semantics.

## 1. Decision and scope

M3 must separately preserve (a) **forward-looking planned/accepted intent**, (b) **actual confirmed performed work**, and (c) **a durable explanation of material changes to that intent**. The user can add, reorder, replace or remove an exercise without having performed it.

R2-04 chooses the following minimum authoritative model:

1. **Pre-first-set**: an exercise selection is an `ActiveSessionAgendaItem` and optional local editor/draft state, **not** a `WorkoutExerciseOccurrence` in performed history.
2. **On first confirmed performed set**: atomically materialize a stable `WorkoutExerciseOccurrence` together with the first authoritative `WorkoutSet`.
3. **Material in-session changes**: persist **ordered, accepted/applied agenda-change records**, distinguishing a proposal, acceptance, rejection, manual edit and actual execution.
4. **At Finish**: persist an **immutable final-agenda/completion snapshot** in the same authoritative transaction as the lifecycle change, with causal dependencies on all confirmed sets and accepted changes. It must be reconstructable by server and downstream analytics without relying on the device's mutable SQLite agenda.
5. **Historical corrections**: corrections can change actual performed history and recomputable coverage without silently replacing the preserved original prescription, confirmed adaptation history or original finished snapshot. Any explicit corrected-final snapshot/revision is separately attributable.

This is a minimum **semantic** contract, not final SQL table naming, endpoint shape, exact UI design or a permission to implement broad G2 decision-trace storage. No menstrual/cycle or G1 subjective readiness persistence is authorized by this document.

## 2. Historical occurrence lifecycle (N-P1-04)

### 2.1 Before first performed set

The following actions change agenda/draft state only:

- tapping `+ Add exercise` or selecting one from the exercise catalogue;
- inspecting instructions/history or changing target values;
- selecting/changing gym/machine before performing anything;
- changing exercise order, dismissing or replacing an untouched item;
- preallocating stable client IDs for local references;
- creating/editing an unconfirmed `SetDraft`.

An agenda item has its own stable `agenda_item_id`. It may exist locally, be synced as **planning state** through an applied agenda-change mutation, and be preserved as `UNPERFORMED` in final agenda provenance. **None of this constitutes a historical performed occurrence.**

An untouched exercise removed before its first set must not produce a performed occurrence or inflate completed-exercise counts, volume, PRs, attendance, plan coverage or fatigue. It may remain in initial prescription and accepted-change provenance so the plan can explain why it was removed.

### 2.2 First confirmed set: one atomic boundary

Only an explicit performed-set confirmation crosses the boundary. This includes the first confirmed `WARMUP` set, as warm-up is performed work, **but warm-up alone does not qualify a session for `COMPLETED`** under #110.

On the **first** confirmed set for a specific exercise occurrence:

- capture a stable client-generated `workout_exercise_occurrence_id` (preallocated locally if useful, but never authoritative while draft-only);
- record the **canonical exercise actually performed**, actual order/position, parent `session_id` and source `agenda_item_id` where applicable;
- atomically create the actual `WorkoutExerciseOccurrence` **and first `WorkoutSet`** with the set's original native machine/load/measurement and applicable immutable target-at-confirmation snapshot;
- atomically commit local SQLite domain history plus outbox mutation. On the server the same first-set operation is **transactional**: no durable, visible, orphan historical occurrence can remain if its first performed set is rejected;
- use stable IDs, user ownership and mutation idempotency to survive lost acknowledgements without duplicating occurrence or set.

For later performed sets on the same occurrence, reference its stable ID; never materialize a duplicate occurrence per set. Multiple intentional passes, substitutions or a different exercise occurrence for the same canonical exercise may still use distinct IDs when the **actual user action** calls for them. A machine change alone does **not** create a new canonical exercise; each set retains its actual machine/configuration.

An unconfirmed Set Draft is never a remote `WorkoutSet.PENDING` row.

### 2.3 First-set correction and removal

A post-hoc correction may update a previously performed set under optimistic concurrency. If a user removes the **only** remaining confirmed set in an occurrence, the system must not present an empty occurrence as performed exercise history.

Implementation may atomically remove/tombstone that occurrence with the final set or maintain a clearly non-performed audit tombstone. It must **not** expose a zero-set live `WorkoutExerciseOccurrence` as performed history; corrections must remain idempotent and prevent stale resurrection.

If removal/reclassification also eliminates the last qualifying `WORKING` set in a `COMPLETED` session, perform the accepted **explicitly confirmed, atomic cancellation/discarded-training correction** from #110/R2-01, even if warm-up sets remain. Deleting an occurrence may not silently delete unrelated performed sets or silently rewrite an original agenda/final snapshot.

### 2.4 Planned versus actual versus substituted

Keep three identities separate:

- `source_prescription_item_id` / stable original `agenda_item_id`: the exercise and intended target, if any;
- `actual_workout_exercise_occurrence_id`: the actual exercise attempt that **has confirmed performed work**;
- `canonical_exercise_id` on that occurrence: exercise **actually performed**, not merely proposed.

For substitution, preserve source identity and the selected actual canonical exercise. Historical performance may be compared only under existing exercise/machine semantics and curated alias rules (#89). An unperformed prescribed item must never be counted as an actually performed exercise.

## 3. Durable applied-agenda provenance (N-P1-05)

### 3.1 Original session-start authority

The accepted `SessionPrescriptionSnapshot` is immutable; it includes the initial ordered prescription/agenda IDs, source plan/template revision, target sets/reps/time/distance/rest/effort, execution groups and preferred equipment when known. A Free Workout may start with an empty initial agenda.

The **mutable Active Session Agenda alone is not sufficient** to explain history after offline sync, server restart, plan revision or later edits.

### 3.2 Material change records

Create a durable, ordered, account/session-owned semantic `AppliedAgendaChange` (or equivalent validated structured delta) **for each accepted/applied material change** to the remaining agenda. It is an operational history record distinct from a model's full Decision Trace.

Minimum semantics:

- `agenda_change_id` and stable `session_id`, plus user/owner-scoped identity;
- monotonic `agenda_revision_before` and `agenda_revision_after` (or equivalent causal sequence) and UTC `applied_at` timestamp;
- `action_kind`: `ADD_ITEM`, `REMOVE_ITEM`, `SUBSTITUTE_ITEM`, `REORDER_ITEMS`, `CHANGE_TARGET`, `CHANGE_EQUIPMENT_INTENT`, `CHANGE_EXECUTION_GROUP` (minimum families);
- affected stable `agenda_item_id`/ordered members and immutable **before/after** values sufficient to reconstruct the changed intent (including group IDs and order when relevant);
- `source`: `MANUAL_USER` or `USER_ACCEPTED_RECOMMENDATION` / user-edited version of a recommendation; recommendation ID and policy/context version **only if available/authorized**;
- structured `reason_code` **when known**, e.g. `TIME_LIMIT`, `EQUIPMENT_UNAVAILABLE`, `MANUAL_PREFERENCE`, `RECOVERY_RECOMMENDATION`, `UNKNOWN_NOT_RECORDED`;
- acceptance/override outcome **only when observed**: `ACCEPTED_AS_PROPOSED`, `USER_EDITED_THEN_APPLIED`, or directly manual. Mere presentation or rejection of a suggestion is **not an applied agenda change**;
- immutable historical reference/snapshot to the original source intent where relevant, plus equipment/configuration provenance if it materially changes planning meaning.

**Never invent a motive**. A user simply jumping ahead without removing something is an order/navigation change, not proof that the skipped exercise was discarded, unimportant, painful or impossible. Rejected proposals remain outside applied agenda history; retaining candidate/rejection decision traces is a **separate G2 decision/privacy gate** and not necessary for reconstructing executed history.

A user-initiated selection of an exercise in Free Workout changes planning state and may be represented by an `ADD_ITEM` change without a performed occurrence. A later removal can record `REMOVE_ITEM` while leaving no performed occurrence. Pure transient UI focus/typing does **not** need a server change record until an applied agenda change occurs.

### 3.3 Apply atomically with agenda revision

Accepting a material change must update the local Active Session Agenda **and** record the applied change/outbox in one crash-safe SQLite transaction. Its server replay must atomically validate/update the agenda revision **and** append the change record. Reusing the same mutation ID returns the same semantic result, not a duplicated delta.

If a recommendation becomes stale because another device or local action changed context/revision, do **not** apply its old delta without renewed user confirmation. Conflicting changes to the same agenda revision require explicit resolution, not silent last-write-wins or a stealth edited recommendation.

**Ordering:** changes that edit/replace remaining work may not alter completed WorkoutSets or their target-at-confirmation snapshots; the new agenda revision governs subsequent sets only.

### 3.4 Full G2 trace is distinct

A minimal `AppliedAgendaChange` preserves *which action was applied and the known user-declared/material reason*. It does not prove a model's probability, include hidden chain-of-thought, require saving all candidate recommendations, or authorize long-term G1/G2 sensitivity context. Personalized decision trace persistence remains a separate G2 security/privacy/accuracy gate. Missing G2 trace cannot block manual Free Workout logging.

## 4. Immutable session final-agenda snapshot

### 4.1 Finish/closure object

On successful explicit `Finish`, the session retains a stable, immutable `SessionCompletionAgendaSnapshot` (or equivalent immutable revision) of **final accepted intent versus performed history**, stored server-side in a queryable structured form.

Minimum content:

- stable `completion_snapshot_id`, `session_id`, source plan/template IDs/revisions and original prescription snapshot reference where present;
- final applied `agenda_revision` and ordered `agenda_change_id` references (plus an integrity/version summary);
- ordered final agenda items identified by stable `agenda_item_id`, with canonical intended exercise, source prescription reference, final target and executed/superseded grouping;
- **final per-item status** distinguishing `SATISFIED`, `PARTIALLY_PERFORMED`, `NOT_PERFORMED`, `REMOVED_BY_ACCEPTED_CHANGE`, `SUBSTITUTED`, and additional states only where genuinely necessary;
- explicit source/reason **only if evidenced by a user action or accepted change**; a `NOT_PERFORMED` item with unknown reason is not silently relabeled `USER_SKIPPED`;
- links to actual occurrence/set identities representing performed history (or a deterministic queryable mapping based on stable `agenda_item_id`), without copying or rewriting native set loads;
- execution-group membership and ordered member IDs when a group existed; source versus final groups remain traceable;
- explicit `completed_at` UTC and accepted session time-zone/local-day context;
- structural validation linking final snapshot to the accepted changes and the final agenda revision.

For a Free Workout, the initial agenda may be empty; items added during the workout appear in the final snapshot as applicable, even if removed/unperformed, but only performed sets create occurrences. The final snapshot is **not** itself exercise performance.

### 4.2 Lifecycle and authority

- A `COMPLETED` session must contain a qualifying performed `WORKING` set and a server-reconstructable, **immutable** final agenda snapshot.
- The local Finish transaction atomically creates the qualifying lifecycle transition, the immutable final snapshot and the completion outbox mutation. Locally committed completion may display immediately while remote sync is pending, as in Sync.
- The server Finish mutation is **single failure-atomic transaction**: verify all prerequisite performed work and applied agenda changes, validate final snapshot against the authoritative agenda revision/IDs and qualifying work, then commit `COMPLETED` **and snapshot together**. No remotely completed session may lack its final snapshot.
- Finish must depend causally on all required parent session, occurrence/sets, machine/template and applied-change mutations; neither out-of-order replay nor a lost response may create a partial completion.
- Finished snapshots are not recomputed from a later mutable plan, Machine Profile, or current Training Intent. Corrections to completed sets remain explicit, versioned domain operations. If a historical interpretation/snapshot must be amended, create an **explicit superseding correction revision** with reason/user intent and retain original as provenance; never overwrite silently.

### 4.3 Cancel and resume

Cancellation is distinct from Finish. An `ACTIVE` session has its current local agenda and applied changes even without performed sets. App close/restart never implicitly Finishes/Cancels; recovery replays SQLite agenda, drafts and unsynced changes.

A `CANCELLED` session is not completed gym training; it must not carry a normal `SessionCompletionAgendaSnapshot` or grant Plan Step coverage. The server may retain a minimal non-performance cancellation/agenda closure for sync/debugging under explicit deletion/retention semantics, but it must not create performed occurrences for untouched exercise selections. The **exact cancelled-session payload-retention policy remains gated by R2-03 implementation/privacy approval**; this contract does not invent such retention.

When a completed session is subsequently corrected into `CANCELLED` under the final-WORKING-set invariant, retain the original finalized snapshot in versioned correction/audit context only to the extent permitted by the approved user-data retention policy. The current valid lifecycle and coverage follow the corrected history.

## 5. Sync, offline and security boundary

### 5.1 Outbox semantic mutation families

Minimum conceptual mutations:

1. `START_SESSION` including original prescription snapshot (where available).
2. `APPLY_AGENDA_CHANGE` including before/after revision + evidence/reason when recorded.
3. `CONFIRM_FIRST_SET_WITH_OCCURRENCE` atomically creating the occurrence plus first set.
4. `CONFIRM_ADDITIONAL_SET` under an existing occurrence.
5. `CORRECT_OR_REMOVE_SET` with the accepted occurrence cleanup and session-qualification checks.
6. `FINISH_WITH_FINAL_AGENDA_SNAPSHOT` atomically committing lifecycle + immutable snapshot.
7. `CANCEL_SESSION` (not a Finish mutation; cancellation remains explicitly destructive after performed work).

Names are illustrative: the runtime protocol may use other naming and endpoint shapes, but **not weaker atomicity/causality**. Optional proposal-only changes are not applied mutations.

Every mutation uses immutable IDs, account partition, idempotency key, expected revision and tombstone/optimistic-concurrency rules from `M3_WORKOUT_SYNC_CONTRACT.md`.

### 5.2 Ordering and server validation

Example:

`START_SESSION -> APPLY_AGENDA_CHANGE(ADD) -> CONFIRM_FIRST_SET_WITH_OCCURRENCE -> APPLY_AGENDA_CHANGE(TIME_SHORTEN) -> CONFIRM_ADDITIONAL_SET -> FINISH_WITH_FINAL_AGENDA_SNAPSHOT`.

Dependencies can cross user-owned entities, e.g. a just-created Machine Profile or unsynced saved Template revision. A dependent performed set must wait until its actual machine/parent occurrence is resolvable server-side, and Finish must wait for every material agenda change it claims.

Server must reject:

- orphan `WorkoutExerciseOccurrence` without confirmed performed sets;
- performance set referring to an unowned/wrong-session occurrence or canonical exercise;
- an agenda change that rewrites historical sets/targets or silently overwrites a concurrent revision;
- a final snapshot referencing a non-existent/mismatched revision, wrong user, unsynced prerequisite, or undocumented applied adaptation;
- a normal `COMPLETED` lifecycle transition without both the final snapshot and a qualifying `WORKING` set;
- stale post-Finish agenda rewrites that would change final meaning without explicit correction/conflict resolution.

### 5.3 Offline and multi-device

- SQLite locally restores the agenda, drafts, material applied changes, stable IDs and pending snapshot; no server call is required to continue offline after accepted authenticated bootstrap.
- Server acknowledgement of a first-set atomic mutation may be lost; retried same `mutation_id` returns original result, no second occurrence or set.
- A multi-device conflict between independent agenda revisions is explicit; do **not** silently concatenate incompatible final agendas or force another device's unsynced data into an already completed server session.
- Account switching and account deletion follow the accepted partition and R2-03 server deletion semantics; applied changes/final snapshots are user-owned personal data and deleted with their parent session, never retained as “anonymous” because they only contain UUIDs.
- Network/model outages cannot prevent local manual recording; advanced recommendation/decision trace data cannot be required to write the basic performed set.

## 6. Acceptance test scenarios

1. **Add/remove untouched exercise**: Free Workout add Bench, inspect/edit draft, remove before confirming a set -> no performed `WorkoutExerciseOccurrence` local or server; may retain non-performance agenda delta.
2. **Warm-up-only occurrence**: first confirmed `WARMUP` materializes occurrence+set; user cannot Finish normally with no qualifying `WORKING`.
3. **First WORKING set**: local occurrence/first-set/outbox commit atomic; on server occurrence+set commit atomic, stable IDs unchanged after restart.
4. **Lost first-set ACK**: server committed but HTTP response lost; retry same mutation creates **exactly one** occurrence and set.
5. **First-set failure**: server rejects invalid measurements/machine reference; no orphan occurrence or partial performed history remains.
6. **Only set removed**: explicit correction removes last performed set; occurrence no longer appears as performed and tombstone prevents stale resurrection.
7. **Last qualifying set corrected**: a completed workout with remaining warm-ups loses last qualifying WORKING -> explicit confirmation, atomic cancellation/recompute, no invalid COMPLETED state.
8. **Manual Free Workout**: add an exercise and confirm sets without plan/Training Intent or ML service; valid session and immutable final snapshot.
9. **Accepted time-shortening**: user accepts revised 20-min agenda; the delta is durable with TIME_LIMIT evidence and final status of omitted accessories, without rewriting earlier sets.
10. **Recommendation rejected**: recommendation shown but rejected/ignored -> no `AppliedAgendaChange` claiming acceptance; optional G2 trace separate.
11. **Unknown omission**: a prescribed exercise is never attempted, with no removal action -> snapshot `NOT_PERFORMED` with unknown reason, not automatically `USER_SKIPPED` or `TIME_LIMIT`.
12. **Manual substitution**: original barbell agenda item replaced by dumbbell, actual occurrence canonical ID is dumbbell; prescription/source ID and substitution action remain reconstructable.
13. **Multiple adaptations**: the time budget shrinks, then user restores an accessory; ordered immutable deltas and later per-set target snapshots reflect the exact revision in force.
14. **Superset/reorder**: accepted compatible SUPERSET grouping and changed exercise order persist stable member IDs/group provenance and do not invent new `WorkoutSet.set_type`.
15. **Machine change mid-occurrence**: Cable A sets remain A; later Cable B sets preserve B; canonical exercise identity unchanged unless user actually substitutes exercise.
16. **Finish dependencies**: completion held until all prerequisite sets/agenda changes are acknowledged; server refuses an incomplete or inconsistent final snapshot.
17. **Atomic Finish retry**: server commits completed state+snapshot, response lost -> retry returns same semantic result, no duplicate completion snapshots.
18. **Session restored mid-workout**: app crashes with unconfirmed Set Draft and accepted pending agenda delta -> SQLite restores both, with no remote performed set fabricated.
19. **Multi-device edits**: devices diverge on same agenda revision; conflict preserves both local intents without silent last-write-wins or accidental completed-set mutation.
20. **Finish early**: valid qualifying work + incomplete agenda yields `COMPLETED` session, final statuses still show partial/not-performed work; plan coverage is separately derived.
21. **Cancellation**: explicit cancellation of an untouched or partially performed workout does not leave empty “performed” occurrence rows for untouched items or mark Plan Step covered.
22. **Account deletion**: confirmed account deletion removes user-owned agenda changes and final snapshots alongside their M3 parent data under R2-03; a system-wide catalogue exercise survives.

## 7. Implementation gates and explicit deferrals

**R2-04 can close N-P1-04 and N-P1-05 at accepted semantic-contract level only after Product Owner approval and integration.** It does not close or implement:

- SQLAlchemy/Alembic schema, FastAPI mutation routes, SQLite outbox payloads, indexes or migration tests;
- #89 exercise alias canonicalization before workout-history identity freeze;
- R2-03 deletion executor, external ledger, receipts and operational retention controls;
- G1 subjective readiness input/recovery automation thresholds, G2 full recommendation/decision-trace persistence, G4 mobile logout failure fix;
- #116 menstrual/cycle-specific persistence;
- exact timed rest UI, circuit taxonomy, advanced sets, post-M3 analytics or premium packaging.

No agent should use this proposed document as permission to freeze history schema/API before these relevant gates and implementation tests are satisfied.

## 8. Product Owner approval requested

Approval of this proposed R2-04 contract accepts:

1. **no historical occurrence** until first confirmed performed set, including WARMUP, with atomic first-set creation;
2. separate agenda-local intent/drafts and authoritative historical performed sets;
3. durable ordered, applied material agenda-change records distinct from full G2 decision traces;
4. an immutable final agenda snapshot committed atomically with an explicit qualifying Finish;
5. strict offline/server idempotency, causal sequencing, conflict protection and non-fabrication of user intent;
6. explicit correction/cancellation behavior and preservation of original history semantics.

Approval is **not** approval of final SQL/API/SQLite implementation, production data-retention numbers or sensitive-context collection.
