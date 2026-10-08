# M3 Post-Remediation Cross-Contract Audit

**Status:** Audit complete — additional targeted remediation required before final workout-schema/API freeze  
**Audit issue:** #117  
**Audited main:** `f18300678baf5df217efc6d3f39f5f407bfe6bc3`  
**Date:** 2026-10-08

## 1. Executive verdict

The first remediation pass materially improved M3.

The core architecture is now coherent:

- Training Intent has a viable persistence model;
- plan/template revisions and historical snapshots are defined;
- Plan Step coverage is separated conceptually from session lifecycle;
- Set Draft is distinguished from performed WorkoutSet in the new persistence authority;
- Machine Profile / Configuration / Gym Context are first-class;
- units/timezone semantics are defined;
- SUPERSET has a minimum representable execution-group model;
- offline read continuity is defined;
- account partitions, logout, deletion-pending and local purge behavior are defined;
- the User Journey now covers the previously missing offline/account/machine scenarios.

No P0 product redesign is required.

However, **M3 is still not ready for a final cross-domain PostgreSQL/API/SQLite freeze**.

The remaining issues are narrower than in #105, but they matter because several older accepted contracts still contradict the new remediation authority, and a few persistence-critical concepts were not included in the first remediation pass.

### Overall readiness

- **Basic implementation exploration / infrastructure:** may proceed where isolated from unresolved semantics.
- **Final workout history schema / mutation API:** not yet ready.
- **Exercise Intelligence work:** may proceed in parallel under #115, with #89 handled early.
- **Sensitive menstrual/cycle persistence:** remains gated by #116 and must not be introduced yet.
- **Final implementation backlog:** wait until the P1 items below are closed and this audit is rechecked.

---

## 2. What was audited

Re-audited together:

- Product Vision
- Technical Blueprint
- MVP
- M1 Identity Contract
- M3 Workout Engine Product Contract
- M3 Training Goal Policies
- M3 Exercise & Equipment Contract
- M3 Workout Domain Contract
- M3 Decision Engine Contract
- M3 Workout Sync Contract
- M3 Persistence & Data Model Contract
- M3 Local Data & Identity Continuity Contract
- M3 User Journey
- first audit #105 / merged report
- current M2 catalogue model/importer
- current M1 mobile logout/account-deletion implementation
- open #89, #115 and #116

The audit focused on:
- contradictions between accepted design authorities;
- persistence/cardinality gaps;
- offline/auth/security seams;
- whether accepted UX has representable/syncable state;
- whether implementation agents can derive unambiguous schemas without guessing.

---

# 3. Closure table for prior P1 findings from #105

## P1-01 — Goal model ambiguity

**Status: PARTIALLY CLOSED**

### Closed by remediation

`M3_PERSISTENCE_AND_DATA_MODEL_CONTRACT.md` now defines:

- `primary_training_policy`;
- optional `secondary_training_policy`;
- nullable `body_goal`;
- `primary_intent_dimension`;
- historically versioned Training Intent revisions.

This solves the original duplicate-`FAT_LOSS` persistence problem.

### Remaining contradiction

Older accepted documents still expose the superseded concept:

- Training Goal Policies: `primary_user_outcome = FAT_LOSS`;
- Workout Domain: “primary user outcome” plus body modifier, both shown as FAT_LOSS;
- Decision Engine context: “primary user outcome”.

Training Goal Policies also says one body-goal modifier is always active, while the persistence contract explicitly permits no body goal.

### Required closure

Reconcile those documents to the accepted persistence model.

---

## P1-02 — Session completion versus Plan Step fulfillment

**Status: PARTIALLY CLOSED**

### Closed by remediation

Persistence contract now explicitly separates:

- session lifecycle;
- Plan Step coverage;
- next-step recommendation.

It explicitly rejects blind `current_step += 1`.

### Remaining contradiction

Workout Domain still says:

- completed planned session provides completed exposure against the step;
- finishing early can advance the baseline plan sequence.

User Journey still says:

- planned workout completed normally -> “Advance plan sequence”;
- Scenario 2 ends with “next plan step”.

Those statements can cause an implementation to bypass the new coverage model.

### Required closure

Session completion must end the actual workout.

Plan progression/next proposal must be decided from:
- source logical Plan Step;
- coverage;
- actual history;
- free/out-of-sequence work;
- recovery/context.

---

## P1-03 — Completion eligibility / WARMUP versus WORKING

