# M3 Exercise Intelligence and Equipment Contract

**Status:** Accepted by Product Owner  
**Milestone:** M3 — Workout Engine  
**Issue:** #95  
**Parent authorities:** `M3_WORKOUT_ENGINE_PRODUCT_CONTRACT.md`, `M3_TRAINING_GOAL_POLICIES.md`  
**Related catalogue follow-up:** #89  
**Evidence review:** 2026-10-07  
**Product Owner approval:** 2026-10-07

## 1. Purpose

This contract defines what an exercise means inside KeylorForge and how the app records the real equipment context in which that exercise is performed.

It exists to prevent a dangerous simplification:

> `exercise + number` is not enough to describe a gym performance.

The same displayed load can mean different things depending on:

- free weight versus machine;
- total load versus per-hand/per-side load;
- selectorized stack versus plate-loaded resistance;
- assistance versus external resistance;
- kg versus lb;
- pulley ratio/configuration;
- machine geometry/cam design;
- the exact machine used.

The governing principle is:

> Preserve the user's real, repeatable gym setting first. Derive conversions and recommendations second.

This contract does not define final SQL, API routes, workout state machines, synchronization, ranking formulas or final UI.

---

## 2. Preserve the M2 canonical catalogue

M2 already provides:

- stable KeylorForge exercise IDs;
- source provenance;
- localized names;
- measurement types: `reps`, `time`, `distance`;
- muscle roles;
- equipment taxonomy;
- category/difficulty/force/mechanics metadata.

M3 extends that catalogue. It must not create an incompatible parallel exercise system.

### Core rule

A different physical machine is **not automatically a different exercise**.

Example:

`Cable Rope Triceps Pushdown`

performed on:

- Cable machine A;
- Cable machine B;
- another gym's cable machine;

should normally remain one canonical exercise identity with different **equipment/machine context**.

This avoids polluting the exercise catalogue with user/gym-specific duplicates.

---

## 3. Identity hierarchy

KeylorForge should conceptually distinguish six layers.

### 3.1 Canonical Exercise

The stable semantic movement identity already established by M2.

Examples:

- Barbell Bench Press;
- Dumbbell Bench Press;
- Cable Triceps Pushdown;
- Leg Extension.

It owns stable catalogue relationships such as muscle roles and broad equipment requirements.

### 3.2 Exercise Relationship

A relationship between canonical exercises.

Relationship meaning must be explicit; a single boolean `equivalent=true` is insufficient.

Relevant concepts:

- **alias** — two source/name records represent the same semantic exercise identity;
- **variant** — related movement but intentionally distinct exercise identity;
- **candidate substitution** — may replace another exercise in some training contexts;
- **family/related movement** — useful navigation/grouping without implying substitution.

Catalogue relationship does **not** automatically grant performance comparability.

### 3.3 Equipment Taxonomy

The broad equipment category already represented by M2.

Examples:

- barbell;
- dumbbell;
- cable;
- machine;
- bodyweight.

This answers “what kind of equipment does the exercise require?”

It does not identify the actual machine used.

### 3.4 Equipment / Machine Profile

A reusable representation of the real equipment the user encounters.

Examples:

- `Polea Technogym A — gimnasio habitual`;
- `Cable B — gimnasio Madrid`;
- `Hammer Strength Chest Press`;
- `Smith Machine 1`.

A machine profile may eventually hold:

- user-facing name;
- broad equipment taxonomy;
- manufacturer/model when known;
- native load unit;
- selectable load sequence;
- declared pulley/mechanical ratio when known;
- known starting/base resistance when manufacturer-provided;
- notes/configuration hints;
- provenance/confidence of technical metadata.

Manufacturer/model must be optional. The user must not need to identify an exact commercial model before training.

### 3.5 Machine Configuration

A material setup of a machine/profile that can alter resistance or comparability.

Potential examples:

- cable output/path;
- one-handle versus two-handle usage;
- attachment type;
- explicit manufacturer-provided 1:1 versus 2:1 mode;
- other configurations later proven material.

The product must not require the user to record every seat pin or handle detail unless it materially improves the workout use case.

### 3.6 Workout Performance Context

The snapshot attached to what the user actually did.

It may include:

- canonical exercise ID;
- machine/equipment profile when known;
- configuration when material;
- original load setting/value;
- original unit;
- load-entry semantics;
- attachment/context where material;
- set measurements and effort.

The Workout Domain Contract will decide exactly which elements are copied/snapshotted into workout history.

---

## 4. Exercise Intelligence

M3 should evolve exercises from catalogue labels into usable training knowledge.

Relevant intelligence concepts include:

- concise purpose;
- setup;
- execution;
- finish/range guidance where appropriate;
- short cues;
- common mistakes;
- movement pattern;
- unilateral/bilateral character;
- body position where useful;
- measurement type;
- load-entry semantics;
- muscle roles;
- equipment requirements;
- exercise-family/variant relationships;
- candidate substitutions;
- skill/difficulty context;
- later media/animation/video.

Exact persistence fields remain a later design decision.

### Content provenance

Enriched descriptions/instructions/media must have traceable provenance.

KeylorForge must not copy unlicensed exercise media or text merely because it is publicly reachable.

Content should be:

- KeylorForge-authored/curated;
- generated and then reviewed under an explicit content process;
- or redistributed under a compatible license.

### Localization

Exercise Intelligence should support localization as first-class content, not machine translation performed opportunistically in the live workout flow.

---

## 5. Alias, variant and collision policy

Issue #89 identified real Spanish-name collisions.

M3 must distinguish two cases.

### 5.1 True semantic alias

If two upstream records represent the same exercise:

- choose/retain one canonical semantic identity;
- preserve alias/source mappings;
- never silently lose historical references;
- if workouts already reference more than one ID, migration/backfill/redirect semantics must preserve history.

A display-name alias must not fragment future history/analytics.

### 5.2 Intentionally distinct exercises with colliding names

If records are intentionally distinct:

- retain distinct stable IDs;
- disambiguate localized display names;
- preserve the differing exercise/equipment/muscle semantics.

### Historical-ID rule

Once an exercise ID is referenced by workout history, curation must not simply delete/reassign that identity without an explicit migration/alias strategy.

### Timing

#89 should be handled early in M3 and must be resolved before analytics/rankings rely on canonical cross-session comparability.

---

## 6. Relationship and substitution semantics

“Related”, “substitutable” and “comparable” are different concepts.

### 6.1 Related

Exercises may share:

- movement family;
- primary muscles;
- equipment family;
- technique lineage.

This is descriptive only.

### 6.2 Candidate substitution

A candidate substitution means:

> this exercise may preserve enough of the intended session goal to replace another exercise under some conditions.

It is **not** a universal equivalence.

Substitution must consider:

- training goal policy;
- priority movement specificity;
- target muscles/movement;
- available equipment;
- user preferences;
- current fatigue/context.

Example:

- Dumbbell Bench Press may be a reasonable hypertrophy substitute for Barbell Bench Press.
- It may be a poor substitute when Barbell Bench Press is an explicit strength-priority movement.

### 6.3 Performance comparability

No catalogue relation alone should authorize direct performance comparison.

Runtime/history comparability depends on:

- canonical exercise;
- equipment modality;
- machine profile;
- configuration;
- load semantics;
- measurement semantics.

Future M4/M5 analytics must consume an explicit comparability policy rather than assume “same muscle = comparable.”

---

## 7. Primary measurement versus load semantics

M2's `measurement_type` remains useful and should not be overloaded.

Examples:

- `reps` — primary set outcome measured in repetitions;
- `time`;
- `distance`.

External load is orthogonal.

A `reps` exercise may use:

- a barbell;
- dumbbells;
- a selectorized machine;
- bodyweight;
- assisted bodyweight.

Therefore M3 also needs **load-entry semantics**.

---

## 8. Load-entry semantics

Exact enum names are provisional, but the domain must distinguish at least the following behaviors.

### 8.1 Barbell / total external load

For a conventional barbell movement, the user normally records the **total external load moved**:

`bar + plates`

Example:

20 kg bar + 20 kg per side = **60 kg recorded**.

The app may support plate calculation later, but the authoritative user-facing training value is the chosen total nominal load.

### 8.2 Dumbbell / per implement

For two-dumbbell exercises, the most useful gym-facing entry is normally the label on **one dumbbell**.

