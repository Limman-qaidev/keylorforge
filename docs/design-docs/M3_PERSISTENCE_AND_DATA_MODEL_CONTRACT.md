# M3 Persistence and Data Model Contract

**Status:** Accepted by Product Owner  
**Milestone:** M3 — Workout Engine  
**Issue:** #109  
**Audit source:** #105  
**Date:** 2026-10-08  
**Product Owner approval:** 2026-10-08

## 1. Purpose

This contract closes the persistence-critical gaps between the accepted M3 product, domain, equipment, decision and sync contracts.

It defines the **minimum semantic model** that PostgreSQL, SQLite and API contracts must preserve.

It does **not** prescribe final table names or endpoint payloads.

Core rules:

1. actual performed work remains authoritative;
2. mutable planning state never rewrites historical workout meaning;
3. user/account-owned entities have stable IDs before server contact;
4. locally editable drafts are not silently promoted into performed history;
5. reusable metadata may change, but performed-set interpretation remains reconstructable.

---

## 2. Canonical Training Intent model

M3 preserves two different concepts:

- **training policy** — how the workout should be programmed/interpreted;
- **overall priority dimension** — whether the user's primary overall priority currently lies in training adaptation or body composition.

### 2.1 Persisted fields

A Training Intent revision must conceptually contain:

- `training_intent_revision_id`;
- `user_id`;
- `primary_training_policy`;
- optional `secondary_training_policy`;
- optional `body_goal`;
- `primary_intent_dimension`;
- experience/policy level;
- effective-from timestamp;
- optional end/superseded metadata.

Initial training-policy values:

- `HYPERTROPHY`
- `STRENGTH`
- `MUSCULAR_ENDURANCE`
- `GENERAL_FITNESS`

Initial body-goal values:

- `GAIN_MASS`
- `MAINTAIN`
- `FAT_LOSS`
- `RECOMPOSITION`

Absence of a current body goal is represented **only by null/no value**. Do not introduce a second `UNSPECIFIED` representation.

Initial `primary_intent_dimension`:

- `TRAINING_POLICY`
- `BODY_GOAL`

If `primary_intent_dimension = BODY_GOAL`, `body_goal` is required and non-null.

### 2.2 Example

User's main overall objective is fat loss, but training decisions should preserve strength:

`primary_training_policy = STRENGTH`  
`body_goal = FAT_LOSS`  
`primary_intent_dimension = BODY_GOAL`

This preserves the accepted distinction without storing a competing second `FAT_LOSS` field.

### 2.3 Versioning rule

Training Intent is historically versioned.

Changing intent creates a new revision; it does not mutate the meaning of past sessions.

A workout started under revision A remains associated with revision A even if revision B later becomes current.

### 2.4 Future measurable targets

Targets such as:

- bench 120 kg;
- bodyweight 90 kg;
- 4 sessions/week;

are **not** another value in the Training Intent enums.

They belong to a future explicit target/goal entity.

---

## 3. Training Plan identity and revision model

### 3.1 Stable plan identity

A user's Training Plan has a stable `training_plan_id`.

A plan may originate from:

- curated/system source;
- user-created source.

### 3.2 Immutable plan revisions

Material edits create a new immutable `plan_revision_id`.

A plan revision contains the ordered Plan Step definitions used by that version.

Past workout sessions keep their original source revision.

### 3.3 Curated source provenance

A user selecting a curated plan receives their own user plan instance or pinned source revision.

Later edits to the global curated source must not mutate the user's existing historical plan revision.

### 3.4 One primary active plan

M3 retains the accepted rule:

- at most one primary active Training Plan per user.

Other plans may be draft/saved/archived.

---

## 4. Plan Step identity

Each logical Plan Step has a stable `plan_step_id` that survives plan revisions while that same step continues to exist.

Each material version of that logical step also has a revision-specific `plan_step_revision_id`.

A Plan Step revision contains:

- logical `plan_step_id`;
- revision-specific `plan_step_revision_id`;
- sequence position in that plan revision;
- referenced Workout Template revision or embedded prescription;
- priority/policy metadata where needed.

Reordering or editing the same logical step preserves `plan_step_id` and creates/uses a new `plan_step_revision_id`.

Replacing a step with a genuinely different logical training slot creates a new `plan_step_id`.