**Status: PARTIALLY CLOSED**

### Closed by remediation

Persistence contract and amended User Journey now explicitly approve:

> A normal completed M3 workout requires at least one completed qualifying WORKING set.

### Remaining contradictions

Workout Domain still permits completion with generic “performed work” / “at least one completed performance set”.

Workout Sync server validation still checks:

> at least one authoritative completed set remains.

Sync correction logic only handles deletion of the **final completed set**, not removal/reclassification of the final qualifying WORKING set while warm-ups remain.

### Risk

A backend implemented directly from Sync could accept a warm-up-only `COMPLETED` session.

### Required closure

Update Domain + Sync + implied tests to the qualifying-performed-work rule.

---

## P1-04 — Missing offline read model

**Status: CLOSED AT CONTRACT LEVEL**

Local Data & Identity Continuity now defines the minimum cache for:

- canonical exercise identity/search/logging;
- active plan/template/prescription;
- Machine/Gym data;
- active workout/agenda/drafts;
- optional recent history;
- offline planned-session start.

Implementation remains pending.

---

## P1-05 — Machine Profile / Gym Context persistence and sync

**Status: CLOSED AT CONTRACT LEVEL**

Persistence + Local Data now define:

- stable client IDs;
- ownership;
- native units/load sequences;
- Machine Configuration;
- Gym Context;
- historical set snapshots;
- offline creation;
- causal sync dependencies.

Implementation remains pending.

---

## P1-06 — WorkoutSet.PENDING ambiguity

**Status: PARTIALLY CLOSED**

### Closed by remediation

Persistence contract now says:

- Set Draft is local active-workout state;
- authoritative WorkoutSet represents confirmed performed work;
- confirming a set atomically creates performed history + outbox.

### Remaining contradiction

Workout Domain still describes `PENDING` as a Workout Set lifecycle state and shows:

`create/edit pending -> PENDING -> confirm performed -> COMPLETED`

This can still lead a schema agent to create remote PENDING WorkoutSet rows.

### Required closure

Replace Domain PENDING WorkoutSet semantics with local Set Draft semantics.

---

## P1-07 — Plan/template revision and snapshot strategy

**Status: CLOSED SEMANTICALLY; DOCUMENT CLEANUP REQUIRED**

Persistence contract now defines:

- stable plan/template identity;
- immutable revisions;
- stable logical Plan Step IDs across revisions;
- session-start prescription snapshot;
- per-set target/prescription snapshot.

Workout Domain's “explicitly unresolved” section still lists several of these as open.

That stale list should be updated before implementation planning.

---

## P1-08 — M1/M3 local identity, deletion and offline-auth continuity

**Status: CLOSED FOR LOCAL DEVICE SEMANTICS; NEW SERVER-DATA GAP FOUND**

Local Data contract now correctly defines:

- account partitions;
- transient refresh outage -> local-only continuity;
- definitive auth failure -> access ends;
- logout clears local continuity even if provider logout fails;
- deletion-pending durability;
- local purge after confirmed account deletion;
- revocation != deletion;
- cross-account outbox isolation.

A separate new P1 finding exists for **server-side M3 data deletion/retention**; see N-P1-03.

---

## P1-09 — Superset representation

**Status: CLOSED SEMANTICALLY; DOCUMENT CLEANUP REQUIRED**

Persistence contract defines minimum Execution Group:

- stable group ID;
- type = SUPERSET;
- ordered member agenda/template items;
- optional rest targets.

Workout Domain still says exact superset/circuit taxonomy is provisional.

Update Domain to state:
- SUPERSET minimum is accepted;
- broader circuit taxonomy remains future.

---

# 4. New P1 findings

## N-P1-01 — Accepted authorities still contradict the remediation contracts

This is now the main immediate blocker.

### Conflicting areas

#### Goal model
Old:
- `primary_user_outcome`.

New:
- `primary_training_policy`
- optional `body_goal`
- `primary_intent_dimension`.

#### Session completion
Old:
- any performed/completed set can qualify.

New:
- qualifying WORKING set required.

#### Plan progress
Old:
- completion/finish-early may advance sequence.

New:
- coverage and Decision Engine determine next proposal.

#### Set draft
Old:
- WorkoutSet PENDING.

New:
- local Set Draft, remote performed WorkoutSet.

#### Superset / revision / persistence status
Old Domain/Product unresolved lists still mark several now-accepted decisions as provisional.

