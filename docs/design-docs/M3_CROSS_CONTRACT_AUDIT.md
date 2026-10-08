# M3 Cross-Contract Audit

**Status:** Audit complete — remediation required before final SQL/API implementation backlog  
**Audit issue:** #105  
**Audited main:** `c66ac18a6a3984f566877b6aa7c4f7c970c408cf`  
**Date:** 2026-10-08

## 1. Executive verdict

The M3 design is **conceptually coherent and worth preserving**.

The audit found no P0 flaw requiring a redesign of the product vision, workout hierarchy, equipment-aware philosophy, offline-first strategy or decision-engine architecture.

However, M3 is **not yet ready for independent agents to derive final SQL tables and API mutations directly from the current documents**.

The remaining risk is concentrated at the seams between otherwise sound contracts:

- goal/intent representation;
- session completion versus plan fulfillment;
- local/offline read models;
- machine-profile persistence;
- draft versus performed-set lifecycle;
- immutable version/snapshot strategy;
- identity/privacy lifecycle;
- execution-group/superset representation.

These are precisely the decisions that can become expensive migrations or sync bugs if implementation guesses them.

### Readiness decision

- **Ready now:** create remediation/design-closure work.
- **Ready conditionally:** implement deliberately scoped slices whose required contracts are already closed and which do not depend on an unresolved finding.
- **Not ready yet:** freeze cross-domain PostgreSQL/API/SQLite schemas or assign implementation work that depends on the unresolved P1 decisions.
- **After dependency-relevant P1 closure:** derive each implementation slice from the contracts it actually depends on.

The basic free-workout/session-set slice must not be blocked by unrelated advanced-plan or superset questions, consistent with the accepted Product Contract.

---

## 2. Audit scope

Reviewed as one system:

- `M3_WORKOUT_ENGINE_PRODUCT_CONTRACT.md`
- `M3_TRAINING_GOAL_POLICIES.md`
- `M3_EXERCISE_AND_EQUIPMENT_CONTRACT.md`
- `M3_WORKOUT_DOMAIN_CONTRACT.md`
- `M3_DECISION_ENGINE_CONTRACT.md`
- `M3_WORKOUT_SYNC_CONTRACT.md`
- `M3_USER_JOURNEY.md`
- `PRODUCT_VISION.md`
- `MVP.md`
- `TECHNICAL_BLUEPRINT.md`
- ADR-003
- M1 identity/deletion contract
- `PROJECT_STATE.md`
- open catalogue follow-up #89
- design-doc rules in `docs/design-docs/README.md`

The audit looked for:

- direct contradictions;
- terminology drift;
- impossible state combinations;
- missing ownership/identity;
- schema-critical unresolved decisions;
- offline/security/privacy seams;
- accepted UX that lacks a domain representation;
- stale top-level authority;
- acceptance-scenario gaps.

---

# 3. P1 — Must resolve before final SQL/API implementation

## P1-01 — Goal model has overlapping dimensions

### Evidence

The Product Contract correctly separates Training Goal from Body Goal, but later gives:

- “primary fat loss, secondary strength preservation”.

Training Goal Policies then introduces:

- `primary_user_outcome = FAT_LOSS`;
- `primary_training_policy = STRENGTH`;
- body-goal modifier `FAT_LOSS`.

Workout Domain persists conceptually both:

- primary user outcome;
- body-goal modifier;

and its example sets both to `FAT_LOSS`.

Decision Engine consumes both again.

### Risk

The persistence model could end up storing the same concept twice with unclear authority.

Questions become undefined:

- Can `primary_user_outcome` disagree with `body_goal`?
- Is it a third enum?
- Is it a derived label?
- Is it an explicit target system?
- Which one is historical/versioned?

### Required correction

Preserve the accepted distinction between **what outcome is primary overall** and **which training policy governs workout decisions**, but do not duplicate the same body-goal value in two competing fields.

Recommended M3 core representation:

- `primary_training_policy` — required;
- `secondary_training_policy` — optional;
- `body_goal` — optional / `UNSPECIFIED`;
- `primary_intent_dimension` (working name) — identifies whether the user's primary overall priority is the training-policy dimension or the body-goal dimension;
- experience/policy level;
- effective version/time.

Example:

`primary_training_policy = STRENGTH`  
`body_goal = FAT_LOSS`  
`primary_intent_dimension = BODY_GOAL`

This preserves the accepted meaning of “fat loss is my main outcome, while strength governs how I train” without storing `FAT_LOSS` twice under separate authorities.

If the product needs a richer `primary_user_outcome` taxonomy instead, that taxonomy must be explicitly defined before persistence.

Future measurable targets such as “bench 120 kg”, “90 kg bodyweight” or “4 sessions/week” should become a separate target concept rather than another overloaded goal enum.

Also correct Product Contract §3.2 so body goals are not shown as secondary training policies.

---

## P1-02 — Session completion and Plan Step fulfillment are conflated

### Evidence

Workout Domain correctly separates planned versus actual work, but says:

- finishing early can still advance the baseline plan sequence;
- a completed planned session provides a completed exposure against its Plan Step.

A session can currently be completed after minimal performed work.

Decision Engine separately says the next step may repeat/adjust based on actual work.

### Risk

“User finished logging” and “the planned stimulus was sufficiently covered” are different facts.

Without a separate plan-outcome concept, a user can:

1. start Upper A;
2. perform very little;
3. explicitly Finish;
4. have the plan sequence advance even though the training intent was barely covered.

This also makes later free-workout overlap and corrections harder to reason about.

### Required correction

Separate:

- **Session lifecycle:** ACTIVE / COMPLETED / CANCELLED.
- **Plan-step outcome/coverage:** conceptually something like SUFFICIENT / PARTIAL / NOT_COVERED / SUPERSEDED, with exact names still designable.

Finishing ends the actual session.

The Decision Engine determines the next recommendation from actual coverage/history.

Do not implement a blind mutable “next step cursor” that increments on every completed planned session until plan-progress semantics are defined.

---

## P1-03 — Completion eligibility is ambiguous around WARMUP versus WORKING

### Evidence

Workout Domain says:

> A completed session should contain at least one completed performance set.

But “performance set” is not a defined set type.

The same contract defines only:

- WARMUP;
- WORKING.

User Journey says:

> A session with at least one completed set may finish early and still be valid history.

### Risk

A warm-up-only session could become a completed workout, advance plan state and later count as attendance.

### Required correction / Product Owner decision required

The accepted contracts conflict here, so this cannot be silently “fixed” by implementation.

Two coherent choices exist:

**Option A — any completed performed set permits session completion**
- preserves the current User Journey wording;
- allows warm-up-only sessions to become `COMPLETED`;
- downstream plan/attendance logic must then decide whether that completion has meaningful coverage/qualification.

**Option B — at least one qualifying working/performance set is required**
- makes `COMPLETED` mean actual training beyond warm-up;
- avoids warm-up-only sessions appearing as completed workouts;
- changes the currently accepted User Journey behavior.

**Audit recommendation:** Option B for ordinary resistance-training sessions, while keeping future modality-specific qualifying set classes extensible.

This choice must be explicitly accepted in the Persistence/Data Model Contract before implementation.

Attendance qualification remains a separate future derived rule and may be stricter than session completion.

---

## P1-04 — Offline read model is missing

### Evidence

Product Contract requires users to:

- start/continue a workout;
- add exercises;
- record/edit/remove sets;

without a server round trip.

User Journey starts sessions locally with no round trip.

Current M2 catalogue is API/PostgreSQL-backed.

User Journey only guarantees survival when “active session data is local”.

Sync Contract defines mutation/outbox semantics but does not define the local read data needed before or during a workout.

### Risk

An implementation could be perfectly offline-first for set writes while still being unable to:

- open the next planned workout after a cold offline launch;
- add a new exercise while offline;
- resolve exercise metadata/load semantics;
- access the machine/history data needed to log correctly.

That would violate the accepted product promise while technically satisfying the outbox contract.

### Required correction

Define an M3 local read model/cache with at least the data required to train offline:

- minimum canonical exercise catalogue identity/search data;
- measurement/load semantics needed for logging;
- active plan and relevant template/prescription data;
- current/next proposal source or enough data to reconstruct it;
- active agenda;
- recent comparable performance needed for core UX where available;
- relevant machine profiles.

Exercise media/long-form instructions may remain best-effort/online if logging still works.

---

## P1-05 — Machine Profile / Gym Context persistence and synchronization are undefined

