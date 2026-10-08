# M3 Workout Domain Contract

**Status:** Accepted by Product Owner  
**Milestone:** M3 — Workout Engine  
**Issue:** #97  
**Parent authorities:** `M3_WORKOUT_ENGINE_PRODUCT_CONTRACT.md`, `M3_TRAINING_GOAL_POLICIES.md`, `M3_EXERCISE_AND_EQUIPMENT_CONTRACT.md`, ADR-003  
**Date:** 2026-10-07  
**Product Owner approval:** 2026-10-08

## 1. Purpose

This contract defines the conceptual workout domain that M3 must implement before SQL tables, API mutations or synchronization behavior are finalized.

The core distinction is:

> Planning describes what should happen. Workout history records what actually happened.

M3 must support adaptation without allowing forward-looking recommendations to rewrite performed work.

The authoritative historical hierarchy remains conceptually:

`Actual Workout Session -> Workout Exercise Occurrences -> Workout Sets`

Plans, templates, proposals, recommendations and active-session agenda state may influence this hierarchy, but do not replace it.

---

## 2. Domain invariants

The following are product/domain invariants.

1. **Actual performed work is authoritative.**
2. **Plans/templates/proposals never retroactively rewrite actual history.**
3. **Completed sets may be corrected by the user, but not silently rewritten by the engine.**
4. **In-session adaptation changes remaining intent, not completed work.**
5. **Planned, adapted, template-based and free workouts all produce the same Actual Workout model.**
6. **Only completed sets count as performed training work.**
7. **Closing/restarting the app does not finish, cancel or pause a workout automatically.**
8. **M3 permits at most one logical active workout session per user.**
9. **Equipment/machine context must be resolvable for every completed set when material.**
10. **A different machine is context, not automatically a different canonical exercise.**
11. **Changing goals/plans later must not change the historical meaning of past sessions.**
12. **A cancelled session is different from a completed session that ended earlier than planned.**

---

## 3. Training Intent

M3 needs to preserve the context under which a workout was prescribed/performed.

A current Training Intent conceptually includes:

- a required `primary_training_policy` for any existing Training Intent revision;
- optional `secondary_training_policy`;
- optional `body_goal` (null means not specified);
- `primary_intent_dimension = TRAINING_POLICY | BODY_GOAL`, expressing the overall priority dimension without a duplicate outcome field;
- experience/policy level where configured;
- effective period and immutable historical revision identity.

If `primary_intent_dimension = BODY_GOAL`, the `body_goal` must be non-null. The accepted persistence authority is `M3_PERSISTENCE_AND_DATA_MODEL_CONTRACT.md`; its Training Intent entity must not be confused with a separate, not-yet-designed Training Profile (R2-02).

Example:

`primary_training_policy = STRENGTH`  
`body_goal = FAT_LOSS`  
`primary_intent_dimension = BODY_GOAL`

### Historical rule

Training Intent must be historically preservable.

If the user later changes from hypertrophy to strength, old workouts must not be reinterpreted as if they had been prescribed under the new goal.

### Session snapshot

When an Actual Workout Session starts, it should retain a snapshot/reference sufficient to know the policy/body-goal context active at that time.

Accepted persistence requires versioned Training Intent revisions with stable historical meaning. Session provenance retains the applicable revision/snapshot when one exists; the exact SQL/SQLite representation remains implementation design. Whether and how a new user may begin a Free Workout before configuring Training Intent is a separate R2-02 cold-start schema gate.

---

## 4. Training Plan

A Training Plan expresses medium-term training strategy.

It is not a completed workout and not a calendar event.

A plan may contain:

- an ordered sequence of plan steps/session definitions;
- references to Workout Templates;
- intended training-policy context;
- recommended frequency;
- preferred days as hints;
- progression/recovery intent.

### 4.1 Sequence, not prison-calendar

M3 plans are primarily ordered sequences rather than rigid weekday bindings.

Example:

`Upper A -> Lower A -> Upper B -> Lower B`

