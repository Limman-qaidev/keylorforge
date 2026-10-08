# M3 End-to-End Workout User Journey

**Status:** Accepted by Product Owner  
**Milestone:** M3 — Workout Engine  
**Issue:** #103  
**Parent authorities:** `M3_WORKOUT_ENGINE_PRODUCT_CONTRACT.md`, `M3_TRAINING_GOAL_POLICIES.md`, `M3_EXERCISE_AND_EQUIPMENT_CONTRACT.md`, `M3_WORKOUT_DOMAIN_CONTRACT.md`, `M3_DECISION_ENGINE_CONTRACT.md`, `M3_WORKOUT_SYNC_CONTRACT.md`, ADR-003  
**Date:** 2026-10-08  
**Product Owner approval:** 2026-10-08

## 1. Purpose

This document defines the functional user journey for M3 from the moment a user opens **Entrenar** until the workout is completed, cancelled or safely left active for later resumption.

It composes the accepted M3 domain contracts into one coherent gym experience.

This is not a pixel-perfect visual specification. It defines:

- what the user is trying to accomplish;
- which state the product is in;
- what the primary and secondary actions are;
- what the Decision Engine may recommend;
- what must persist locally;
- when KeylorForge should speak;
- when it should remain silent.

The governing UX principle is:

> The workout should feel faster than a notebook, but more useful than a notebook.

---

## 2. Global journey principles

### 2.1 Active workout dominates

If an `ACTIVE` workout exists, **Entrenar** prioritizes it above plans, catalogue discovery or recommendations.

Primary action:

> Continue workout

The user must not need to rediscover the plan or exercise list.

### 2.2 Recording wins over coaching

Any live coaching/recommendation can disappear and the user must still be able to complete the workout.

### 2.3 Silence by default

When the user is on target and no meaningful decision changes, KeylorForge should:

- save the set;
- start/show rest timing;
- prefill the next expected values;
- stay visually quiet.

Do not produce a coaching card after every normal set.

### 2.4 One-handed, short-attention interaction

High-frequency actions should favor:

- large tap targets;
- retained values;
- one-tap completion where possible;
- minimal typing;
- no mandatory modal survey between sets.

### 2.5 User control

Recommendations are always editable/ignorable.

The user should never feel trapped by:

- the current plan;
- a suggested load;
- a suggested exercise;
- a recovery recommendation;
- a timer.

### 2.6 Local-first confirmation

When a set is completed:

1. write domain state + outbox locally;
2. update the UI immediately;
3. sync afterwards.

A poor connection should not visibly delay normal logging.

---

## 3. Entrenar state router

Opening **Entrenar** resolves one of four top-level states in this priority order.

### State A — Active workout exists

Show:

- workout name/origin;
- elapsed time;
- current/next exercise;
- progress through actual/remaining agenda;
- primary: **Continue workout**;
- secondary: finish / cancel through an intentional overflow or session action area.

Do not foreground plan discovery while an active workout exists.

### State B — No active workout, user has active plan

Show:

- **Next recommended workout**;
- template/session name;
- goal-relevant summary;
- approximate duration;
- target areas / priority movement;
- last related workout context where useful.

Primary:

> Start workout

Secondary:

- Adapt workout
- Free workout
- Choose another workout
- View plan

### State C — Planned rest / no workout recommended now

Show:

> Rest is currently recommended.

Also show:

- next recommended workout;
- why today is a rest/recovery day in simple terms where useful.

Actions:

- Train today
- Free workout
- View plan

Rest is guidance, not lockout.

### State D — No active plan

Show:

> How do you want to train?

Primary choices:

- Find a plan
- Create my plan
- Free workout

Secondary:

- Explore exercises

Do not pretend a “today workout” exists before the user has a plan.

---

## 4. New user / no-plan journey

### 4.1 Find a plan

The user provides only the minimum useful context.

Likely inputs:

- primary training policy;
- experience level;
- desired training frequency;
- typical available time;
- equipment/gym context where needed.

Body-goal context may already exist from progressive profiling.

The app should return a **small shortlist**, not hundreds of plans.

Example:

1. Upper/Lower 4 days — recommended
2. Full Body 3 days
3. Push/Pull/Legs adapted to frequency

Each option explains:

- why it fits;
- weekly frequency;
- approximate duration;
- main trade-offs.

### 4.2 Inspect plan

Before selecting:

- show plan structure;
- session names;
- typical duration;
- training-policy goal;
- broad exercise/movement structure;
- what can be customized.

### 4.3 Personalize

The user may replace disliked/unavailable exercises.

The product may warn:

> This exercise fills an important strength-specific role.

or:

> These options preserve similar hypertrophy intent.

The user remains final authority.

### 4.4 Activate

Selecting a plan creates the user's own plan instance/version.

The global curated source is not live-linked in a way that silently changes the user's active plan later.

Then Entrenar resolves to State B.

---

## 5. Create-my-own-plan journey

A knowledgeable user may create:

- plan name;
- session sequence;
- reusable templates;
- exercise intents;
- target sets/reps/time/distance;
- effort/rest targets where desired.

The flow should allow progressive detail.

The user must not need to fill every advanced field.

A simple custom workout can begin as:

- Bench Press — 3 × 8–10
- Row — 3 × 8–10
- Lateral Raise — 3 × 12–15

and gain RIR/rest/priority detail later.

---

## 6. Planned workout: pre-start state

The default pre-start card/screen should answer:

1. What am I doing?
2. How long will it take?
3. What matters most today?
4. Has anything changed that I should tell KeylorForge?

Example:

**Upper A**  
~60 min  
Priority: Bench Press  
Chest · Back · Delts · Arms

Primary:

> Start

Secondary:

> Adapt workout

Optional lightweight readiness input may be visible but must not become compulsory.

Example:

> How are you feeling today?  
> Low · Normal · Great

Default can remain “Normal / not specified”.

---

## 7. Adapt workout before starting

The user should not face a full questionnaire.

Ask only what changed.

Possible controls:

### Available time

- usual / 60 min
- 45 min
- 30 min
- custom

### Energy/readiness

- Low
- Normal
- Great

Optional.

### Equipment/context

- usual gym
- different gym
- limited equipment
- custom context

### Additional context

Optional, not required.

After changes, KeylorForge shows the adapted proposal.

Example:

> **Adapted to 35 min**  
> Preserved Bench Press and Row  
> Reduced accessory sets  
> Combined biceps/triceps as a superset  
> Estimated duration: 33–37 min

Actions:

- Use adapted workout
- Use original
- Edit manually

The explanation should mention meaningful changes, not every internal scoring detail.

---

## 8. Starting a workout

When the user taps Start:

1. create stable local session ID;
2. create `ACTIVE` Actual Workout Session locally;
3. snapshot training intent/provenance;
4. persist Active Session Agenda;
5. enqueue outbox mutation atomically;
6. start session timing;
7. navigate immediately to the live workout.

No network round-trip is required.

If sync fails, workout continues normally.

---

## 9. Live workout top-level screen

The live screen should prioritize action, not analytics.

Persistent/high-level elements may include:

- workout/session name;
- elapsed time;
- current exercise;
- progress through agenda;
- sync warning only when material.

Primary content is the current exercise.

Secondary navigation allows:

- see remaining workout;
- jump to another exercise;
- add exercise;
- adapt remaining workout;
- finish workout.

A long catalogue should not dominate the active screen.

---

## 10. Exercise card before first set

For the current exercise, show only immediately useful information.

Example:

**Bench Press**  
Target: 3 × 8–10 · RIR 2  
Rest: 2:30  
Last comparable session: 80 kg · 10 / 9 / 8

Suggested working load:

> 80 kg

Reason may be available inline/expandable:

> Last time you were inside the target range and did not yet complete the top of the range in all working sets.

### Optional supporting actions

- How to perform
- Change exercise
- Change equipment/machine
- Add warm-up set
- View recent history

Do not force the user to open instructional content.

---

## 11. Exercise instructions

From “How to perform”, provide concise usable content:

- setup;
- execution;
- short cues;
- common mistakes;
- relevant media when licensed/available.