### Evidence

Exercise & Equipment Contract makes Machine Profile a first-class reusable concept.

User Journey depends on:

- known machine profiles;
- last same-machine performance;
- native units;
- selectable loads;
- new-machine creation.

Workout sets may reference machine context.

Sync Contract does not explicitly define machine-profile identity, ownership, creation or dependency semantics.

### Risk

An offline-created set may reference a machine profile the server has never seen.

Independent agents could choose incompatible approaches:

- local-only profile IDs;
- embedded machine JSON per set;
- server profile first;
- nullable foreign keys;
- duplicated profiles per workout.

### Required correction

Before schema/API:

- machine profiles need stable client-generated IDs;
- user ownership/account partition;
- create/update/delete semantics;
- native unit/load-sequence ownership;
- offline creation;
- outbox dependency before a set references an unsynced profile;
- correction semantics;
- gym/context identity if persisted.

Historical sets must always retain enough original machine/load information even if the reusable profile later changes.

---

## P1-06 — `WorkoutSet.PENDING` crosses Domain and Sync ambiguously

### Evidence

Workout Domain defines:

- PENDING — local/active set row or editor state;
- COMPLETED — performed work.

Only COMPLETED counts.

Sync Contract models semantic mutations such as create/complete set, but does not state whether PENDING sets are remote domain entities.

### Risk

Two very different schemas are both compatible with current wording:

1. create WorkoutSet early, sync it as PENDING, later complete it;
2. keep a local draft/editor row and only create authoritative WorkoutSet when performed.

This affects:

- IDs;
- restart recovery;
- analytics filtering;
- mutation count;
- conflict handling;
- orphan/abandoned rows.

### Required correction

Choose explicitly.

Recommended M3 model:

- pending input is local active-workout draft/agenda state;
- authoritative `WorkoutSet` represents performed work and is created/marked completed atomically on user confirmation;
- pending row state survives restart locally but is not historical performed data.

If a persisted remote PENDING set is preferred instead, define its lifecycle and cleanup explicitly.

---

## P1-07 — Plan/template/prescription snapshot strategy is still unresolved

### Evidence

Workout Domain requires provenance such as:

- plan ID/version;
- template ID/version;
- initial proposal/prescription;
- Training Intent snapshot.

It also says editing templates/plans never rewrites history.

But the exact revision/snapshot strategy is explicitly unresolved.

### Risk

This is not merely an implementation detail.

Schema/API design depends on whether history points to:

- mutable rows plus copied snapshots;
- immutable plan/template versions;
- event/revision tables;
- a hybrid.

Without a decision, past sessions can become unreproducible or over-normalized.

### Required correction

Before SQL, define:

- plan instance/version semantics;
- template revision semantics;
- what is copied into the session at Start;
- Training Intent snapshot/reference;
- target/prescription snapshot at exercise/set level where explanations need it;
- what remains a live reference versus immutable historical snapshot.

A simple immutable-version + session snapshot approach is preferable to hidden mutable references.

---

## P1-08 — M3 local account lifecycle does not fully join M1 identity semantics

### Evidence

Sync Contract now correctly partitions local workout/outbox state by authenticated subject and prevents account-A mutations being sent as account B.

M1 account deletion currently ends with:

> mobile clears its local session and returns signed out.

M3 introduces durable SQLite workout/outbox partitions that did not exist in M1.

M1 refresh also does not explicitly define the M3 case where access-token refresh cannot occur because the device is offline.

### Risk

Two gaps remain:

1. **Account deletion:** deleted-user workout/outbox data could remain locally after confirmed deletion.
2. **Offline authentication continuity:** an implementation may incorrectly force sign-out and block an active local workout merely because token refresh cannot reach Supabase.

### Required correction

Extend the identity/workout contract:

- confirmed account deletion purges the deleted subject's local workout/outbox/machine/profile partition;
- deletion must not leave queued mutations that can later sync;
- sign-out/account switch may preserve partitioned unsynced data but must hide it from other users;
- temporary offline refresh failure is not the same as revoked/invalid identity;
- a previously authenticated subject may continue **local-only** workout operations while identity is locally established and no definitive revocation/deletion is known;
- remote protected operations remain blocked until a valid token is available;
- explicit sign-out/deletion terminates that local access.

Security review required before implementation.

---