Deleting a step ends that lineage; it does not reassign the old ID to another step.

A Plan Step is prescription intent, not actual history.

A session that originates from a Plan Step stores:

- `training_plan_id`;
- `plan_revision_id`;
- logical `plan_step_id`;
- `plan_step_revision_id`.

This cross-revision lineage lets coverage/history from revision A be interpreted safely after future edits in revision B.

---

## 5. Workout Template identity and revisions

### 5.1 Stable template identity

A reusable Workout Template has a stable `workout_template_id`.

### 5.2 Immutable revisions

Material edits create a new `workout_template_revision_id`.

A session started from revision 3 continues to mean revision 3 even after revision 4 exists.

### 5.3 User customization

Customizing a curated template creates/uses a user-owned revision/instance rather than mutating the global curated source.

### 5.4 Saving a free workout as template

A completed free workout may create a new template revision derived from its structure.

The historical workout remains unchanged.

Offline behavior for template creation is finalized in the local-data/sync remediation.

---

## 6. Workout-start historical snapshot

At `Start`, the session must preserve enough immutable prescription context to remain interpretable after future edits.

Conceptually snapshot/reference:

- Training Intent revision + key fields;
- source plan/revision/logical step/step revision if any;
- source template/revision if any;
- initial exercise agenda;
- initial target sets;
- target reps/time/distance;
- target effort/rest where present;
- priority;
- initial execution-group membership;
- initial preferred equipment context where relevant.

This **session-start snapshot is not sufficient by itself** for adapted sessions.

### 6.1 Why both reference and snapshot

Stable revision IDs provide provenance.

Session-owned snapshots protect history against:

- source archival;
- later curation;
- template deletion;
- schema/business-rule evolution.

Implementation may normalize the snapshot or store a validated structured snapshot payload; it must remain queryable enough for explanations and tests.

### 6.2 Target active when each set is performed

Every completed WorkoutSet that was performed against a prescription/recommendation must preserve the target that was in force **at the moment that set was confirmed**.

Conceptually capture a `SetPrescriptionSnapshot` containing the applicable fields, such as:

- target load/setting where prescribed;
- target reps/time/distance or range;
- target RIR/RPE/effort where prescribed;
- target set role;
- relevant rest target;
- agenda-item/revision context.

If the Active Session Agenda is adapted between set 1 and set 2, their target snapshots may legitimately differ.

Implementation may satisfy this with:

- a per-set immutable target snapshot; or
- a reference to an immutable agenda/prescription revision.

It must not rely only on the session-start target or mutable current agenda, because later history must reconstruct “target versus actual” for the exact set performed.

---

## 7. Active Session Agenda persistence

The Active Session Agenda is persisted mutable forward-looking state.

Each agenda item should conceptually have:

- stable client-generated agenda-item ID;
- canonical exercise intent;
- source prescription reference;
- current target values;
- priority;
- optional execution-group membership;
- current status;
- substitution provenance where relevant.

Possible agenda status concepts:

- `PLANNED`
- `IN_PROGRESS`
- `SATISFIED`
- `REMOVED`
- `SUBSTITUTED`

Exact enum names are implementation detail.

Completed Workout Sets remain separate authoritative performed history.

Changing agenda does not rewrite completed work.

---

## 8. Session completion versus Plan Step coverage

This distinction is mandatory.

### 8.1 Session lifecycle

Session lifecycle answers:

> Has this real workout ended, and how?

- `ACTIVE`
- `COMPLETED`
- `CANCELLED`

### 8.2 Plan Step coverage

Plan Step coverage answers:

> How much of the intended plan-step stimulus was actually covered?

Conceptual outcomes:

- `SUFFICIENT`
- `PARTIAL`
- `NOT_COVERED`
- `NOT_EVALUATED`

Exact enum names may change, but the semantic dimension must exist.

### 8.3 Coverage is derived from actual history

Coverage is evaluated from:

- actual completed working sets;
- exercise/substitution relationships;
- goal policy;
- priority movements/muscles;
- omitted work;
- relevant effort/context.

A session being `COMPLETED` does not imply `SUFFICIENT` coverage.

### 8.4 Plan progression rule

Do not implement a blind:

`completed session -> current_step += 1`

The next recommended Plan Step is a Decision Engine result based on:

- sequence;
- source Plan Step;
- coverage;
- recent free/out-of-order work;
- recovery/context.

A completed but `PARTIAL` session may still lead to the next step, a modified next step, or a repeat depending on policy.

### 8.5 Free workouts

A free workout does not automatically acquire Plan Step coverage credit.

It may influence next-session decisions.

Any explicit future action that treats it as covering a Plan Step must be user-visible/explainable.

---

## 9. Product decision: what qualifies a session for COMPLETED

The accepted Domain and User Journey currently conflict.

This contract proposes the following rule for Product Owner approval:

> A normal M3 workout may become `COMPLETED` only if it contains at least one completed qualifying `WORKING` set.

### 9.1 Rationale

This prevents:

- warm-up-only sessions from appearing as completed training;
- accidental plan progression from warm-up data;
- misleading completed-session counts.

### 9.2 Warm-up-only session

If the session contains only completed `WARMUP` sets, the user may:

- continue and perform working work;
- cancel/discard;
- leave it active temporarily.

It does not become a normal completed workout.

### 9.3 Future extensibility

Future modalities may define other qualifying performed-work roles.

Do not encode “WORKING is forever the only qualifying type” as an irreversible database constraint.

### 9.4 Attendance remains separate

Later M4/M5 attendance qualification may be stricter than basic session completion.

---

## 10. Workout Set lifecycle: draft versus performed history

### 10.1 Local Set Draft

Before confirmation, typed set values are **draft UI/active-workout state**.

A Set Draft may include:

- prefilled load;
- reps/time/distance;
- optional effort;
- set role;
- machine context.

It may be persisted in SQLite so app restart does not lose the user's typed values.

### 10.2 Draft is not authoritative history

A draft:

- does not count as performed work;
- does not affect volume/fatigue/PRs;
- does not need a remote WorkoutSet row;
- is not sent as a historical set mutation.

### 10.3 Confirming performed work

When the user taps Complete:

one atomic local transaction must:

1. create the authoritative `WorkoutSet` with stable client-generated ID;
2. mark it performed/completed;
3. enqueue its sync mutation;
4. clear or supersede the Set Draft.

### 10.4 Identity preallocation

The client may preallocate the eventual set ID while editing a draft.

Preallocation does not make the draft remote history.

### 10.5 Correcting a completed set

A later correction mutates the existing authoritative WorkoutSet through explicit version/concurrency semantics.

---

## 11. Set measurement persistence

A WorkoutSet stores only measurements meaningful to that exercise.

### 11.1 Load

When applicable preserve:

- original numeric load value;
- original unit;
- load-entry semantics;
- assistance/resistance direction where needed.

Numeric load values should use decimal-safe persistence rather than binary floating-point assumptions.

### 11.2 Repetitions

Integer count when applicable.

### 11.3 Duration

Canonical performed duration:

- integer seconds for M3.

UI may present minutes/seconds.

### 11.4 Distance

Preserve:

- original numeric distance value;
- original distance unit.

Initial distance-unit support:

- meters;
- kilometers;
- miles.

A canonical converted value may be derived for compatible analytics.

### 11.5 Effort

Optional:

- RIR;
- RPE.

No exact conversion is silently inferred between them.

---

## 12. Machine Profile

Machine Profile is a first-class user-owned syncable entity.

Conceptually:

- `machine_profile_id` — client-generated stable ID;
- owner user;
- optional `gym_context_id`;
- broad equipment taxonomy;
- user-facing nickname;
- manufacturer/model when known;
- native load unit;
- load-entry semantics;
- available load sequence;
- optional technical metadata/provenance;
- lifecycle/deletion metadata.

Unknown technical fields are valid.

---

## 13. Machine Configuration

A Machine Profile may contain one or more material configurations.

Conceptually:

- `machine_configuration_id`;
- parent Machine Profile;
- user-facing label;
- material setup identifier;
- optional manufacturer-declared ratio/configuration metadata;
- optional attachment/setup metadata when it materially changes interpretation.

### Semantic boundary

If a change materially alters the semantic movement/technique itself, it belongs in a distinct canonical exercise/variant rather than being hidden as Machine Configuration.

Machine Configuration describes equipment setup **within** one semantic exercise identity.

---

## 14. Historical machine-context snapshot