Example:

two 30 kg dumbbells -> record/display **30 kg each**, not silently “60 kg”.

KeylorForge may derive combined nominal external load where useful, but must not replace the original per-implement value.

For unilateral one-dumbbell work, the same entry remains unambiguous.

### 8.3 Selectorized machine / displayed setting

Record the machine's displayed stack/setting in its native unit.

Example:

`45 kg displayed`

This is **nominal machine load**, not universal effective resistance.

### 8.4 Plate-loaded machine

The product must explicitly support the convention used by that machine/profile.

Potential user-facing conventions:

- plate load **per side**;
- total plates loaded.

If the machine has a known manufacturer-declared starting resistance, it may be metadata, but KeylorForge must not infer one.

The interface must make the convention visible enough to avoid doubling/halving errors.

### 8.5 Smith machine

A Smith machine may have a manufacturer-specific bar/start resistance or counterbalance.

KeylorForge must not assume every Smith bar weighs 20 kg.

A machine profile may store known declared starting resistance.

When unknown, the user's reproducible machine setting/history is more trustworthy than an invented universal bar weight.

### 8.6 Assisted exercise

For assisted pull-up/dip or similar machines:

- a larger assistance value means **less net difficulty**;
- progression may mean reducing assistance.

The domain must encode directionality so “more displayed kg” is not mistaken for greater performance.

### 8.7 Bodyweight

Bodyweight exercise may be:

- bodyweight only;
- bodyweight + external load;
- bodyweight − external assistance.

M3 should preserve the external load/assistance component without pretending body mass and external load are interchangeable in every future metric.

### 8.8 No meaningful external load

Time/distance/isometric/cardio-style exercises may have no external load.

The workout model must not force a meaningless zero-kg value.

---

## 9. Units

### 9.1 Preserve the native/original value

If a machine displays pounds:

- record the original value in lb;
- allow a convenience kg display;
- when returning to the same machine, show the machine-native setting prominently.

The same applies in reverse for kg machines.

### 9.2 Exact conversion

For ordinary mass-unit display conversion:

`1 lb = 0.45359237 kg`

This is an exact defined conversion.

Converted values are convenience values; they do not make two machines mechanically equivalent.

### 9.3 User preferred unit versus machine native unit

The product may have a user preferred unit, but a known machine's native unit takes precedence for actionable machine instructions.

Example:

> Next setting: **90 lb** (≈ 40.8 kg)

is more useful than telling a user to select 40.8 kg on a stack labelled in pounds.

---

## 10. Available load settings and increments

KeylorForge must not assume every exercise progresses in 2.5 kg steps.

A machine/profile may have:

- 5 kg increments;
- 10 kg increments;
- irregular increments;
- pound-labelled plates;
- add-on micro plates;
- an explicit sequence that cannot be represented by one increment.

### Product contract

When known, available loads should be representable as an explicit ordered sequence.

Example:

`[10, 19, 28, 37, 46, ...] lb`

rather than only:

`increment = 9 lb`

because a real machine may contain special first/last plates or add-ons.

### Recommendation implication

The Decision Engine requests a **direction/desired progression**, then the equipment context constrains it to physically valid candidates.

If the next valid load step is too large, Training Goal Policies may prefer:

- more reps;
- maintained load;
- another approved progression variable.

---

## 11. Cable and pulley systems

### 11.1 Pulley count is not enough

KeylorForge must not infer effective resistance from “number of pulleys” alone.

Relevant mechanics can include:

- system mechanical ratio;
- moving/fixed pulley arrangement;
- cable path;
- cams;
- friction;
- lever geometry;
- selected output/configuration.

### 11.2 Manufacturer-declared ratios are useful metadata

Some commercial functional trainers explicitly declare ratios such as 2:1, where the usable resistance at the handle differs from the stack label.

When manufacturer/model/configuration is known, KeylorForge may store that declared ratio with provenance.

### 11.3 No universal effective-kg field

Even with a declared pulley ratio, M3 must not promote a theoretical conversion into a universal “effective kg” comparable across all machines.

Research on selectorized/variable-resistance equipment shows machine geometry/cam mechanics can materially alter joint torque/power and resistance behavior.