The user should be able to return to the set screen immediately.

Do not bury logging under long educational content.

---

## 12. Warm-up flow

Warm-up sets are visually distinct from working sets.

Example:

Warm-up:
- 20 kg × 10
- 50 kg × 6
- 70 kg × 3

Working:
- target 80 kg × 8–10

Warm-ups:

- may be suggested from plan/user history later;
- can be added/removed easily;
- do not count as working-set volume;
- do not trigger normal progression conclusions.

Completing a warm-up is still actual historical set data when recorded.

---

## 13. High-frequency set row

For a conventional loaded rep exercise, one row should center on:

- load;
- reps;
- optional effort;
- complete action.

Use editable prefilled values.

Example:

`80 kg | 9 reps | RIR 2 | ✓`

The next row may prefill:

`80 kg | 8–10 | RIR 2`

### Key rule

The user should not retype “80 kg” for every set if the value is expected to remain the same.

### Other measurement types

Time:

`45 sec | effort optional | ✓`

Distance:

`500 m | time/effort where applicable | ✓`

Assisted:

`40 kg assistance | 8 reps | ✓`

The field labels must reflect load semantics.

---

## 14. Completing a set

On tap Complete:

1. validate locally;
2. persist completed set + outbox atomically;
3. mark row completed immediately;
4. start/advance rest-timer experience;
5. Decision Engine evaluates the new context;
6. UI either stays quiet or surfaces a meaningful next action.

Network state does not block steps 1–4.

---

## 15. RIR/RPE interaction

Effort capture should be useful without becoming annoying.

### User preference/experience

The user may choose:

- use RIR;
- use RPE;
- do not routinely track effort.

### Progressive introduction

Novices do not need RIR on day one.

The app may explain it when the user's plan begins using it.

### During live logging

Do not force an effort value on every set unless a specific program/test explicitly requires it.

Useful patterns:

- prefill last/target RIR;
- make editing one tap;
- ask only on working sets;
- ask more selectively when the Decision Engine needs clarification.

### Example selective prompt

If reps differ greatly from target and no effort was recorded:

> How hard was that set?  
> Easy · About right · Very hard

This may map to a coarse internal effort input without requiring advanced terminology.

---

## 16. Rest timer

After a working set:

- timer starts automatically when configured by the plan/user;
- user can dismiss, add/subtract time or ignore;
- logging remains available during the countdown.

The timer should not block navigation.

If the user closes/reopens the app, reconstruct remaining time from persisted timing data when practical.

### During rest

Show useful but quiet information:

- remaining rest;
- next target;
- previous completed set;
- meaningful recommendation if one exists.

Do not fill every rest period with coaching content.

---

## 17. Engine silence rule

If the set is within expected range and no action changes:

**Do not show a recommendation card.**

Example:

Target:

`80 × 8–10 @ RIR2`

Actual:

`80 × 9 @ RIR2`

Behavior:

- save;
- rest timer;
- next set stays at 80;
- no “Great job, AI recommends…” interruption.

This is the default successful loop.

---

## 18. Engine intervention rule

Surface a recommendation only when it changes a decision the user plausibly needs to make.

Examples:

- load should change;
- equipment changed;
- target likely needs adjustment;
- time is running out;
- repeated performance suggests recovery adaptation;
- substitution is required;
- recommendation confidence is limited and one question would materially help.

Recommendation format should be compact:

**Suggested next set: 75 kg × 8–10**  
Reason: Last set was much harder than the target effort.

Actions:

- Use suggestion
- Keep 80 kg
- Edit

No forced confirmation dialog.

---

## 19. Unexpectedly difficult set

Example:

Target:

`80 × 8–10 @ RIR2`

Actual:

`80 × 8 @ RIR0`

The app must not call the user “fatigued” from one set.

Possible behavior:

- show that effort was above target;
- suggest maintaining/reducing next load depending on equipment increments and context;
- preserve broader fatigue state unchanged unless other evidence converges.

If this is the first anomaly:

> That set was harder than intended. For the next set, keeping the load or stepping down one available setting are both reasonable.