### Why this is P1

The repository precedence says “approved/current design document” but does not define “newest accepted design doc automatically overrides all older accepted docs”.

Two implementation agents can therefore follow different accepted documents and both believe they are correct.

### Required remediation

One authority-reconciliation PR should update:
- Training Goal Policies;
- Workout Domain;
- Decision Engine;
- Workout Sync;
- Product Contract;
- User Journey;
- PROJECT_STATE.

Do not change the approved product behavior; only reconcile older wording to #110/#112.

---

## N-P1-02 — Training Profile and cold-start persistence are missing

The product uses stable user context that is **not the same thing as Training Intent**.

Examples already accepted in product/journey/decision contracts:

- experience level;
- desired training frequency;
- typical workout duration;
- available equipment/context;
- muscle priorities;
- exercise preferences/dislikes;
- preferred RIR/RPE usage.

No first-class persistence owner exists for these fields.

### Cold-start contradiction

User Journey allows:

`No plan -> Free workout`

without forcing a goal/profile questionnaire.

But the Persistence contract describes a Training Intent revision whose `primary_training_policy` is required and then says session Start snapshots Training Intent.

A new user must not be assigned a fabricated policy merely to satisfy a foreign key.

### Required remediation

Define a **Training Profile / preference context** separate from Training Intent.

Recommended principle:

- Training Intent revision is optional until the user actually establishes one;
- if a Training Intent revision exists, its primary training policy is required;
- an Actual Workout Session may have no Training Intent revision;
- free workout must work with no plan and no intent;
- stable preferences/profile fields are nullable/progressive;
- any values used materially for a recommendation should be snapshotted/referenced in the relevant decision/session context.

This is required before profile/plan-selection schema is frozen and before the session FK to Training Intent is made non-null.

---

## N-P1-03 — Server-side deletion/retention for M3 personal data is undefined

The local deletion contract is now strong.

The server side is not.

M1 account deletion currently owns M1 profile/auth state only.

Once M3 adds user-owned PostgreSQL entities such as:

- workouts/sets;
- plans/templates;
- Machine/Gym data;
- Training Profile/Intent;
- readiness/context data;
- recommendation/decision traces;

the repository does not yet define whether confirmed account deletion:

- hard-deletes them;
- anonymizes them;
- keeps selected tombstones;
- keeps any data for integrity/legal reasons.

### Risk

M3 can accidentally:
- retain personal workout history after account deletion;
- make deletion fail because of new relationships;
- keep machine/plan/profile data tied to a terminal user indefinitely.

### Required remediation

Before structural M3 migrations:

define a server data-deletion matrix for every M3 user-owned entity.

At minimum specify:
- delete vs anonymize vs tombstone;
- cascade/order;
- what minimal non-PII tombstone may survive;
- how server deletion remains idempotent;
- interaction with historical/source IDs;
- tests extending IDN-006/007.

This is a schema/security prerequisite.

---

## N-P1-04 — Workout Exercise Occurrence lifecycle before the first performed set is unresolved

Domain authority says:

> an exercise contributes to performed history only through actual completed set work.

But Sync currently models:

`create session -> create exercise occurrence -> create set`

and the exact occurrence lifecycle is still explicitly unresolved.

### Real UX case

Free workout:

1. user taps + Add exercise;
2. opens Bench Press;
3. changes mind;
4. removes it without completing a set.

Should PostgreSQL contain a historical WorkoutExerciseOccurrence?

Current contracts do not give one unambiguous answer.

### Required remediation

Choose one model before the workout mutation API is frozen.

Recommended:

- selecting/adding an exercise before any performed set creates/updates an **agenda/local exercise draft**, not authoritative historical occurrence;
- the authoritative WorkoutExerciseOccurrence is created atomically with or immediately before the first confirmed performed set;
- removing an untouched exercise leaves no performed occurrence history;
- planned but unperformed exercises remain prescription/agenda data.

This mirrors the accepted Set Draft principle and avoids empty “performed” exercise rows.

---

## N-P1-05 — In-session adaptation provenance has no guaranteed durable/sync representation

Workout Domain already requires a completion snapshot that can explain:

- what was initially intended;
- what changed materially;
- what was actually performed.

User Journey displays examples such as:

> One accessory exercise removed due to time.

Persistence contract defines:
- session-start snapshot;
- mutable Active Session Agenda;
- per-set prescription snapshot.