Preferred weekdays may exist, but Tuesday does not become “Lower A” merely because Monday was missed.

### 4.2 Plan Step

A Plan Step is the plan-level intent for one recurring/session position.

It may reference a template plus plan-specific priority/prescription metadata.

A Plan Step is not an Actual Workout Session.

### 4.3 Plan lifecycle

Conceptual M3 states:

- `DRAFT`
- `ACTIVE`
- `COMPLETED` where a finite plan has ended
- `ARCHIVED`

M3 should support **one primary active Training Plan per user**.

The user may retain other saved/draft/archived plans.

Multiple simultaneously coordinated active plans are future work unless explicitly revisited.

### 4.4 Curated-plan versioning

Selecting a curated plan must not make the user's active plan silently mutate when the global curated source is later edited.

The user's plan instance should preserve enough source/version information to remain reproducible.

### 4.5 Editing an active plan

The user may modify future plan structure.

Edits may affect future proposals.

They must not retroactively alter:

- completed sessions;
- completed sets;
- the prescription context already snapshotted into prior sessions.

---

## 5. Workout Template

A Workout Template is a reusable workout definition.

Examples:

- Push;
- Pull;
- Upper A;
- a user-created session;
- a curated plan session.

A template may define:

- ordered exercise intents;
- target sets;
- target rep/time/distance ranges;
- effort targets;
- rest targets;
- priority;
- optional grouping/superset intent;
- preferred equipment context where useful.

A template is not historical training data.

### 5.1 Template sources

Conceptually:

- curated/system;
- user-owned/custom.

A user customizing a curated template must not edit the global curated asset for everyone.

### 5.2 Template edits

Editing a template changes future use only.

Past workouts retain their own prescription/actual snapshots.

### 5.3 Save free workout as template

Saving a completed free workout as a template creates a new reusable definition derived from its structure.

It does not turn the historical session itself into a mutable template.

---

## 6. Today’s Proposal

Today’s Proposal is the current recommendation for what the user should do now.

Inputs may include:

- active plan/next plan step;
- actual recent workout history;
- Training Goal Policy;
- body-goal context;
- available time;
- equipment;
- readiness/fatigue;
- user modifications.

### 6.1 Proposal is not history

A proposal can be:

- regenerated;
- shortened;
- substituted;
- rejected;
- abandoned.

None of those actions alone create training history.

### 6.2 Persistence

Today’s Proposal may be cached/persisted for UX continuity, but durable historical authority is not required merely because a proposal was shown.

### 6.3 Starting a workout

When the user chooses **Start**, the relevant proposal/prescription becomes the initial forward-looking agenda for an Actual Workout Session.

At that moment:

- a logical Actual Workout Session becomes `ACTIVE`;
- origin/provenance is captured;
- policy/goal context is snapshotted;
- the session timer begins;
- local persistence becomes authoritative for the active flow under ADR-003.

The proposal itself still does not become “performed work”.

---

## 7. Actual Workout Session

An Actual Workout Session is the real workout container.

All workout origins use this same domain model.

### 7.1 Origins

A session may originate from:

- a Training Plan step;
- a standalone Workout Template;
- a Free Workout.

“Adapted” is not a separate origin type.

Adaptation describes transformations made to planned/remaining intent.

### 7.2 Provenance

Where applicable, the session should preserve enough provenance to know:

- plan ID/version;
- plan step;
- template ID/version;
- initial proposal/prescription;
- whether/how the agenda was adapted;
- Training Intent snapshot;
- optional named gym/context.

Exact event/audit structure belongs in later contracts.

### 7.3 Session lifecycle

Conceptual M3 states:

- `ACTIVE`
- `COMPLETED`
- `CANCELLED`

No separate `PAUSED` state is required by this contract.

App background/termination does not imply pause.

### 7.4 One active session

At most one logical `ACTIVE` workout may exist for a user in M3.

Attempting to start another should require resolution of the existing session:

- continue;
- complete;
- cancel.