## P1-09 — Superset is accepted behavior without a minimum domain representation

### Evidence

Superset behavior appears in:

- Product Contract time adaptation;
- Training Goal Policies;
- Decision Engine candidate `CREATE_COMPATIBLE_SUPERSET`;
- User Journey accepted time-adaptation examples.

Workout Domain correctly says a superset is not a set type, but leaves the exact execution-group taxonomy provisional.

### Risk

SQL/mobile agents cannot implement an accepted Decision Engine action without inventing:

- grouping identity;
- member order;
- whether the group is template intent, agenda state or actual-history structure;
- how rest targets behave.

### Required correction

Either:

**A. Define a minimal M3 execution group now**, e.g.:
- group ID;
- type = SUPERSET;
- ordered agenda/template item membership;
- optional group rest rule;

or:

**B. Remove automatic superset creation from initial M3 and leave only manual sequential exercise reordering until the model exists.**

Do not leave an accepted runtime action with no representable state.

---

# 4. P2 — Should fix before backlog finalization / first implementation wave

## P2-01 — Top-level Product Vision contains stale contradictions

### Stale statements

`PRODUCT_VISION.md` still says:

- a custom exercise can represent a specific machine at the gym;
- conceptual set field `weight_kg`;
- M6 “Robust offline sync” owns conflict behavior and retry/idempotency.

Accepted M3 contracts now say:

- machine = Machine Profile, not custom exercise;
- preserve original load value + native unit + load semantics;
- M3 already owns idempotency, conflicts, tombstones and safe manual conflict handling; M6 matures them.

### Correction

Update Product Vision and Technical Blueprint examples so agents do not implement from stale top-level guidance.

---

## P2-02 — Product Contract's “unresolved” list is now partially stale

Examples already resolved downstream include:

- one active workout;
- session state machine;
- cancel semantics;
- baseline set types;
- workout sync/conflict principles.

The list still presents them as unresolved.

### Correction

Replace with a status table:

- resolved by downstream contract;
- partially resolved;
- still intentionally open.

Also correct §3.2 goal examples per P1-01.

---

## P2-03 — #89 alias/collision work should move ahead of real workout-history accumulation

Issue #89 still says it is not an M3 blocker.

The accepted Exercise Contract says it should be handled early M3.

### Risk

If true aliases begin accumulating workout history under separate IDs, later canonicalization requires migration/backfill/redirect logic unnecessarily.

### Correction

Make #89 one of the first M3 data tasks, ideally before production workout-set persistence or before freezing the M3 catalogue snapshot used by history.

---

## P2-04 — Custom-exercise scope is inconsistent/ambiguous

- MVP says users can create private/custom exercises “where supported”.
- PROJECT_STATE lists custom exercises as deferred.
- Exercise Contract defines future semantics but says exact lifecycle belongs later.
- User Journey does not include creation.

### Correction

Make an explicit M3 scope decision:

- **defer:** remove it from M3 acceptance and keep “missing movement” as known limitation; or
- **include:** define user-owned exercise identity, measurement/load semantics, offline/sync lifecycle and plan usage.

Do not let implementation decide opportunistically.

---

## P2-05 — Distance/time unit semantics are under-specified

M2 supports `distance`.

M3 thoroughly defines kg/lb mass semantics but not:

- entered distance unit;
- canonical storage;
- km/m/mi display;
- machine-native distance where relevant.

### Correction

Define measurement-unit contract for:

- distance;
- duration;
- decimal precision/validation.

This belongs in the persistence/API closure before schema constraints.

---

## P2-06 — Timezone/local-day semantics are missing

M3 uses:

- “today”;
- rest day;
- session start/finish;
- future weekly attendance;
- goal/plan effective periods.

No accepted contract defines:

- UTC persistence;
- captured local offset/timezone;
- which timezone determines “today”.

### Correction

Define timestamp semantics before SQL/API.

Recommended baseline:

- authoritative timestamps in UTC;
- preserve relevant local offset/timezone context for session/local-day presentation and later analytics;
- “today” uses the user's current product/device timezone with explicit handling for travel.

---

## P2-07 — Boundary between exercise variant and machine configuration needs one explicit rule

Exercise Contract correctly distinguishes canonical exercise and machine context, but Machine Configuration may include attachments/output paths.