The engine may abstain if evidence is weak.

---

## 20. Unexpectedly easy/strong set

Example:

`80 × 10 @ RIR5`

If the machine/bar has a valid next step, the engine may suggest it.

If next step is very large:

> The next setting is a large jump. Staying here and adding reps is the safer progression today.

The user can still choose differently.

---

## 21. Machine/equipment selection

### Default

If the user has a recent machine profile for this exercise in the current gym/context:

- preselect it;
- show last same-machine history.

### First use

Do not require technical setup.

Allow:

- use exercise;
- enter visible load;
- select kg/lb if not known;
- optionally save machine nickname.

Advanced metadata can be added later.

### Actionable native unit

If machine is in lb:

> 90 lb  
> ≈ 40.8 kg

The primary actionable number remains 90 lb.

---

## 22. Machine occupied before exercise

User taps:

> Change machine / equipment

Show:

1. known machines previously used for this exercise;
2. valid substitute exercises if appropriate;
3. manual/new machine option.

### Known alternate machine

If personal history exists:

> Cable B  
> Last here: 70 lb × 12 @ RIR2

Prefer this to a theoretical conversion from Cable A.

### New machine

Say explicitly:

> This machine may not feel equivalent to your usual one. We will not copy the previous stack number automatically.

Allow conservative/manual start.

---

## 23. Machine changes during the same exercise

If the user already completed sets on Cable A and moves to Cable B:

- completed Cable A sets remain unchanged;
- subsequent sets use Cable B context;
- history must remain resolvable per set.

The UI may display machine labels on affected rows when mixed-machine context exists.

Do not normalize them into a fake common kg number.

---

## 24. Exercise substitution

User taps:

> Replace exercise

Candidate list should indicate:

- recommended substitutes;
- why they fit;
- what changes.

Example:

**Dumbbell Bench Press**  
Preserves chest hypertrophy stimulus  
Not directly comparable to barbell strength history

For a strength-priority movement, the app may rank alternatives conservatively and explain loss of specificity.

The user may search/select another exercise manually.

Actual history records the exercise actually performed.

---

## 25. User jumps exercise order

The user may skip ahead because equipment is busy.

Behavior:

- allow another agenda exercise;
- preserve planned intent;
- mark skipped item as still remaining;
- do not treat it as omitted until session completion/adaptation removes it.

Exercise order in actual history should reflect what was performed.

---

## 26. Add exercise during planned workout

The user may add an unplanned exercise.

This becomes real workout history.

The engine may optionally flag:

> Added exercise is outside the original session.

No punishment.

It may later affect fatigue/plan interpretation.

---

## 27. Free workout journey

From Entrenar:

> Free workout

Immediately create an active session.

Do **not** ask first for:

- workout name;
- category;
- objective;
- template;
- plan assignment.

Initial screen:

**Free workout**  
Elapsed: 00:00  
`+ Add exercise`

The user selects an exercise and trains.

All normal live functionality remains available:

- previous history;
- machine context;
- set logging;
- rest timer;
- instructions;
- substitutions;
- offline persistence;
- recommendations when supported.

The lack of a plan does not make it second-class data.

---

## 28. Free workout completion

Summary may say:

**48 min · 5 exercises · 14 working sets**

Then:

> This workout overlaps with parts of your current plan.

Explain naturally:

> You completed substantial chest and triceps work today, so tomorrow's Push session may be adjusted.

Actions:

- Done
- Save as template
- View impact on next workout, when meaningful

Do not silently mark a plan step complete.

---

## 29. Time suddenly decreases mid-session

User chooses:

> I have 20 minutes left

The engine evaluates:

- completed work;
- remaining agenda;
- training goal;
- priorities;
- realistic rest/setup time.

Show a concise revised remainder.

### Strength example

> Keep final Bench set  
> Keep Row  
> Remove arm accessories

### Hypertrophy example

> Keep chest/back priority sets  
> Reduce one accessory set each  
> Superset biceps + triceps

Actions:

- Use adaptation
- Keep original
- Edit

Completed work is untouched.

---

## 30. Fatigue/recovery adaptation during session