But it does not explicitly require the **accepted in-session adaptation/final agenda state** to become durable server-reconstructable history.

Sync does not define an agenda/adaptation/completion-snapshot mutation.

### Risk

After sync, the server may know:
- original session prescription;
- actual performed sets;

but not whether an omitted exercise was:
- intentionally removed by accepted time adaptation;
- skipped manually;
- unavailable;
- removed by recovery logic.

This weakens:
- completion summary reconstruction;
- Plan Step coverage interpretation;
- recommendation explanations;
- learning from user overrides/adaptations.

### Required remediation

Before planned/adaptive workout persistence is frozen, require one durable approach:

- immutable completion/final-agenda snapshot;
- adaptation event log;
- or equivalent structured session-delta record.

It must preserve:
- material agenda changes;
- reason code/source (time/equipment/manual/recovery/etc.) where known;
- user accepted/overrode recommendation where material;
- final agenda status.

Exact SQL shape may remain implementation-specific.

---

## N-P1-06 — #89 canonical exercise identity remains a pre-history dependency

#89 now has a good semantic decision proposal:

- two true alias pairs;
- one intentionally distinct Spanish collision.

But the current M2 schema/importer still creates one application CatalogExercise row per upstream source UUID and has no canonical-alias/redirect layer.

### Risk

If workout history starts now, true aliases can accumulate history under separate exercise IDs.

### Required action

Complete #89's canonicalization representation before production-grade workout exercise references are considered frozen.

At minimum:
- preserve every upstream source ID;
- provide one canonical KeylorForge exercise identity for a true alias group;
- support alias/search redirects;
- local cache resolves aliases deterministically;
- workout writes use the canonical identity;
- migration/backfill is defined for any already-referenced alias row.

Basic development experiments can proceed, but do not declare the workout-history FK/canonical-identity design final before this is done.

---

# 5. Slice-specific P1 / implementation gates

These do not block every M3 task but must close before the named slice is implemented.

## G1 — Readiness/session-context persistence before fatigue/recovery automation

Decision policies rely on longitudinal inputs such as:
- energy/readiness;
- possibly soreness/sleep/motivation later;
- today's available time/context.

No persisted generic readiness-observation/session-context model is currently defined.

Before multi-session fatigue/recovery logic uses such signals:
- define what is stored;
- define session/time ownership;
- distinguish user observation from derived fatigue state;
- snapshot inputs used in recommendations;
- keep menstrual/cycle-specific persistence behind #116.

Basic workout logging does not depend on this.

---

## G2 — Decision trace persistence before model-assisted/personalized engine rollout

Decision Engine requires material recommendations to be traceable, but exact storage/retention remains open.

Before shipping a recommendation system that learns/evaluates outcomes, define:
- decision ID/version;
- candidate/reason-code persistence;
- accepted/ignored/overridden outcome;
- privacy/retention;
- model/version when applicable.

Basic deterministic UI suggestions can be developed earlier if they do not claim longitudinal learning.

---

## G3 — Deletion reconciliation mechanism must be concretized before implementing #112 behavior

The contract deliberately allows several approaches to lost deletion responses.

The current M1 implementation has no durable deletion receipt/status mechanism.

Before implementing deletion-pending M3 behavior, select one concrete protocol and test:
- provider deletion completed but response lost;
- app restart;
- refresh credentials no longer usable;
- local partition eventually purges only after terminal deletion is established.

---

## G4 — Explicit logout must clear local access even when provider sign-out fails

The accepted local-data contract (§11) requires explicit logout to end offline-continuity access immediately, regardless of remote/provider failure. The current mobile M1 implementation in `apps/mobile/lib/auth/auth-provider.tsx` lines 510–525 returns on `client.auth.signOut()` error (lines 517–520) **before** `updateAuthState(stateForSession(null))` (line 522). Thus the existing sign-out code does not satisfy the future M3 continuity requirement on this failure path.

This is an **implementation gate for enabling M3 offline continuity**, not proof that M3's new offline continuity is already exposed. Before that slice ships:

- transition the device to locally signed-out / partition-inaccessible state regardless of the provider call outcome;
- stop that subject's outbox and protected local-data rendering immediately;
- preserve the subject's unsynced partition for later successful sign-in, unless explicit deletion is requested;
- treat remote/provider revocation as best-effort without silently retaining local access;
- add a simulated provider/network failure test, plus account-switch isolation coverage.