Some changes can cross from “same exercise, different config” into a genuinely different movement/variant.

### Correction

Add a rule:

> If the change materially alters the semantic movement pattern, intended technique or canonical performance identity, use a distinct canonical exercise/variant. Machine Configuration only describes equipment setup within that semantic exercise.

This prevents future analytics from hiding a real exercise change inside machine metadata.

---

## P2-08 — Menstrual/symptom context needs an implementation gate

Product Contract correctly requires opt-in/minimal/deletable handling and a privacy review.

No dedicated persistence/privacy contract exists.

### Correction

Before any cycle/symptom data is stored/synced:

- dedicated privacy/security review;
- exact fields;
- retention/deletion/export;
- local partition/deletion behavior;
- server access controls.

If this review is not part of initial M3 implementation, explicitly defer persistent cycle tracking and use only non-sensitive generic readiness inputs.

---

## P2-09 — PROJECT_STATE is stale

It still reports:

- current milestone = M2 complete;
- M3 has not begun;
- last updated 2026-10-05.

Seven accepted M3 design contracts are now merged.

### Correction

Update PROJECT_STATE after audit/remediation so future agents start from the correct M3 state.

---

## P2-10 — User Journey acceptance suite misses several cross-contract edge cases

Add scenarios for:

1. user A has unsynced workout -> signs out -> user B signs in;
2. account deletion with local workout/outbox data;
3. offline cold launch while access token cannot refresh but prior local identity is valid;
4. planned workout cold-start offline with required plan/catalogue data cached;
5. free workout offline -> add a new catalogue exercise;
6. attempt to finish after only WARMUP sets;
7. machine profile created offline then referenced by a set;
8. machine profile corrected after historical use;
9. free workout Save as Template while offline/network unavailable.

These scenarios will expose implementation mistakes earlier than unit tests.

---

## P2-11 — Exercise Intelligence content is accepted UX but not yet an owned M3 workstream

User Journey promises “How to perform” with:

- setup;
- execution;
- cues;
- common mistakes;
- media where available.

M2 currently has a text-only catalogue without the translated instruction bodies promised by M3.

### Correction

Create an explicit M3 Exercise Intelligence content/curation workstream with:

- field contract;
- EN/ES content;
- provenance/license review;
- quality acceptance;
- fallback behavior for exercises not yet enriched.

---

## P2-12 — Clarify offline scope for templates and cross-device active-session continuity

User Journey offers Save as Template after a free workout.

Sync Contract defers broad offline plan/template authoring to M6.

Also, M3 handles multi-device conflicts but never promises seamless handoff of the same active workout between devices.

### Correction

Explicitly state:

- whether Save as Template requires network in M3 or gets a local queued creation;
- same-device active-workout restart is guaranteed;
- seamless cross-device active-session continuation is **not** an M3 guarantee unless agenda/adaptation sync is explicitly designed.

---

# 5. P3 — Safe to defer if guardrails remain

The following open questions are not implementation blockers for the first M3 vertical slice:

1. exact fatigue scoring/windows and deload percentages;
2. Laya adoption, checkpoint, hosting and scoring weights;
3. premium/free packaging and pricing;
4. global shared gym-machine catalogue / automatic equipment recognition;
5. advanced M6 automatic multi-device merge, batching and background optimization;
6. pixel-perfect layout, animation and rest-notification polish;
7. M4/M5 PR, e1RM, volume and muscle-ranking formulas;
8. advanced techniques such as drop sets, myo-reps, rest-pause, top/back-off roles and circuits **provided initial curated M3 plans do not depend on them**.

If a v1 curated plan needs one of these advanced constructs, it stops being P3 and must be modeled before that plan ships.

---

# 6. Documentation integrity findings

## 6.1 Authority hierarchy is mostly sound

The accepted M3 contracts consistently preserve:

- actual workout source of truth;
- user control;
- domain-before-model decisions;
- equipment-aware semantics;
- local-first recording;
- explicit sync correctness.

No accepted ADR is silently reversed.

## 6.2 Specific contracts are ahead of top-level context

The main documentation risk is not that M3 contracts disagree with one another broadly.

It is that `PRODUCT_VISION.md`, `PROJECT_STATE.md` and a few older conceptual examples have not been fully reconciled after the more precise M3 decisions.