The engine should not interrupt from one poor set.

If broader approved evidence converges, show a compact recommendation.

Example:

> Your performance has been below your recent comparable baseline across several exercises and your recent readiness has also been low. Consider reducing accessory volume today.

Actions:

- Reduce volume
- Keep workout
- Review changes

If user keeps workout, continue normally.

No repeated nagging.

---

## 31. Reported pain/discomfort

Pain/discomfort follows a conservative safety boundary, not the fatigue engine.

If user indicates pain:

- do not diagnose;
- do not tell them to push through;
- offer stop/reduce/substitute options;
- recommend professional assessment when symptoms are concerning/persistent.

The app may say:

> This exercise is causing discomfort. Stop if needed and choose another movement rather than forcing the planned set.

This is separate from ordinary “hard set” effort.

---

## 32. Offline/network loss

If network disappears:

- no blocking modal;
- active workout remains usable;
- sets continue saving locally;
- recommendations that require remote services may abstain/fallback;
- sync indicator may quietly reflect pending state.

Only surface a prominent message if the user tries an action that truly requires network or if unsynced state becomes materially important.

When connectivity returns:

- sync resumes opportunistically;
- same mutations are idempotent;
- normal session flow continues.

---

## 33. App close/restart during workout

On restart:

1. load local active session;
2. restore actual sets;
3. restore Active Session Agenda;
4. restore machine context;
5. reconstruct rest timer when practical;
6. restore pending sync state;
7. show **Continue workout**.

Do not ask:

> Do you want to recover your workout?

if local state already clearly proves an active session exists.

Recovery should feel normal, not exceptional.

---

## 34. App closed for a long time

An active session may remain active longer than expected.

On resume after an unusually long gap:

- preserve the session;
- do not auto-complete/cancel;
- show elapsed/gap context;
- allow:
  - Continue
  - Finish at earlier point / Finish now as supported
  - Cancel

Exact stale-session threshold and timing correction UX are provisional.

Never discard it automatically.

---

## 35. Sync conflict during active/history flow

Normal sync conflicts should be rare and not leak database language.

### Example: session completed on another device

Message:

> This workout was completed on another device while you continued adding sets here. Your local sets are safe.

Actions may include:

- Review local sets
- Add them to completed workout, when valid
- Keep separately, when supported
- Discard local changes

Exact resolution UX belongs to implementation.

### Principle

The conflict can remain unresolved without destroying local workout data.

---

## 36. Two active workouts from two devices

If two offline devices independently started sessions:

- server does not merge them automatically;
- both local histories remain safe;
- user is told there are two sessions competing for the one-active-session rule.

Resolution must avoid:

- silent deletion;
- fake chronological merge;
- random “last one wins”.

M3 may use a simple manual resolution screen.

---

## 37. Finish workout

Primary terminal action:

> Finish workout

Before completion, if meaningful, show a compact review:

- completed exercises;
- working sets;
- incomplete remaining agenda.

If there is unperformed planned work:

> 2 planned items remain.

Actions:

- Finish anyway
- Continue workout

No guilt-oriented wording.

A session with at least one completed set may finish early and still be valid history.

---

## 38. Cancel workout

Cancel is destructive relative to completed-training history.

If no sets were completed:

> Cancel workout?

Simple confirmation is enough.

If completed sets exist:

> You have completed 8 sets. Cancelling means this session will not count as a completed workout.

Offer:

- Finish workout instead
- Cancel anyway
- Keep training

“Finish workout instead” should be the safer/default alternative.

---

## 39. Removing the final set after completion

If editing history removes the last completed set:

- explain that the workout can no longer remain completed;
- require explicit confirmation;
- transition to cancelled/discarded-training semantics;
- recompute plan/attendance effects.

Do not leave an empty completed workout.

---

## 40. Completion summary

M3 summary closes the workout loop without becoming M4 analytics.

Show concise facts such as:

- duration;
- exercises performed;
- working sets;
- key plan/adaptation outcome;
- meaningful progression note.

Examples:

> **Upper A completed**  
> 56 min · 5 exercises · 16 working sets  
> Bench target completed  
> One accessory exercise removed due to time