A completed WorkoutSet must remain interpretable even if the reusable Machine Profile is later edited.

Therefore completed work preserves at least:

- Machine Profile ID when used;
- Machine Configuration ID when used;
- original displayed load value;
- original unit;
- load-entry semantics;
- material configuration snapshot needed for interpretation.

Human-readable machine nickname may be resolved from current profile for UI, but changing a nickname must not change historical load semantics.

If a material profile/configuration property is corrected later, historical correction must be explicit rather than silently changing old sets.

---

## 15. Gym Context

M3 may persist a lightweight user-owned Gym Context:

- stable client-generated ID;
- display name;
- optional notes.

No geolocation is required.

Machine Profiles may reference a Gym Context.

Examples:

- Home gym
- Madrid
- Hotel

Precise location remains out of scope unless separately reviewed.

---

## 16. Machine Profile offline dependency

Machine Profile and Machine Configuration IDs exist before server contact.

If a completed set references a profile/configuration created offline:

`create machine/profile -> create configuration if needed -> create completed set`

must be represented as causal outbox dependencies.

The set must not be rejected merely because the profile was first created offline.

Exact mutation payloads belong to API design.

---

## 17. Minimum execution-group model

Because accepted M3 behavior includes automatic/manual supersets, the domain requires a minimum execution-group representation.

### 17.1 Execution Group

Conceptually:

- `execution_group_id`;
- type;
- ordered member agenda/template item IDs;
- optional between-member rest target;
- optional between-round rest target.

Initial M3 type:

- `SUPERSET`

Future types such as circuit may be added later.

### 17.2 Not a set type

`SUPERSET` is never a WorkoutSet role/type.

Actual sets remain attached to their actual exercise occurrence.

### 17.3 Template and active agenda

Execution Groups may exist in:

- Workout Template revision;
- Active Session Agenda.

Creating a time-saving superset during an active workout mutates remaining agenda grouping only.

Completed sets are untouched.

### 17.4 Actual history

Actual execution order/timestamps remain the source of truth for what the user really did.

Group provenance may be retained for later explanation but does not replace actual set history.

---

## 18. Timestamp and local-day semantics

### 18.1 UTC authority

Persist authoritative instants as timezone-aware UTC timestamps.

Examples:

- session start;
- session completion/cancellation;
- set completion;
- mutation timestamps.

### 18.2 Session timezone snapshot

At session start also capture:

- IANA timezone identifier when available;
- UTC offset at start;
- derived local calendar date.

Example:

`Europe/Madrid`, `+02:00`, `2026-10-08`.

### 18.3 Why preserve local-day context

Later features depend on a stable interpretation of:

- “today”;
- workout day;
- attendance;
- travel across timezones.

Historical session day should not change simply because the user later travels.

### 18.4 Current “today”

Current Today/Rest-Day UX uses the user's current product/device timezone.

Historical local date uses the captured session-start timezone context.

---

## 19. Precision and validation principles

- use integer types for reps and duration seconds;
- use decimal-safe numeric representation for load/distance values;
- validate units against measurement semantics;
- do not accept negative performed reps/duration/distance;
- assistance direction must be explicit rather than encoded through negative weight;
- no arbitrary “effective kg” field;
- unknown machine metadata remains valid.

Exact database precision/scale values are finalized in the schema implementation design.

---

## 20. Custom-exercise M3 scope

Initial M3 core does **not** require end-user custom exercise creation.

The initial workout engine relies on:

- the canonical 899-exercise catalogue;
- Machine Profiles for gym-specific equipment context.

Custom exercises remain a later focused slice when a genuinely missing/materially unique movement must be represented.

When that slice is implemented it requires:

- user-owned stable identity;
- measurement type;
- load semantics;
- enough muscle/equipment metadata;
- offline/sync behavior;
- plan/template compatibility.

Do not use custom exercises as a workaround for missing Machine Profile modeling.

---

## 21. Conceptual relationship map

```text
User
 ├─ TrainingIntentRevision*
 ├─ TrainingPlan
 │   └─ PlanRevision*
 │       └─ PlanStepRevision*
 │           └─ WorkoutTemplateRevision / prescription
 ├─ WorkoutTemplate
 │   └─ WorkoutTemplateRevision*
 │       ├─ TemplateExerciseItem*
 │       └─ ExecutionGroup*
 ├─ GymContext*
 │   └─ MachineProfile*
 │       └─ MachineConfiguration*
 └─ ActualWorkoutSession
     ├─ SessionPrescriptionSnapshot
     ├─ ActiveSessionAgenda
     │   ├─ AgendaItem*
     │   └─ ExecutionGroup*
     └─ WorkoutExerciseOccurrence*
         └─ WorkoutSet*
```