Multi-device offline races are a synchronization-conflict problem for the Workout Sync Contract.

### 7.5 Completion

A session becomes `COMPLETED` only from an explicit user completion action.

A normal M3 session may enter `COMPLETED` only after an explicit Finish action **and** at least one confirmed qualifying `WORKING` set. `WARMUP`-only work does not qualify. Future modalities may define additional qualifying roles through a reviewed policy; do not permanently hard-code `WORKING` as the only conceivable role.

An empty or warm-up-only session cannot become a normal completed gym visit.

### 7.6 Finishing early

A user may explicitly finish a workout before completing the initial agenda.

This is a valid `COMPLETED` workout **only when completion qualification is satisfied**; finishing early does not imply sufficient Plan Step coverage.

Performed work is preserved.

Unperformed planned work remains unperformed.

The engine may later account for incomplete intended stimulus.

### 7.7 Cancellation

Cancellation means:

> do not treat this session as completed training history.

If completed sets already exist, cancellation is destructive from the training-history perspective and should require an explicit user decision/warning.

The product should normally offer **Finish workout now** as the safer alternative when the user really trained but wants to stop early.

A cancelled session must not advance plan progress as if the prescribed workout was completed.

Exact payload retention/tombstone behavior belongs in the Workout Sync/data-retention design.

---

## 8. Active Session Agenda

An active workout needs a forward-looking representation of what remains to be done.

This contract calls that the **Active Session Agenda**.

It may contain:

- remaining exercise intents;
- target sets;
- target reps/time/distance;
- target load/recommendation;
- target RIR/RPE;
- rest targets;
- priority;
- grouping/superset intent;
- substitution relationships.

### 8.1 Agenda is mutable

The agenda may change because:

- time runs short;
- equipment is occupied;
- the user substitutes an exercise;
- performance is better/worse than expected;
- fatigue/recovery logic adjusts remaining work;
- the user manually changes it.

### 8.2 Completed work is not agenda

Once a set is completed, changing the remaining agenda must not rewrite that set.

### 8.3 Persistence

The active agenda must survive app restart sufficiently to resume the active workout coherently.

This is part of the local active-workout state required by ADR-003.

### 8.4 Completion snapshot

At session completion, the product **must** durably retain enough planned-versus-actual context to explain:

- the **immutable original session-start prescription**;
- the ordered accepted/applied material changes to remaining intent, including reason/source **only when actually known**;
- the immutable **final agenda snapshot** and per-item statuses, distinct from actual performed sets.