or:

> **Free workout completed**  
> 48 min · 5 exercises · 14 working sets  
> This may affect tomorrow's Push recommendation

Possible actions:

- Done
- Save as template
- Add/edit note

Avoid large trend charts here.

---

## 41. Post-workout plan effect

After completion, the Decision Engine may recompute the next proposal.

### Planned workout completed normally

Advance plan sequence and incorporate actual performance.

### Planned workout finished early

Plan sequence may advance, but omitted work may influence the next proposal.

### Free workout

Do not consume a plan step automatically.

Evaluate actual overlap.

### Cancelled workout

Do not advance plan progress.

The user does not need to manually “fix the calendar”.

---

## 42. Rest-day override

If the plan recommends rest but user chooses training:

- allow it;
- start selected/free workout;
- after completion, recalculate next recommendation.

Do not show warnings implying rule-breaking unless there is a genuine recovery concern based on approved evidence.

---

## 43. Recommendation explanation interaction

Every material recommendation should support:

> Why?

This opens a concise explanation based on reason codes.

Example:

> You completed the top of your target range on this machine in the last comparable workout, and today's effort is still within target. The next available setting is 5 kg higher.

Do not expose hidden model reasoning or raw probabilities.

---

## 44. Confidence/uncertainty UX

Prefer qualitative language.

Examples:

**Strong basis**
> Your recent same-machine history supports this increase.

**Limited basis**
> This is a new machine, so the suggestion is conservative.

**Abstention**
> There is not enough comparable history here to recommend a load change confidently.

Never show:

> AI confidence 83.7%

unless a future validated product metric explicitly supports it.

---

## 45. Notification/noise guardrails

During a workout, do not produce repetitive celebratory notifications/cards after every set.

Useful live signals include:

- rest timer;
- meaningful target change;
- equipment conflict/adaptation;
- time adaptation;
- recovery recommendation;
- completion milestone.

Celebration/praise should be lightweight and not obstruct logging.

---

## 46. Failure handling

### Local write fails

This is material.

Do not show the set as safely completed if SQLite/outbox atomic persistence failed.

Offer retry and preserve typed input if possible.

### Remote sync fails

Set remains locally complete.

Do not roll it back.

### Recommendation service fails

Continue workout with deterministic/default behavior.

### Exercise content/media fails

Logging remains usable.

### Catalogue/API unavailable but active session data is local

Active workout remains usable with already persisted required exercise references/context.

---

## 47. Acceptance scenarios

The M3 journey is not accepted until the following scenarios can be walked end-to-end without contradiction.

### Scenario 1 — New user selects a plan

No plan -> Find plan -> minimal profile -> shortlist -> inspect -> activate -> next workout appears.

### Scenario 2 — Normal planned workout

Start -> warm-up -> working sets -> rest -> on-target silent progression -> finish -> summary -> next plan step.

### Scenario 3 — Short workout before start

60-minute plan -> user has 30 minutes -> goal-aware adaptation -> user accepts -> completes shortened session.

### Scenario 4 — Time collapses mid-session

Workout active -> 20 min remain -> remaining agenda adapted without rewriting completed sets -> finish.

### Scenario 5 — Free workout with a friend

Free workout -> add exercises live -> complete -> summary -> future plan may adapt -> optional Save as template.

### Scenario 6 — Occupied known machine

Usual Cable A occupied -> choose known Cable B -> see prior B history -> log native B load -> continue.

### Scenario 7 — New machine in another gym

Different gym -> unknown cable -> do not copy stack value blindly -> manual/conservative starting setting -> log RIR/result -> future history now exists.

### Scenario 8 — kg/lb machine

User prefers kg but machine is lb -> primary field shows lb -> convenience kg conversion -> next recommendation uses physically available lb setting.

### Scenario 9 — Unexpectedly poor set

One hard set -> no accumulated-fatigue diagnosis -> conservative next-set options -> user chooses.

### Scenario 10 — Accumulating fatigue

Multiple converging sessions/signals -> recovery recommendation -> user may accept or ignore -> no forced deload.