Those top-level documents are commonly read first by agents, so they must be updated rather than relying on people to infer that the narrower contract wins.

---

# 7. External evidence spot-check

A spot-check of the externally cited foundation found no material evidence-integrity problem.

The central cited research/model references used by M3 align with their stated roles:

- ACSM 2026 resistance-training position stand exists and supports the broad strength/hypertrophy prescription framing used by the policy contract.
- The 2026 volume/frequency meta-regression reports positive volume relationships with diminishing returns and a clearer frequency relationship for strength than hypertrophy.
- The 2024 proximity-to-failure meta-regression supports the contract's distinction between hypertrophy and strength.
- The cited 2026 non-failure meta-analysis supports the rule that failure is not universally required.
- The deload survey and controlled one-week cessation trial support the contract's deliberately conservative deload language.
- Current Laya model documentation continues to describe a non-autoregressive typed-decision model, with 421M English and 322M multilingual checkpoints and Apache-2.0 model licensing; the TypeScript/ONNX wrapper is MIT.
- The Decision Engine correctly refuses to treat vendor/model probability calibration as automatically calibrated KeylorForge product confidence.

No product rule needs to be changed from this evidence spot-check.

---

# 8. Recommended remediation sequence

Do **not** create dozens of coding tickets yet.

Recommended next sequence:

### R1 — Reconcile authority docs

Patch:

- Product Contract goal wording + resolved/open table;
- Product Vision machine/load/offline wording;
- PROJECT_STATE.

### R2 — Resolve the domain blockers

Create one focused **M3 Persistence / Data Model Contract** covering:

- canonical Training Intent fields;
- plan/template/version snapshots;
- Plan Step outcome/coverage;
- session completion qualification;
- pending-set/draft semantics;
- machine profile/gym identity;
- minimum superset execution group;
- units/timestamps;
- custom-exercise scope decision.

### R3 — Resolve local/offline read + identity boundary

Add to the data/sync/identity contracts:

- local catalogue/plan/machine read model;
- account-deletion local purge;
- offline-auth continuity;
- machine-profile outbox dependencies;
- template offline scope.

### R4 — Close early catalogue/content dependencies

- execute #89 before real workout-history accumulation;
- create Exercise Intelligence enrichment work.

### R5 — Extend acceptance scenarios

Add the missing scenarios from P2-10.

### R6 — Independent re-audit

Re-run this audit against the amended contracts.

Freeze schemas/contracts **per implementation slice**, only after that slice's dependency-relevant P1 findings are closed.

For example, a deliberately scoped free-workout/session-set slice need not wait for plan-step coverage or superset representation if those features are excluded from that slice.

However, do not freeze a cross-domain schema/API that implicitly commits to unresolved P1 semantics.

Relevant artifacts include:

- PostgreSQL/Alembic portions touched by the slice;
- FastAPI mutation contracts touched by the slice;
- Expo SQLite/outbox portions touched by the slice;
- implementation issues for that slice.

---

# 9. Suggested implementation dependency order after remediation

Once the P1 issues are closed:

1. M3 data/persistence contract + schema migration;
2. canonical/local exercise read model and #89 curation;
3. machine profile + Training Intent + plan/template persistence;
4. local active-workout SQLite model;
5. outbox/idempotent workout API;
6. basic free-workout recording vertical slice;
7. planned workout / agenda snapshot;
8. set/rest live UX;
9. offline/restart acceptance;
10. equipment-aware load semantics;
11. deterministic Decision Engine baseline;
12. time/substitution adaptation;
13. fatigue/recovery recommendations;
14. optional Laya evaluation only after deterministic baseline;
15. full physical-device/E2E M3 exit.

---

# 10. Final audit conclusion

M3 has a strong product architecture.

The major decisions are internally aligned:

- plan intent and actual history are separated;
- the user remains in control;
- free workouts are first-class;
- machine loads are treated honestly;
- recommendations are bounded/explainable;
- offline writes are designed correctly;
- sync avoids duplicate/silent-loss behavior;
- future analytics have a defensible raw-data foundation.

The remaining problems are **closure problems, not vision problems**.

The correct next move is not to redesign M3 and not to start coding blindly.

The correct next move is to close the P1 seams in one persistence/data-model pass, reconcile stale authority documents, then derive the implementation backlog from that corrected snapshot.