Do not consider the M1/M3 logout seam implementation-complete merely because the design-level contract is closed.

---

# 6. P2 findings

## P2-01 — Product Contract and PROJECT_STATE are stale after remediation merges

Product Contract still lists as open:
- Training Intent persistence;
- Machine Profile schema;
- plan/template revisions;
- Plan Step coverage;
- offline read model;
- timezone/unit persistence.

Those are now substantially resolved by #110/#112.

PROJECT_STATE still presents #109/#110 as current remediation and does not list:
- Persistence/Data Model Contract;
- Local Data/Identity Continuity Contract;
- completed Journey amendment;
- second audit #117;
- #115/#116 workstreams.

Update the handoff before implementation delegation.

---

## P2-02 — User Journey parent authorities omit the new remediation contracts

The User Journey header should explicitly include:
- M3 Persistence & Data Model Contract;
- M3 Local Data & Identity Continuity Contract.

Its phrase “current remediation proposal requires…” should now say “accepted rule requires…”.

---

## P2-03 — Cross-entity outbox dependency should be explicit in Sync

Local Data correctly says:

a session that reuses a still-unsynced locally created template must depend on the template-revision create mutation.

Sync's generic dependency model can support this, but its examples/tests focus mostly on one workout session.

Add:
- cross-entity/cross-session dependency example;
- test that template create precedes dependent session create.

---

## P2-04 — Local catalogue bootstrap strategy can be unsafe if bundled IDs do not match server IDs

Local Data allows:
- API seed;
- bundled snapshot;
- hybrid.

Current M2 `CatalogExercise.id` values are application-owned UUIDs created with `uuid4` during database import.

Therefore a raw bundled Kinetic snapshot does **not** inherently know the PostgreSQL canonical exercise UUIDs.

### Safe initial choice

Use authenticated API bootstrap for the M3 local catalogue cache.

A bundled/hybrid seed is only safe if:
- canonical KeylorForge exercise IDs are deterministic/shared with the bundle; or
- the bundle uses source IDs and performs an authoritative reconciliation before creating syncable workout references.

Do not let the mobile app invent server exercise IDs.

---

## P2-05 — Notes/comments scope should be made explicit in persistence/API planning

MVP requires “add comments”.

Domain allows:
- session note;
- exercise-occurrence note;
- set note.

Persistence contract does not explicitly carry them into migration implications.

Recommended M3 baseline:
- nullable session note;
- nullable exercise-occurrence note;
- nullable set note.

This is small and non-architectural, but should not be forgotten.

---

## P2-06 — Session duration definition is still ambiguous

User Journey shows duration prominently.

Domain says no pause model and warns against overinterpreting wall-clock time.

Define initial M3 display:

> duration = terminal timestamp - explicit start timestamp

unless a later pause model is introduced.

No “active minutes” should be implied.

---

## P2-07 — Unilateral repetition/side semantics are not defined

Exercise Intelligence includes unilateral/bilateral character and load semantics handles one-dumbbell work.

But set semantics do not define whether a unilateral set's reps mean:
- reps per side;
- total alternating reps;
- one specific side.

This does not block the first generic logger if the UI avoids side-specific claims, but Exercise Intelligence/data UX should establish a convention before asymmetric unilateral tracking is advertised.

A future optional side dimension must not reinterpret old set counts.

---

# 7. Open workstreams correctly left open

## #115 — Exercise Intelligence

Not a blocker for free-workout persistence.

Required for M3 feature completeness of:
- execution guidance;
- cues/common mistakes;
- richer movement metadata;
- high-quality substitution experience.

Prioritize exercises used by initial curated plans.

## #116 — Sensitive readiness / menstrual-context privacy

Correctly gated.

Initial M3 must not persist:
- cycle dates;
- phase estimates;
- contraception status;
- detailed cycle-specific symptoms

until #116 is approved.

Generic readiness can be designed separately under data minimization.

## Advanced Decision Engine / Laya

Still correctly deferred behind deterministic baselines and evaluation.

No issue found with that boundary.

---

# 8. Implementation-readiness by slice

## Slice A — Canonical exercise identity / #89

**Status: DO NOW**

This is an early data dependency and can proceed independently.

---

## Slice B — Generic offline/outbox infrastructure

**Status: MOSTLY READY**

The generic concepts are strong:
- mutation IDs;
- idempotency;
- retries;
- causal dependencies;
- optimistic concurrency;
- tombstones;
- account partitioning.