### Scenario 11 — Network loss

Lose network mid-workout -> continue logging -> local sets persist -> regain network -> idempotent sync -> no duplicates.

### Scenario 12 — App killed/reopened

Complete sets -> kill app -> reopen -> active session restored with agenda/sets/timer context -> continue.

### Scenario 13 — Finish early

Planned work remains -> Finish -> confirm -> completed valid session -> omitted work retained as unperformed intent -> next proposal can adapt.

### Scenario 14 — Cancel after work performed

Completed sets exist -> Cancel -> warning -> Finish instead offered -> explicit cancellation only if user insists.

### Scenario 15 — Same exercise, machine changes mid-exercise

Sets 1–2 Cable A -> sets 3–4 Cable B -> history preserves correct machine per set.

### Scenario 16 — Strength-specific substitution

Strength-priority Barbell Bench unavailable -> substitute options explain specificity cost -> actual substitute recorded -> plan/history do not pretend barbell work happened.

### Scenario 17 — Rest day override

Rest recommended -> user trains -> free/selected workout completes -> plan recalculates rather than penalizing.

### Scenario 18 — Multi-device active-session conflict

Two offline sessions -> server conflict -> both local datasets preserved -> user resolves; no silent merge/deletion.

### Scenario 19 — Completed-session correction

User edits wrong reps/load after completion -> raw history updates -> derived values later recompute -> plan/template history not rewritten.

### Scenario 20 — Delete final completed set

Completed workout with one set -> user removes it -> explicit warning -> workout can no longer remain completed -> derived completion effects reversed.

---

## 48. Journey state summary

Conceptually:

`ENTRENAR_ENTRY`

→ active workout? -> `CONTINUE_ACTIVE`

else active plan? -> `TODAY_PROPOSAL`

else -> `NO_PLAN_CHOICES`

From proposal:

`ADAPT? -> START -> ACTIVE_SESSION`

From free:

`START_FREE -> ACTIVE_SESSION`

Within active:

`exercise -> set -> local persistence -> rest -> decision -> next set/exercise`

with optional:

- substitution;
- machine change;
- time adaptation;
- fatigue adaptation;
- add exercise;
- reorder.

Terminal:

`FINISH -> COMPLETED -> SUMMARY -> NEXT_PROPOSAL`

or:

`CANCEL -> CANCELLED`

Network/sync state runs orthogonally and must not define whether the user can train.

---

## 49. What M3 must feel like

A successful M3 experience should feel like:

- the app knows where the user left off;
- previous useful information appears without searching;
- most sets take seconds to log;
- normal training is quiet;
- recommendations appear when they actually matter;
- the app understands that machines and units differ;
- plans survive real life;
- free workouts are not punished;
- losing signal is boring, not catastrophic;
- closing the app is recoverable;
- ending early is allowed;
- the user always remains in control.

---

## 50. Explicitly unresolved

Do not hard-code yet:

- final pixel layout;
- exact bottom-tab/navigation pattern;
- exact wording/localization;
- exact RIR widget;
- exact rest-timer notification mechanics;
- exact stale-active-session time threshold;
- exact summary visual design;
- exact plan-discovery questionnaire;
- exact conflict-resolution screen;
- exact recommendation card animation/presentation;
- exact number of taps for advanced machine-profile creation;
- exact accessibility implementation details, though accessibility remains required;
- exact premium gating of adaptive features.

---

## 51. Acceptance

This journey becomes M3 UX authority when the Product Owner confirms that it accurately represents the intended experience from opening Entrenar to leaving the gym.

Approval means agreement with:

- Entrenar state priority;
- no-plan/planned/rest/free paths;
- low-friction local-first logging;
- set/rest/decision loop;
- silence-by-default coaching;
- optional progressive RIR/RPE;
- machine-native equipment behavior;
- substitution/time/fatigue adaptation;
- offline/restart continuity;
- explicit finish/cancel semantics;
- compact completion summary;
- plan recalculation from actual history;
- conflict behavior that preserves local work;
- the 20 acceptance scenarios.

Approval does not authorize final UI visuals, SQL/API implementation or pricing.