The proposed R2-04 contract `M3_EXERCISE_OCCURRENCE_AND_ADAPTATION_PROVENANCE_CONTRACT.md` (#125) selects **applied agenda-change records plus an immutable final-completion agenda snapshot**, persisted locally/synced to the server. No normal server `COMPLETED` transition can stand without the accepted qualifying WORKING set **and** matching durable final snapshot. Exact SQL/JSON representation remains implementation design. Rejected recommendations must not be recorded as accepted adaptations.

---

## 9. Workout Exercise Occurrence

A Workout Exercise Occurrence represents an exercise **with confirmed performed set work** inside an Actual Workout Session. Merely selecting/adding an exercise, opening a card or editing a Set Draft creates/updates an Active Session Agenda item or local editor state only, **not performed history**.

The authoritative occurrence is created **failure-atomically with its first explicitly confirmed WorkoutSet**, whether WARMUP or WORKING. An unperformed/removed agenda item must not create an authoritative empty historical occurrence; removing the last set also removes/retires the occurrence from performed history (with reviewed correction tombstone semantics). This does not weaken the separate WORKING-set requirement for completing a session.

It references:

- the canonical exercise actually performed;
- actual exercise order/position;
- default equipment/machine context where applicable;
- notes/context;
- provenance from an agenda item when relevant.

### 9.1 Planned exercise is not automatically actual

A proposal containing five exercises must not automatically create five “performed exercises” in history.

Unperformed intent belongs to the agenda/prescription context.

An exercise contributes to performed history only through actual completed set work.

### 9.2 Free-workout exercise

In Free Workout the user can directly **add an exercise agenda item/draft** without a plan or configured Training Intent. It becomes first-class actual workout history **only when the first performed set is confirmed**, at which time the occurrence and first set are created together. Removing an untouched selection produces no performed occurrence. An exercise's unperformed agenda status may remain in the final agenda snapshot without inflating history.

### 9.3 Substitution

When a prescribed exercise is substituted:

- actual history references the **exercise actually performed**;
- provenance may retain the originally intended exercise/agenda item;
- the system must not rewrite history to pretend the prescribed exercise was performed.

Example:

prescribed: Barbell Bench Press  
actual: Dumbbell Bench Press

History records Dumbbell Bench Press.

The original bench prescription remains provenance/context.

### 9.4 Exercise ordering

Actual order should be preservable because order can matter for later interpretation.

Superset/interleaving may require more than one simple linear display order. The minimum `ExecutionGroup(type = SUPERSET)` grouping identity and ordered agenda/template members are accepted; the final UI and broader circuit taxonomy remain provisional.

---

## 10. Equipment context per performed set

The Exercise & Equipment Contract requires machine context to be historically meaningful.

Therefore:

> every completed set must have a resolvable actual equipment/machine context when that context materially changes interpretation.

A Workout Exercise Occurrence may provide a default machine/equipment profile.

A set may inherit that default.

If the user changes machine/configuration during the same canonical exercise, the domain must preserve the change from the affected set onward.

Implementation may achieve this through:

- set-level equipment snapshot/override;
- or a new Workout Exercise Occurrence for the same canonical exercise.

The schema choice is deferred.

The resulting history must never make sets performed on different material machine contexts indistinguishable.

---

## 11. Workout Set

A Workout Set is the smallest authoritative performed-work unit in the resistance-training flow.

It belongs to exactly one Workout Exercise Occurrence.

### 11.1 Stable identity

A set requires client-stable identity suitable for offline-first creation and synchronization.

Exact UUID/idempotency rules belong in the Workout Sync Contract.

### 11.2 Set lifecycle

A **local Set Draft** contains editable/unconfirmed values in active-workout SQLite/UI state. It is not an authoritative `WorkoutSet`, does not count as performed work, and is not synchronized as a remote historical row. Saving a draft must not create remote `WorkoutSet.PENDING`.

Confirming performance atomically creates an authoritative `WorkoutSet` with a stable client ID and a corresponding outbox mutation; only confirmed performed sets count for volume, coverage and recommendations. Corrections/removals of performed sets are explicit version-protected domain mutations. The outbox's separate `PENDING` state refers to transport/mutation delivery, **not** set lifecycle.

### 11.3 Measurements

Depending on exercise semantics, an actual set may record:

- repetitions;
- duration;
- distance;
- original nominal load value;
- original load unit;
- load semantics;
- assistance/load direction where relevant;
- RIR;
- RPE;
- notes;
- set type;
- completion timestamp/order metadata.

Not every field applies to every exercise.

The old conceptual `weight_kg` field in Product Vision must not be interpreted as permission to discard the machine-native value/unit required by the Exercise & Equipment Contract.

### 11.4 Target versus actual

The actual set measurement and the target/recommendation are different data.

Where a set was performed against a prescription/recommendation, the domain should preserve enough target context to explain later:

> target: 80 kg × 8–10 @ RIR2  
> actual: 80 kg × 8 @ RIR0

Changing the plan later must not change what that set was originally attempting.

Exact target-snapshot storage belongs in implementation design.

### 11.5 RIR and RPE

Both remain optional effort measures.

M3 must not require every set to contain either.

The UI/policy may prefer one effort scale in a given flow.

The domain should not silently infer one exact value from the other.

---

## 12. Set types

Initial M3 set-type semantics should remain deliberately small.

### 12.1 Required semantic distinction

At minimum:

- `WARMUP`
- `WORKING`

Warm-up sets and working sets must remain distinguishable for progression/fatigue/analytics.

### 12.2 Do not overload set type

The following are different concepts and should not automatically become values in one flat `set_type` enum:

- **failure** — an effort/outcome condition (for example RIR 0), not inherently a set type;
- **top set / back-off set** — prescription roles;
- **drop set / myo-rep / rest-pause** — advanced execution techniques/structures;
- **superset** — relationship/grouping between exercise work, not a property of one isolated set.

Exact advanced modeling is provisional.

M3 must avoid an enum that mixes mutually different dimensions and becomes impossible to extend safely.

---

## 13. Corrections and historical authority

Workout history must be trustworthy but user-correctable.

### 13.1 Engine protection

The recommendation/adaptation engine may never silently change:

- a completed set's actual reps;
- actual load;
- actual machine;
- actual RIR/RPE;
- actual exercise;
- a completed session's performed work.

### 13.2 Explicit user correction

The user may explicitly correct mistakes, including where supported:

- set load;
- reps/time/distance;
- effort;
- set type;
- machine context;
- accidental set removal;
- forgotten set/exercise addition;
- session notes.

A correction changes the current authoritative historical record.

Derived analytics must later recompute from corrected raw data.

### 13.3 Completed-session correction

Completing a session does not permanently lock it against user correction.

It does, however, lock it against automatic plan/engine rewrites.

### 13.4 Correction that removes the final qualifying WORKING set

A `COMPLETED` session must retain at least one completed qualifying `WORKING` set under the initial M3 qualification policy.

If a correction removes **or reclassifies** the last qualifying `WORKING` set, even when completed `WARMUP` sets remain:

- the session may not remain `COMPLETED`;
- warn that correcting this performed work invalidates ordinary completion, and obtain explicit user confirmation for the destructive effect;
- atomically transition to the approved cancelled/discarded-training semantics with the correction;
- recompute/reverse Plan Step coverage and all completion-derived effects;
- never silently rewrite other performed sets.

The precise mutation packaging is governed by Sync and Persistence contracts. A `WARMUP`-only completed session is invalid just as an empty completed session is invalid. If the removed set was also the only performed set attached to an occurrence, that occurrence is simultaneously retired from performed history; any historical finish/final-agenda snapshot correction must remain explicit and versioned under the proposed R2-04 semantics.

### 13.5 Revision/audit

The implementation retains mutation/revision semantics sufficient for offline sync correctness, safe conflict detection and debugging. A user-visible full revision history is not required in M3. Deletion, tombstone and conflict behavior belongs to the Workout Sync Contract.

---

## 14. Plan progress and workout completion

The plan must not advance merely because a proposal was shown, a workout started, or a planned-origin session was marked `COMPLETED`.

### 14.1 Session lifecycle versus Plan Step coverage

The session state (`ACTIVE / COMPLETED / CANCELLED`) describes whether the real workout ended. Plan Step coverage (`SUFFICIENT / PARTIAL / NOT_COVERED / NOT_EVALUATED`) describes how much intended stimulus was fulfilled. A `COMPLETED` session can have `PARTIAL` or `NOT_COVERED` coverage.

Source plan, immutable plan revision and stable logical `plan_step_id` are preserved where applicable. The Decision Engine computes the next proposal from actual completed work, source step, coverage, free/out-of-order work and relevant recovery/context. **Never implement** `completed -> current_step += 1`.

### 14.2 Finishing early

Finishing early can end a valid workout with qualifying work, but cannot itself grant sufficient Plan Step coverage or force an increment. The next recommendation may repeat, adapt or move forward based on evidence.

### 14.3 Cancelled session

A cancelled session does not receive completed-workout credit or advance Plan Step coverage as if the prescription was fulfilled.

### 14.4 Free workout

A free workout does not automatically mark a Plan Step as covered because muscles overlap. It may influence the next proposal. Any explicit future action to treat Free work as covering a Plan Step must be explained and user-controlled.

### 14.5 Out-of-sequence plan workout

An explicitly selected alternative Plan Step retains its stable logical and revision-specific IDs. The next recommendation depends on actual history and derived coverage, not a weekday index.

---

## 15. Rest timer

The basic rest timer belongs to the active-workout experience.

Conceptually distinguish:

- **target rest** — prescription/agenda intent;
- **timer runtime state** — current local countdown/timestamps;
- **actual rest duration** — potentially useful future historical data.

M3 does not require actual rest duration to become authoritative history.

### Restart behavior

If a rest timer is active when the app closes/restarts, it should be reconstructable from persisted timing state when practical.

App background must not automatically mean “pause rest”.

Exact timer pause/notification behavior belongs in the User Journey/mobile implementation.

---

## 16. Supersets and execution groups

Supersets are a relationship/grouping between agenda or template exercise items, **not** a `WorkoutSet.set_type`.

The approved minimum `ExecutionGroup` representation contains:

- stable `execution_group_id`;
- `type = SUPERSET`;
- ordered member agenda/template item IDs;
- optional rest between members;
- optional rest between rounds.

This minimum grouping is accepted in `M3_PERSISTENCE_AND_DATA_MODEL_CONTRACT.md`. Sequential items need not be forced into a superset. Additional circuit taxonomies, exact rest behaviors and UI presentation remain future design. A time-adaptation engine must not corrupt set-role semantics to assemble a superset.

---

## 17. Notes and comments

The domain should permit practical notes without requiring them.

Potential scopes:

- session note;
- exercise occurrence note;
- set note where useful.

Notes are user-authored workout data.

Recommendation explanations are not the same thing as user notes.

---

## 18. Session timing

An Actual Workout Session should retain at least:

- explicit start time;
- explicit completion/cancellation time when terminal.

M3 does not yet define a full “active minutes versus wall-clock minutes” model.

Therefore:

- app background is not automatically a pause;
- elapsed wall-clock time should not be overinterpreted as physiological work time;
- exact pause/excluded-time semantics remain provisional.

If the product displays session duration in M3, the UI must be consistent with the implemented timing definition.

---

## 19. Privacy and social boundary

Workout history exists independently of social posts.

M3 workout creation must not imply social publication.

If visibility is represented before the Social milestone, the safe default is private.

Social sharing later references a workout; it does not transform the workout into a social-post-owned record.

---

## 20. Identity requirements for offline-first

ADR-003 requires local-first creation and retryable sync.

Therefore the domain must support stable client-generated identities for at least locally created workout records that need synchronization.

Conceptually:

- session identity;
- exercise occurrence identity;
- set identity;
- locally created agenda mutations where needed.

The Workout Sync Contract will define:

- idempotency;
- mutation ordering;
- retries;
- conflicts;
- tombstones;
- acknowledgement;
- multi-device races.

This contract defines identity need, not transport protocol.

---

## 21. Domain transitions

### Session

`start -> ACTIVE`

From `ACTIVE`:

- continue/resume -> `ACTIVE`
- explicit finish with performed work -> `COMPLETED`
- explicit cancel -> `CANCELLED`

No automatic terminal transition from app close/network loss.

### Set

Local Set Draft: `create/edit draft -> local unconfirmed values` (not performed history, no remote `WorkoutSet.PENDING`).

On explicit confirmation: `Set Draft -> authoritative performed WorkoutSet` with stable ID + atomic outbox mutation.

From performed WorkoutSet:

- explicit correction -> updated authoritative values under optimistic concurrency;
- explicit removal -> deletion/tombstone mutation;
- correction of final qualifying `WORKING` set -> atomic session qualification revalidation.

Engine recommendations cannot perform a historical correction.

### Plan

`DRAFT -> ACTIVE`

`ACTIVE -> COMPLETED` for finite plan completion

`DRAFT/ACTIVE/COMPLETED -> ARCHIVED` where product flow permits.

Activating another primary plan should resolve/deactivate the previous primary active plan rather than leave ambiguous concurrent ownership.

Exact reversible/reactivation UX is provisional.

---

## 22. Example: normal planned workout

1. Active plan recommends `Upper A`.
2. Today’s Proposal adapts it to current context.
3. User taps Start.
4. Actual Workout Session becomes `ACTIVE`.
5. Training Intent and plan/template provenance are snapshotted.
6. Active Session Agenda contains remaining intended work.
7. User performs Barbell Bench Press.
8. Workout Exercise Occurrence references actual Barbell Bench Press.
9. User completes a warm-up set -> completed `WARMUP` set.
10. User completes working sets -> completed `WORKING` sets.
11. Engine modifies a later accessory recommendation.
12. Completed bench sets remain untouched.
13. User explicitly finishes.
14. Session becomes `COMPLETED`.
15. Performed sets become historical source data.
16. Next plan recommendation may use this actual session.

---

## 23. Example: machine occupied mid-session

1. Agenda prescribes Cable Triceps Pushdown.
2. Cable A is occupied.
3. User selects Cable B.
4. Canonical exercise remains Cable Triceps Pushdown.
5. Actual machine context becomes Cable B.
6. If Cable B has prior personal history, recommendation may use it.
7. Completed sets record Cable B's native load/unit context.
8. The session does not pretend Cable A was used.

If the user changes from Cable B to Cable C between sets, machine context must remain resolvable per affected set.

---

## 24. Example: free workout affecting plan

1. User starts `FREE` session.
2. No plan step is consumed on start.
3. User performs chest/back/biceps work.
4. Session becomes `COMPLETED`.
5. It is first-class workout history.
6. Decision Engine evaluates overlap with upcoming plan intent.
7. It may recommend a changed next proposal.
8. It does not silently rewrite the free session as a planned session.

---

## 25. Explicitly unresolved / provisional

**Already settled semantically by the approved persistence/local-data contracts:** canonical Training Intent representation, stable logical Plan Step IDs, immutable plan/template revisions, session-start and per-set prescription snapshots, separate Plan Step coverage, minimum SUPERSET `ExecutionGroup`, local Set Draft (not remote `WorkoutSet.PENDING`), and machine/context ownership and offline continuity. Do not re-open these choices through implementation shortcuts.

Still requiring **implementation shape or separately scoped decisions**:

- final PostgreSQL/SQLite tables, migration sequencing, API payloads and indexes;
- the **physical schema/API implementation** of R2-04's proposed first-set-atomic occurrence lifecycle and immutable final-adaptation provenance, **not** whether an untouched exercise counts as performed;
- Training Profile/cold-start ownership and optional intent semantics (R2-02);
- server-side M3 account deletion/retention policy (R2-03);
- choice of revision/snapshot SQL storage and correction history, **not** whether immutable historical meaning is required;
- advanced set techniques beyond WARMUP/WORKING;
- circuit grouping beyond the accepted minimal SUPERSET type;
- exact rest-duration/pause semantics;
- exact next-plan-step algorithm/evidence windows;
- multi-device active-session conflict UX and social visibility schema.

---

## 26. Acceptance

This contract becomes M3 domain authority when the Product Owner approves:

- Training Intent history/snapshot principle;
- one primary active plan in M3;
- sequence-first rather than rigid weekday plan semantics;
- template/proposal/history separation;
- Today’s Proposal as non-historical intent;
- Active Session Agenda as mutable forward-looking state;
- one logical active workout per user;
- explicit completion/cancellation;
- finish-early versus cancel distinction;
- actual exercise/set source of truth;
- completed-set-only performed-work rule;
- user-correctable completed history;
- minimal `WARMUP` / `WORKING` set-type distinction;
- machine context resolvable per completed set;
- free-workout first-class history;
- plan advancement based on completed actual sessions rather than proposal/start;
- offline-stable identity requirement.

Approval does not authorize final SQL, sync protocol, UI, recommendation algorithm or analytics formulas.