Asterisk means zero-or-many, not a proposed SQL cardinality notation.

---

## 22. Historical authority hierarchy

Source-of-truth priority:

1. completed WorkoutSet / actual exercise occurrence;
2. actual session lifecycle;
3. session-owned prescription snapshot/provenance;
4. current reusable plan/template/machine metadata;
5. derived Plan Step coverage / next recommendation;
6. future analytics.

A lower layer may never rewrite a higher historical layer automatically.

---

## 23. Correction semantics

### Plan/template edit

Creates a new revision for future use.

Past sessions retain prior revision/snapshot.

### Machine nickname edit

May change current display name.

Historical load semantics remain unchanged.

### Material machine metadata correction

Does not silently reinterpret prior sets.

If historical meaning was wrong, perform an explicit historical correction/reclassification.

### Set correction

Explicitly updates the authoritative performed set under concurrency protection.

Any correction that can affect session completion qualification — including removal of a set or reclassifying the final qualifying `WORKING` set as `WARMUP` — must revalidate the parent session atomically.

If a `COMPLETED` session is left with no qualifying performed set:

- it may not remain `COMPLETED`;
- it transitions to the accepted cancelled/discarded-training semantics after the required explicit user confirmation;
- Plan Step coverage and any completion-derived effects are recomputed/reversed.

This applies even when completed warm-up sets still remain.

### Session correction

May recompute:

- Plan Step coverage;
- next-session recommendation;
- attendance/analytics later.

---

## 24. Data that is authoritative versus derived

### Authoritative raw/domain data

- Training Intent revisions;
- plan/template revisions;
- session start/provenance snapshots;
- actual session lifecycle;
- actual exercise occurrence;
- actual completed sets;
- machine profiles/configurations;
- user corrections.

### Mutable planning state

- Active Session Agenda;
- current plan/template draft before revision publication;
- local Set Draft.

### Derived/recomputable

- Plan Step coverage;
- recommended next Plan Step;
- recommendation confidence;
- fatigue/readiness states;
- M4 analytics/PRs/rankings.

Persisting a derived value as a cache does not make it source truth.

---

## 25. Migration/API implications

This contract requires later schema/API work to support:

- immutable revisions or equivalent historical version semantics;
- stable client-generated IDs;
- session-owned prescription snapshots;
- user-owned Machine Profiles/Configurations;
- machine-context snapshots on performed work;
- explicit unit fields;
- local Set Draft separate from remote performed WorkoutSet;
- execution groups;
- timestamps + local-day context;
- coverage as derived/recomputable state.

Exact table/column names remain implementation work.

---

## 26. Decisions intentionally deferred

Still deferred:

- exact SQL table names;
- exact JSON versus normalized representation of snapshots;
- exact numeric precision/scale;
- exact Plan Step coverage algorithm;
- fatigue thresholds;
- cross-machine calibration formula;
- custom-exercise implementation;
- advanced set techniques beyond WARMUP/WORKING;
- circuits beyond minimum SUPERSET;
- M4 analytics formulas.

These may not be guessed in dependent implementation work.

---

## 27. Acceptance decisions

Product Owner approval of this contract explicitly approves:

1. `primary_intent_dimension` as the M3 way to preserve overall-priority dimension without duplicating body-goal values;
2. immutable plan/template revision semantics;
3. workout-start prescription snapshots;
4. session lifecycle separated from Plan Step coverage;
5. **a normal completed M3 workout requires at least one completed qualifying WORKING set**;
6. Set Draft is local state; authoritative WorkoutSet represents performed work;
7. Machine Profile, Machine Configuration and optional Gym Context are first-class user-owned concepts;
8. completed sets preserve material machine/load context;
9. distance/unit and timezone/local-day semantics;
10. minimum SUPERSET execution group;
11. initial custom-exercise creation is deferred from M3 core.

Approval does not authorize final SQL table names, API payloads or migrations.