Before freezing domain mutation schemas, reconcile N-P1-01 and add the cross-entity dependency example from P2-03.

---

## Slice C — Free workout + session/set persistence

**Status: NOT YET READY TO FREEZE**

Must first close:
- N-P1-01 authority contradictions;
- N-P1-02 optional Training Intent/cold start;
- N-P1-03 server-side account-deletion policy;
- N-P1-04 exercise-occurrence pre-first-set lifecycle;
- #89 canonical identity dependency.

After those, this slice can move before advanced plans/AI.

- G4 local sign-out failure-path fix and tests before enabling offline continuity;

---

## Slice D — Machine-aware recording

**Status: SEMANTICALLY READY**

Machine/Profile/Configuration/load semantics are strong.

Depends on the generic workout schema and account deletion policy.

---

## Slice E — Plans/templates/planned sessions

**Status: NOT YET READY TO FREEZE**

In addition to Slice C:
- reconcile plan progression semantics;
- close durable adaptation/completion provenance (N-P1-05);
- define Training Profile persistence;
- choose plan/profile CRUD API details.

---

## Slice F — Time/substitution adaptation

**Status: DOMAIN READY, PERSISTENCE PROVENANCE NOT READY**

Decision candidates and UX are coherent.

Requires N-P1-05 so accepted adaptations remain reconstructable.

---

## Slice G — Fatigue/recovery engine

**Status: NOT READY**

Requires:
- generic readiness/session-context persistence (G1);
- exact evidence windows/threshold implementation design;
- decision trace storage for material recommendations;
- #116 if sensitive cycle data is ever involved.

---

## Slice H — Exercise Intelligence content

**Status: READY TO PROCEED IN PARALLEL**

Proceed under #115 after/with #89.

---

# 9. Recommended remediation pass 2

Keep it small and dependency-focused.

## R2-01 — Authority reconciliation II

Patch existing accepted docs only; no new product discovery.

Update:
- Training Goal Policies;
- Workout Domain;
- Decision Engine;
- Workout Sync;
- Product Contract;
- User Journey;
- PROJECT_STATE.

Resolve:
- canonical Training Intent terminology;
- qualifying WORKING completion;
- Plan Step coverage vs sequence advancement;
- Set Draft vs WorkoutSet PENDING;
- minimum SUPERSET status;
- stale unresolved lists;
- new parent authorities.

## R2-02 — Training Profile / Session Context amendment

Extend persistence authority with:
- optional Training Intent revision for cold-start/free workout;
- progressive Training Profile/preferences;
- generic readiness/session-context ownership;
- explicit separation from sensitive #116 data.

## R2-03 — M3 server deletion/retention contract

Define account-deletion behavior for every new M3 server entity before migrations.

## R2-04 — Exercise occurrence + adaptation provenance amendment

Close:
- pre-first-set occurrence lifecycle;
- durable final/adapted agenda or adaptation-event representation;
- finish mutation/sync requirements.

## R2-05 — Complete #89

Implement/approve canonical exercise alias representation before workout history is treated as production-stable.

## R2-06 — Small P2 cleanup

- notes scope;
- wall-clock duration definition;
- cross-entity outbox test;
- catalogue bootstrap choice;
- unilateral convention.

## R2-07 — M1 logout error-path implementation guard

Before deploying M3 offline continuity, fix the M1 mobile sign-out error path so local access ends even if provider sign-out fails, and add regression tests for network failure, unsynced outbox preservation, and account switch isolation (G4).

---

# 10. Can #105 close?

**Not yet.**

The first audit's remediation solved most of the architecture, but several prior P1s remain only partially closed because accepted older authorities were not reconciled.

Close #105 only after:
- R2-01 through R2-04 are accepted;
- #89 has a canonicalization representation suitable for workout history;
- a short final audit reports no schema-blocking contradictions.

---

# 11. Final conclusion

M3 is in a much stronger position than before the first audit.

The difficult architectural choices are largely made correctly.

The remaining work is now **small, concrete and implementation-adjacent**, not broad product discovery.

The biggest mistake at this point would be to treat the presence of the new persistence contract as proof that every older accepted authority automatically updated itself.

It did not.

One more focused reconciliation/data-ownership pass is required.

After that, the basic free-workout/offline-recording vertical slice should be safe to turn into real PostgreSQL, SQLite, FastAPI and mobile implementation work.