Therefore:

- original stack setting remains authoritative history;
- a ratio-derived value may be explanatory/auxiliary;
- cross-machine progression should prefer user-specific performance history when available.

---

## 12. Machine profile confidence and provenance

Technical machine metadata can have different confidence levels.

Conceptual provenance examples:

- manufacturer-declared;
- KeylorForge curated;
- user-entered;
- inferred from repeated use.

The product should distinguish known facts from guesses.

Examples:

- `native unit = lb` observed by user;
- `pulley ratio = 2:1` manufacturer-declared;
- `starting resistance = unknown`.

Never fabricate missing mechanical specifications to complete a profile.

---

## 13. Personal cross-machine calibration

### 13.1 Problem

If Cable A is occupied and the user moves to Cable B, copying the same nominal number may produce a very different effort.

### 13.2 Preferred evidence

When the user has prior comparable history on Cable B, use that history first.

Example:

Cable A:
`45 kg × 12 @ RIR 2`

Cable B:
`70 lb × 12 @ RIR 2`

The useful product insight is:

> this user's performance at those settings has previously been similar for this exercise.

It is **not**:

> 45 kg on A physically equals 70 lb on B.

### 13.3 Unknown machine

When a machine has no personal history:

- do not blindly copy another machine's nominal load;
- allow the user to choose manually;
- optionally provide a conservative estimate only when evidence/context justifies it;
- use early set result/RIR to refine the next recommendation.

Exact calibration algorithms belong in the Decision Engine Contract.

### 13.4 Confidence

Cross-machine calibration should carry confidence/uncertainty internally.

Do not show false precision such as:

> Cable B equivalent = 31.742 kg.

Prefer:

> On this machine, your previous comparable working range was around 70 lb.

---

## 14. Comparability tiers

Exact names are provisional, but future history/analytics need at least these conceptual outcomes.

### Same-context comparable

Strongest ordinary comparison:

- same canonical exercise;
- same machine/equipment profile where material;
- compatible configuration;
- same load semantics.

### Broadly comparable

May be comparable for some purposes with known caveats.

Example:

- standardized free-weight barbell exercise across gyms when total-load semantics are the same.

### Goal/substitution compatible but not performance comparable

Two exercises can preserve session intent without their loads being directly comparable.

Example:

- barbell bench versus dumbbell bench for hypertrophy.

### Non-comparable / unknown

Insufficient context to make a defensible load-performance comparison.

The product must prefer “not comparable” over a fabricated normalized score.

---

## 15. Personal records and future analytics guardrail

M4/M5 must not calculate one naive PR history across incompatible machine contexts.

Examples:

- 100 kg selectorized chest press on Machine A;
- 80 kg on Machine B;
- 40 kg dumbbells;
- 90 kg Smith press;

must not be ranked by raw nominal kg as if they were the same measurement.

This contract does not define M4 PR methodology, but it requires enough context to make a later defensible methodology possible.

---

## 16. Custom exercises versus machine profiles

A user should **not** need to create a custom exercise merely because their gym has a different machine.

Use:

`canonical exercise + machine profile`

when the movement identity is already represented.

A private/custom exercise is appropriate when the actual movement itself is missing or materially unique.

Custom exercises should not pollute the shared canonical catalogue.

When custom-exercise support is implemented, it should still define:

- primary measurement;
- load semantics;
- user-owned stable identity;
- enough movement/equipment metadata for workout history.

Exact lifecycle belongs in a later domain contract.

---

## 17. Low-friction gym UX constraints

Equipment intelligence must not turn logging into equipment administration.

### First use

The user should be able to log with minimal information.

Examples:

- choose canonical exercise;
- optionally indicate “different/new machine”;
- enter the actual visible load and unit.

### Progressive enrichment

Later the user may save:

- machine nickname;
- gym context;
- native unit;
- available load steps;
- manufacturer/model;
- ratio or starting resistance when known.

### Reuse

Once a machine profile exists:

- default to the last-used profile where appropriate;
- show the machine-native previous performance;
- allow quick switching if occupied.

### Unknown details

“Unknown” is an acceptable value.

The user must never be blocked because they do not know:

- pulley ratio;
- exact model;
- starting resistance;
- technical manufacturer specs.

---

## 18. Gym/location context

A machine profile may be associated with a manually named gym/context.

M3 does not require precise geolocation.

Example:

- `Gimnasio habitual`;
- `Madrid`;
- `Hotel`.

If geographic location is ever added, it requires separate privacy/product review.

---

## 19. Recommendation boundary

Equipment context constrains recommendations but does not independently decide progression.

Conceptual flow:

`Training Goal Policy`
→ desired progression direction  
→ `Exercise/Equipment constraints`
→ valid physical candidates  
→ `Decision Engine`
→ explainable recommendation.

Example:

Policy wants “slightly harder”.

Machine offers:

`45 kg -> 50 kg`

but history suggests that jump is too large for the current rep target.

Valid alternatives may be:

- 45 kg + more reps;
- 50 kg at lower target reps;
- maintain 45 kg.

The equipment layer never invents 47.5 kg if the machine cannot select it.

---

## 20. Automation boundary

### Safe automatic behavior

May include:

- exact kg/lb display conversion;
- restoring last machine profile;
- listing physically available load settings;
- recognizing assistance directionality;
- showing prior same-machine performance;
- excluding obviously incompatible raw-load comparisons.

### Recommendation-only initially

Requires user control/confirmation:

- selecting a substitute exercise;
- using an estimated starting load on an unknown machine;
- treating two machine profiles as personally calibrated;
- changing machine/configuration during an active exercise;
- using ratio-derived mechanical estimates for progression.

### Never automatic from this contract

- inventing missing machine specifications;
- merging two canonical exercises because names look similar;
- deleting historical IDs;
- claiming physical equivalence from similar RIR alone;
- normalizing all gym machines into universal “effective kg”;
- comparing raw kg/lb across incompatible exercise/machine contexts for rankings.

---

## 21. Research/mechanical basis

This contract uses the following external basis.

### Units

NIST recognizes the exact mass conversion:

`1 pound = 0.45359237 kilogram`.

### Pulley-ratio manufacturer example

REP Fitness documents functional trainers with an explicit **2:1 pulley ratio** and describes a stack setting producing approximately half that nominal handle resistance in the ideal ratio sense.

This demonstrates why machine-native setting and mechanical configuration must be represented separately.

It does not justify universal conversion across all cable machines.

### Machine mechanics

Published biomechanics work shows that variable cams, resistance moment arms and selectorized-machine geometry materially affect torque/power behavior.

Relevant sources include:

- Folland J, Morris B. Variable-cam resistance training machines. *Journal of Sports Sciences* (2008). PMID **17885926**.
- Biscarini A. Measurement of power in selectorized strength-training equipment. *Journal of Applied Biomechanics* (2011/2012). PMID **21975575** / **22890424**.
- The influence of variable resistance moment arm on knee extensor performance. PMID **20397096**.

These support the guardrail that stack mass alone is not a universal description of mechanical demand.

---

## 22. Explicitly provisional

Do not hard-code yet:

- final machine-profile schema;
- final configuration enum;
- exact load-semantics enum names;
- exact substitution relationship taxonomy;
- exact comparability tier names;
- minimum observations for cross-machine calibration;
- calibration formula;
- confidence formula;
- manufacturer/model database strategy;
- automatic equipment recognition;
- starting-resistance calculations;
- whether attachment type is always material;
- whether seat/lever positions become structured fields;
- exact custom-exercise lifecycle;
- global shared gym-machine catalogue.

These require later implementation/domain decisions.

---

## 23. Acceptance

This contract becomes M3 authority when the Product Owner confirms:

- canonical exercise and actual machine are separate concepts;
- machine context must not pollute the exercise catalogue;
- machine-native load/unit is preserved;
- kg/lb conversion is display convenience, not mechanical equivalence;
- available load steps may be explicit/irregular;
- load semantics differ by modality;
- pulley ratios do not create universal effective kg;
- personal history is preferred for cross-machine calibration;
- substitutions are goal/context dependent;
- unknown machine metadata is acceptable;
- user logging remains low friction;
- historical exercise IDs are preserved through curation.

Approval does not authorize final SQL, an automatic calibration formula, a shared global machine database or M4/M5 comparability formulas.

