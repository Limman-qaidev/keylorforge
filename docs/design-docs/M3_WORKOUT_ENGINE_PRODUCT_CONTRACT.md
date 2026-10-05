# M3 Workout Engine — Product Contract

- Status: Accepted by Product Owner
- Milestone: M3 — Workout Engine
- Issue: #91
- Product authority: this document after approval/merge
- Architectural authorities: `docs/project-context/TECHNICAL_BLUEPRINT.md`, ADR-003
- Related product authority: `docs/project-context/PRODUCT_VISION.md`
- Related catalogue follow-up: #89
- Date: 2026-10-05
- Product Owner approval: 2026-10-05

## Purpose

This document turns the M3 product discovery into a durable product contract before database schemas, API contracts, mobile implementation, synchronization details, or implementation tickets are finalized.

M3 is the core of KeylorForge. Its purpose is not merely to provide a form for entering sets. It must establish the training model on which later history, analytics, personal records, groups, rankings, recommendations and social workout sharing can safely depend.

The central product promise is:

> KeylorForge understands what the user is trying to achieve, what they actually do in the gym, and the context in which they are training, then helps them decide what to do next without taking control away from them.

M3 must make a real workout easier to execute, record and adapt. It must not force real life to conform to a rigid training calendar.

## Status vocabulary

This contract uses the repository status vocabulary.

- **Accepted** — already established by an ADR, merged architecture, explicit Product Owner decision, or this contract once approved.
- **Product intent** — behavior M3 should preserve, while exact UX or algorithm details may still evolve.
- **Provisional** — strong candidate requiring dedicated design/research/validation before it becomes implementation authority.
- **Future** — intentionally outside M3 even if the architecture should preserve a path to it.

Implementation work must not silently promote a provisional item into an irreversible contract.

---

# 1. Product definition

## 1.1 What M3 is

**Product intent:** M3 is an adaptive, user-controlled workout engine.

It should help answer four questions during a real training session:

1. What should I do today?
2. How should I do it?
3. What should I attempt next?
4. What should change when today's reality differs from the plan?

M4 will answer the longer-horizon question:

5. Am I progressing over time?

M3 may use historical workout data to make decisions, but full history/progress analytics remain a later milestone.

## 1.2 What M3 is not

M3 is not:

- a generic AI chatbot attached to a workout logger;
- a rigid calendar that punishes missed sessions;
- an opaque routine generator;
- a nutrition/diet application;
- a social network;
- a rankings product;
- an advanced analytics dashboard;
- a medical diagnostic system;
- a complete periodization platform for every sport;
- a replacement for the user's judgment.

The workout core must become trustworthy before higher-level features depend on it.

---

# 2. Core product principles

## 2.1 The user is in control

**Accepted product principle:** KeylorForge recommends; the user decides.

The app may recommend a load, repetition target, exercise substitution, shortened session, recovery strategy or future session adjustment. The user must be able to accept, modify or ignore that recommendation without fighting the application.

The engine must never make ordinary training decisions feel mandatory merely because an algorithm produced them.

## 2.2 Important recommendations must be explainable

**Product intent:** a recommendation should normally answer “why?”

Bad:

> AI recommends 82.5 kg.

Better:

> You completed the upper end of the target range in all working sets last time while remaining near the target RIR, so a small load increase is reasonable.

The precise wording and explanation surface are separate UX work, but opaque recommendations are not the intended product.

## 2.3 Actual workout data is the source of truth

**Accepted:** planned work is not historical truth.

The plan may prescribe what should happen. The actual workout records what did happen.

The authoritative workout hierarchy remains conceptually:

`actual workout session -> workout exercises -> workout sets`

Derived progress, personal records, volume, attendance and rankings must remain reproducible from raw workout data.

## 2.4 The plan is guidance, not a prison

**Accepted product principle:** KeylorForge must not penalize a user for training outside their plan.

A workout performed with a friend, while travelling, in another gym, or simply because the user wants something different is still valid workout data.

The engine should understand what the user actually trained and allow that activity to affect later recommendations.

## 2.5 Real life may adapt the session without destroying the plan

**Product intent:** the app should preserve the intention of a plan when circumstances change.

Examples include:

- less time than expected;
- equipment unavailable;
- different gym;
- unexpected fatigue;
- unexpectedly strong performance;
- a user-reported discomfort;
- a spontaneous exercise substitution;
- a free workout that overlaps with the next planned workout.

The plan should survive deviation and be recomputed around reality rather than considered “broken.”

## 2.6 Recording beats recommending

**Accepted:** the ability to record a workout must survive the loss of network access and optional intelligence services.

A user must still be able to:

- start/continue a workout;
- add exercises;
- record/edit/remove sets;
- close/reopen the app;
- continue the active workout;

without needing a successful server round trip for every action.

ADR-003 remains authoritative for offline-first workout recording.

## 2.7 Intelligence must not add unnecessary friction

The user is in a gym, frequently between sets and often operating one-handed.

M3 should not turn every set into a questionnaire.

Context collection must be:

- optional when possible;
- progressive rather than front-loaded;
- reusable from defaults;
- interruptible;
- designed around minimal interaction during a set.

---

# 3. Training identity and progressive profiling

## 3.1 A single “goal” field is insufficient

**Product intent:** KeylorForge distinguishes at least:

### Training goal

What adaptation the training is primarily trying to produce.

Initial policy families:

- hypertrophy;
- strength;
- muscular endurance;
- general fitness.

Future sport-specific policies may be added later.

### Body goal

The body-composition context in which the training occurs.

Initial candidates:

- gain mass;
- maintain;
- lose fat;
- recomposition.

This prevents “lose weight” or “definition” from being treated as if they uniquely determine a resistance-training method.

A valid profile may therefore resemble:

`training goal = hypertrophy`
`body goal = fat loss`

rather than treating “fat loss” as the workout policy itself.

## 3.2 Primary and secondary objectives

**Product intent:** a user may have more than one meaningful objective.

Examples:

- primary hypertrophy, secondary strength;
- primary fat loss, secondary strength preservation;
- primary general fitness, secondary muscular endurance.

The exact weighting model is provisional and belongs in the Training Goal Policies contract.

## 3.3 Goals change over time

**Product intent:** changing a goal must not rewrite historical meaning.

A user may move from hypertrophy to strength or from maintenance to fat loss.

Future analytics should be able to understand that different training periods occurred under different goals.

Therefore, goal history should be preserved conceptually rather than treated as an eternally mutable profile label with no temporal meaning.

Exact persistence belongs in the workout/domain contract.

## 3.4 Progressive profiling

**Accepted product principle:** do not require every potentially useful field during onboarding.

KeylorForge should ask for information when it becomes useful.

Likely early inputs:

- primary training goal;
- experience level;
- approximate training frequency.

Later, when context makes the question relevant:

- usual workout duration;
- available equipment;
- muscle priorities;
- preferred exercises;
- RIR/RPE usage;
- menstrual/symptom context;
- other recovery inputs.

The user should be able to start using the product before creating a perfect athlete profile.

---

# 4. Plans, templates, today's proposal and actual workouts

M3 must distinguish concepts that other workout applications often collapse together.

## 4.1 Training Plan

A Training Plan expresses medium-term training intent.

It may contain:

- a sequence or structure of reusable sessions;
- recommended weekly frequency;
- target muscles/movement patterns;
- progression intent;
- goal-specific policy context.

**Product intent:** a plan should normally behave more like an ordered training strategy than an inflexible weekday calendar.

Preferred days may exist, but missing Monday should not automatically force the user to skip Monday's training and perform Tuesday's workout.

## 4.2 Workout Template

A reusable workout configuration.

Examples:

- Push;
- Pull;
- Legs;
- Upper A;
- Lower B;
- a custom workout created by the user.

Templates may belong to a plan or exist independently.

## 4.3 Today's Proposal

**Product intent:** today's proposal represents what KeylorForge recommends now, given:

- the user's plan;
- recent actual training;
- goal policy;
- available time;
- equipment/context;
- recovery/fatigue signals;
- user modifications.

It is not yet workout history.

It may be regenerated/adapted until a real workout begins.

## 4.4 Actual Workout Session

An actual workout is what really happened.

It may originate from:

- today's planned proposal;
- an adapted planned proposal;
- a different template;
- a free workout.

All origins produce the same authoritative workout-history structure.

The session may retain provenance such as planned/adapted/free, but provenance must not make free-workout data second-class.

## 4.5 Active session has priority

**Product intent:** if a workout is in progress, the Entrenar destination should prioritize continuing it.

The app should not make the user navigate back through plans or the exercise catalogue to rediscover an active workout.

Local persistence must allow an active session to survive process/app restarts.

---

# 5. Entrenar entry states

The exact visual design belongs in the M3 User Journey and mobile design work. The functional states are contractual.

## 5.1 New user without a plan

Entrenar should not pretend a workout has already been scheduled.

The product should offer clear paths such as:

- find/select an appropriate plan;
- create a custom plan/workout structure;
- start a free workout;
- explore the exercise catalogue.

## 5.2 User with a plan

Entrenar should foreground the next recommended workout/today's proposal.

Secondary paths must remain visible enough to support:

- adapt today's workout;
- choose another workout;
- start a free workout;
- inspect/manage the plan.

## 5.3 User choosing a rest day workout

A planned rest day must not behave as a lockout.

The app may explain the next recommended session/rest context but still permit:

- training now;
- free workout;
- choosing another workout.

Future recommendations should account for what the user actually did.

## 5.4 User with an active workout

Continuing the active workout is the primary action.

---

# 6. Plan selection and creation

## 6.1 Predefined plans

**Product intent:** new users should be able to select from curated plans appropriate to their goals rather than needing to create everything from scratch.

Initial plan selection may use:

- training goal;
- experience;
- days/frequency;
- typical available time;
- available equipment.

The product should prefer a small set of defensible recommendations with explanations over an unstructured library of hundreds of routines.

## 6.2 Curated before unconstrained generation

**Product intent:** initial predefined plans should be authored/reviewed and versioned.

M3 should not depend on an unconstrained AI model inventing entire workout programs with no deterministic policy boundary.

## 6.3 Custom plans and workouts

A knowledgeable user must be able to define their own reusable workouts and plan structure.

The engine may offer substitutions or warn when a modification substantially changes the intended stimulus, but the final choice remains the user's.

## 6.4 Free workout

**Accepted product requirement:** M3 supports free workouts.

A user can enter the gym with no intention of following a KeylorForge plan and start logging immediately.

Typical cases:

- training with a friend;
- travelling;
- spontaneous session;
- experimenting with exercises;
- intentionally departing from the current plan.

A free workout:

- records through the same workout engine;
- contributes to history;
- can affect future plan recommendations;
- may later be saved as a reusable template.

The app must not shame or penalize the user for exercising outside the plan.

---

# 7. Time-aware training

## 7.1 Available time is first-class context

**Accepted product intent:** M3 must support the case where the user has less time than originally expected but still wants to train.

Example:

A planned 65-minute chest session may need to become a useful 30-minute session.

## 7.2 Preserve intent, not literal exercise count

A shortened workout should not simply remove the bottom half of the exercise list.

The adaptation policy should consider:

- training goal;
- highest-priority exercises/movements;
- muscle/stimulus coverage;
- effective working sets;
- required rest;
- exercise setup/transitions;
- current fatigue;
- practical use of compatible supersets where appropriate.

Example policy difference:

- strength may preserve the primary lift and sacrifice accessories;
- hypertrophy may preserve useful muscle stimulus while reducing accessory volume or reorganizing work;
- general fitness may prioritize doing a coherent shorter session over maintaining a perfect original structure.

Exact algorithms belong in Training Goal Policies and Decision Engine contracts.

## 7.3 Time can change mid-session

**Product intent:** adaptation is not limited to the start of a workout.

If a user unexpectedly loses time after training has begun, the engine should be able to reprioritize the remaining work while preserving completed sets as immutable historical reality.

---

# 8. Context-aware training

## 8.1 Context of today

The app may use lightweight context such as:

- available time;
- perceived energy/readiness;
- gym/equipment context;
- user-reported discomfort that affects exercise choice;
- optional menstrual/symptom context.

The app should default to the user's normal context and make “today is different” easy to express.

## 8.2 Do not turn readiness into a compulsory survey

**Product intent:** routine use must not require a long pre-workout questionnaire.

A minimal interaction such as low / normal / high energy may be sufficient initially.

More detailed recovery data can remain optional.

## 8.3 Context can change while training

The engine should respond to actual session events, including:

- equipment becoming unavailable;
- a set being unexpectedly difficult/easy;
- the user changing an exercise;
- session time shrinking;
- the user choosing to stop an exercise.

---

# 9. Menstrual-cycle and symptom context

## 9.1 No gender-based training policy

**Accepted product principle:** KeylorForge must not implement a simplistic “female training mode” or universal phase-based intensity rules.

The base training policy is determined by the user's actual training goal and context.

## 9.2 Optional personal context

**Product intent:** users who want to may allow menstrual-cycle and symptom information to contribute to personalized recommendations.

The system should prefer personal longitudinal response over population stereotypes.

Example future behavior:

> Across your recent cycles, you have repeatedly reported higher fatigue and shown lower performance during these days. A slightly lower-volume session may be reasonable today.

This must remain a recommendation, not a diagnosis.

## 9.3 Privacy

Menstrual/symptom data is sensitive personal context.

Any implementation must be:

- explicit opt-in;
- minimal;
- clearly explain why data is requested;
- removable;
- excluded from advertising targeting;
- handled under a dedicated privacy/security review.

Exact storage/retention rules are not defined by this product contract.

---

# 10. Exercise Intelligence

M2 created a canonical exercise catalogue. M3 must begin turning it into a useful training knowledge layer.

## 10.1 Enrichment intent

A useful exercise entity should eventually be able to express more than name + muscle + equipment.

Relevant concepts include:

- concise purpose/description;
- setup/execution;
- short cues;
- common mistakes;
- movement pattern;
- unilateral/bilateral semantics;
- measurement type;
- load-entry semantics;
- muscle roles;
- equipment requirements;
- related variants;
- substitution relationships;
- difficulty/skill context;
- media/illustration when licensing and quality permit.

Exact fields belong in the Exercise and Equipment Contract.

## 10.2 Related is not equivalent

A barbell bench press, dumbbell press, Smith press and plate-loaded chest press may all train similar muscles while remaining non-equivalent performance measurements.

The catalogue must preserve distinctions needed for:

- sensible substitutions;
- progression;
- history;
- analytics;
- later rankings.

## 10.3 Alias/name curation

Issue #89 must be addressed before future analytics/rankings assume that every catalogue ID is a distinct comparable movement.

M3 may record workouts against stable exercise IDs, but exercise equivalence/alias policy must not be ignored indefinitely.

---

# 11. Equipment-aware progression

## 11.1 Nominal load is contextual

**Accepted product principle:** displayed machine weight is not universally comparable across machines.

A set should be able to retain enough context to distinguish:

- exercise;
- actual machine/equipment instance or profile when known;
- unit;
- load setting;
- relevant configuration.

The precise database model is deferred.

## 11.2 Do not invent a universal “effective kg”

Pulley systems, cams, mechanical advantage, friction and machine geometry can make nominal stack values behave differently.

KeylorForge should not create false precision by pretending every machine can be converted into one universally comparable effective mass.

The most trustworthy record is often:

> on this machine/configuration, the user selected this load and achieved this performance.

## 11.3 Preserve original units

If a machine is labelled in pounds, the system should be able to record the original pound value even if the user's preferred display unit is kilograms.

The UI may display a convenience conversion, but the next time the user faces the same stack the original machine setting should remain obvious.

## 11.4 Available increments matter

**Accepted product principle:** the engine must not recommend a load that the real equipment cannot select.

A machine profile may eventually express an explicit sequence of selectable loads rather than assuming a universal +2.5 kg increment.

If the next physical increment is too large, the policy may choose another progression mechanism such as:

- additional repetitions;
- changed target range;
- changed set count where appropriate;
- delayed load increase.

The exact choice depends on goal policy.

## 11.5 Load semantics differ by equipment

The system must eventually distinguish cases such as:

- dumbbell load per implement;
- total barbell load;
- selectorized machine stack setting;
- plate-loaded machine convention;
- assisted exercise where more displayed assistance means lower effective difficulty;
- bodyweight plus/minus assistance or external load;
- time/distance-based work.

The exercise/equipment contract must define these semantics before workout persistence is finalized.

## 11.6 Personal calibration can be more useful than theoretical conversion

**Product intent:** when the user has enough history on two different machines for the same/compatible movement, KeylorForge should prefer the user's observed performance relationship over a naive mechanical conversion.

Example:

- Cable A: setting 45 kg -> 12 reps @ RIR 2
- Cable B: setting 70 lb -> 12 reps @ RIR 2

The product may use that personal history to seed future recommendations on Cable B.

This is not a claim that the two machines are physically equivalent.

## 11.7 Unknown machine calibration

**Provisional product direction:** when moving to an unknown machine, KeylorForge may support a conservative calibration flow rather than copying the last nominal load from another machine.

Exact calibration policy belongs in the Decision Engine / Exercise and Equipment contracts.

---

# 12. Training Goal Policies

This product contract establishes the policy families but does not define all numeric rules.

A separate `M3_TRAINING_GOAL_POLICIES.md` must be approved before progression/fatigue automation is implemented.

## 12.1 Hypertrophy policy family

Primary intent:

- accumulate useful, recoverable muscle stimulus;
- progress through appropriate combinations of repetitions, load and volume;
- manage proximity to failure;
- preserve recovery.

Expected important inputs include:

- working sets per muscle;
- repetition/load performance;
- target ranges;
- RIR/RPE where used;
- frequency/distribution;
- recovery/fatigue trend.

The engine must not treat “more load every workout” as the only valid progression.

## 12.2 Strength policy family

Primary intent:

- improve performance in prioritized movements/variants;
- preserve exercise specificity where important;
- manage high-load performance and recovery.

When session time is reduced, a strength policy may preserve the primary lift at the expense of accessory work.

## 12.3 Muscular-endurance policy family

Primary intent:

- improve the ability to sustain/repeat work.

Progression may depend more heavily on:

- repetitions;
- duration;
- density/rest;
- repeated-effort performance;
- distance for compatible exercises.

Exact prescriptions remain provisional.

## 12.4 General-fitness policy family

Primary intent:

- consistency;
- broad strength/capacity;
- practical adherence.

This policy should normally tolerate real-life schedule variation particularly well.

The system should prefer a useful shortened session over treating a non-perfect session as failure.

## 12.5 Body-goal modifiers

Body goals modify interpretation and recommendation rather than selecting an entirely separate exercise engine.

Examples:

- during deliberate fat loss, maintaining strength/performance may itself represent a successful result;
- gaining mass may allow different volume-progression decisions if recovery is good;
- recomposition may require longer evaluation windows and conservative interpretation of short-term noise.

Exact behavior belongs in Training Goal Policies.

---

# 13. Fatigue, recovery and deloads

## 13.1 The engine must know when not to push harder

**Accepted product intent:** M3 must support accumulated-fatigue/recovery reasoning.

A training engine that only knows how to add load or volume is incomplete.

## 13.2 No single-signal fatigue decisions

**Accepted principle:** one bad set, one bad workout, one poor night of sleep, or one low-energy response must not automatically trigger a deload.

The engine should look for converging trends.

Potential signals include:

### Objective/session signals

- repeated performance decline on comparable work;
- increasing RPE / decreasing RIR for similar work;
- inability to meet expected targets across sessions;
- declining completed volume;
- repeated spontaneous load reductions;
- abandoned exercises/sets;
- worsening performance across multiple exercises rather than one isolated movement.

### Optional subjective context

- perceived energy;
- recovery;
- soreness;
- sleep;
- motivation/stress;
- symptoms/cycle context.

The exact signal set and thresholds remain provisional.

## 13.3 Fatigue is an estimate, not a diagnosis

The app should avoid false precision such as “Fatigue = 83.7%” unless a future validated metric actually supports such interpretation.

Prefer understandable states/reasons such as:

- normal;
- watch;
- accumulating fatigue;
- recovery recommended.

Names and thresholds remain provisional.

## 13.4 Escalating intervention

**Product intent:** the engine should not jump from “poor session” directly to “take a deload week.”

Conceptual intervention ladder:

1. no change;
2. pause progression / maintain;
3. adapt today's session;
4. reduce stress across several workouts;
5. recommend a deload/recovery period.

## 13.5 Deloads are goal-aware and not universal calendar rules

M3 must not hard-code “every N weeks = deload” for every user.

A deload may be:

- explicitly programmed as part of a plan;
- suggested from accumulated evidence.

It normally means reducing training stress, not necessarily stopping training completely.

How volume, load, exercise specificity and effort change depends on the training goal.

## 13.6 Future distinction from tapering

Sport/strength tapering and general recovery deloads must not be assumed to be identical concepts.

Advanced competition preparation remains outside initial M3 scope.

---

# 14. During-session adaptation

## 14.1 M3 is a feedback loop

The intended experience is:

`proposal -> set performed -> result recorded -> context updated -> next decision`

The engine should be capable of responding to what actually happens during the workout.

## 14.2 A recommendation can change between sets

Possible reasons:

- repetitions differ significantly from target;
- RIR/RPE differs from target;
- available load increments make the original progression impractical;
- exercise/machine changed;
- fatigue signal emerges;
- user has less remaining time;
- user explicitly rejects the previous recommendation.

## 14.3 The user's override becomes information

If the user repeatedly ignores certain recommendations, that may be relevant future personalization data.

However, the system must not interpret every override as an error by the user.

Learning/feedback behavior belongs in the Decision Engine contract.

---

# 15. Set and workout interaction principles

Detailed screen behavior belongs in the M3 User Journey, but these functional requirements are established.

## 15.1 Common set entry must be fast

The dominant logging flow must support minimal interaction.

The product should reuse sensible prior values/defaults when appropriate rather than requiring full re-entry every set.

## 15.2 Set measurements must remain flexible

The existing product intent remains:

- load where meaningful;
- repetitions;
- duration;
- distance;
- RIR;
- RPE where supported;
- set type;
- completion state;
- comments/notes where appropriate.

Not every field applies to every exercise.

## 15.3 Warm-up and working sets are semantically different

**Product intent:** M3 must distinguish warm-up/approach work from working sets sufficiently that later analytics do not treat all sets as equivalent.

Other set types such as drop/back-off/assisted work require dedicated domain design before final enumeration.

## 15.4 Rest timing belongs to the live workout experience

A basic rest timer is considered part of executing a workout rather than purely a post-MVP analytics feature.

Advanced rest programming remains subject to the goal-policy/user-journey contracts.

---

# 16. Offline-first and synchronization boundary

ADR-003 remains authoritative.

## 16.1 Required M3 user behavior

The user must be able to continue recording during poor/no connectivity.

Local workout actions should persist before remote synchronization.

An app/process restart must not erase an active workout.

## 16.2 Local success versus remote success

The UI must not pretend that remote synchronization happened when only local persistence succeeded.

However, ordinary set logging should not make remote synchronization visually disruptive when everything is healthy.

## 16.3 M3 versus M6

M3 must establish a correct synchronization foundation, including the product need for:

- client-stable identifiers;
- retryability;
- observable sync state;
- idempotency;
- defined conflict semantics for M3 operations.

M6 — Robust Offline Sync will mature the broader synchronization experience and harder conflict cases.

“Offline sync comes later” must not be used to justify online-only set recording in M3.

---

# 17. Decision engine and AI boundary

## 17.1 KeylorForge owns the domain

**Accepted product principle:** an AI model is not the Workout Engine.

The KeylorForge domain must determine:

- valid actions;
- physical equipment constraints;
- user permissions;
- safety/product guardrails;
- training policy boundaries;
- which candidate decisions may be considered.

A decision model may help rank/select among valid candidates.

## 17.2 Example boundary

The domain may generate candidates such as:

- keep current load;
- increase to the next physically available load;
- reduce one load step;
- add repetitions;
- end the exercise.

A model may help assess which candidate best fits the current context.

The model must not invent impossible equipment settings or bypass domain rules.

## 17.3 Laya

**Provisional:** Laya is a candidate decision model for selected ranking/choice problems.

Potential uses may include:

- choosing among valid next-set strategies;
- ranking valid exercise substitutions;
- choosing among safe adaptation strategies;
- helping select an appropriate curated plan;
- selecting among fatigue/recovery interventions generated by the domain.

Before implementation, a dedicated technical evaluation must establish:

- suitability/quality on KeylorForge decision tasks;
- multilingual behavior where relevant;
- model/runtime/licensing constraints;
- infrastructure cost;
- latency;
- privacy implications;
- calibration/reliability;
- fallbacks when unavailable.

This contract does not commit M3 to Laya.

## 17.4 Confidence and abstention

**Product intent:** the intelligent layer should be allowed not to make a strong recommendation when evidence is weak.

A low-confidence situation should prefer:

- maintaining the existing plan;
- asking a minimal clarifying question where useful;
- offering options;
- explicitly saying that there is insufficient basis for a confident adjustment;

rather than fabricating certainty.

## 17.5 Offline behavior

Optional AI-assisted decisions must not be a dependency for basic workout recording.

Offline users must still be able to train.

---

# 18. Free and Premium product boundary

Exact pricing and packaging are not part of this contract.

The strategic boundary is.

## 18.1 Free principle

**Product intent:** Free must be a genuinely useful workout product.

The product should not charge simply for the right to record normal training.

Expected Free capabilities include, subject to later packaging review:

- workout logging;
- free workouts;
- offline recording;
- exercise catalogue access;
- basic exercise guidance;
- plans/templates at a useful baseline;
- basic rest timer;
- access to the user's own core workout history;
- manual exercise/workout adaptation;
- core unit handling.

The product should avoid arbitrary limits such as a tiny monthly set allowance that discourage consistent logging.

## 18.2 Premium principle

**Product intent:** Premium sells deeper understanding, adaptation and optimization.

Candidate Premium value:

- personalized progression recommendations;
- context-aware session adaptation;
- intelligent equipment substitutions;
- advanced plan adaptation;
- recovery/fatigue-driven recommendations;
- individualized machine calibration assistance;
- deeper longitudinal analysis;
- more advanced planning;
- explainable decision assistance.

The exact split may change after product testing.

## 18.3 Guiding commercial statement

> Free lets you train and record properly. Premium helps KeylorForge understand and adapt the training with you.

This is a product principle, not marketing copy that must be used verbatim.

## 18.4 Ads

**Product direction:** avoid interruptive advertising in the live workout flow.

Alternative monetization can be considered later, but the session-recording experience should not be compromised by disruptive ads.

---

# 19. Privacy and trust

## 19.1 Minimum necessary context

Collect context because it improves an explicit user-facing function, not because it might be useful someday.

## 19.2 Sensitive context

Health-adjacent/symptom/cycle information requires dedicated privacy/security review before implementation.

## 19.3 Recommendations are not medical advice

The engine may adapt ordinary exercise programming from training data and user context.

It must not diagnose injury, hormonal conditions, overtraining syndrome, eating disorders or other medical conditions.

Medical-risk boundaries require a separate safety review when detailed readiness/injury features are designed.

---

# 20. M3 user value and differentiation

No single feature is assumed to be globally unique.

The intended differentiation is the system combination:

- excellent low-friction workout logging;
- richer exercise knowledge;
- user-specific equipment/machine context;
- flexible plans and first-class free workouts;
- time-aware adaptation;
- context-aware adaptation;
- goal-specific progression;
- recovery-aware decision-making;
- explainable recommendations;
- personal-history-based learning;
- offline-first reliability;
- user control.

The product thesis is:

> KeylorForge should adapt the workout to the user's real life without losing sight of the user's goal.

---

# 21. Explicit M3 non-goals

Unless a later product decision changes scope, M3 does not need to deliver:

- full M4 history/analytics dashboards;
- group rankings;
- muscle ranking methodology;
- social posts/media;
- Garmin / Health Connect / Apple Health integrations;
- nutrition tracking;
- automated calorie/macronutrient plans;
- medical guidance;
- global exercise-performance comparison;
- advanced competition peaking/tapering systems;
- unrestricted conversational AI coach;
- highly complex multi-month program generation;
- every possible sport or training modality.

M3 should preserve future extensibility without attempting to build the entire product roadmap at once.

---

# 22. Required follow-up contracts before final implementation backlog

This document intentionally does not define all implementation details.

Before final M3 implementation tickets are considered authoritative, the following should be designed/reviewed:

## 22.1 Training Goal Policies

Proposed file:

`docs/design-docs/M3_TRAINING_GOAL_POLICIES.md`

Must define, at product-policy level:

- hypertrophy;
- strength;
- muscular endurance;
- general fitness;
- body-goal modifiers;
- progression;
- plateau handling;
- fatigue response;
- deload behavior;
- variables that are safe to automate versus only recommend.

## 22.2 Exercise and Equipment Contract

Proposed file:

`docs/design-docs/M3_EXERCISE_AND_EQUIPMENT_CONTRACT.md`

Must define:

- exercise intelligence fields;
- movement/variant relationships;
- substitutions;
- load semantics;
- equipment/machine identity;
- unit handling;
- increment sequences;
- assisted/bodyweight semantics;
- personal machine calibration;
- #89 alias/equivalence policy.

## 22.3 Workout Domain Contract

Proposed file:

`docs/design-docs/M3_WORKOUT_DOMAIN_CONTRACT.md`

Must define conceptual entities and state machines for:

- Training Plan;
- Workout Template;
- Today's Proposal;
- Actual Workout Session;
- Workout Exercise;
- Workout Set;
- active/completed/cancelled states;
- set types;
- provenance;
- session recovery;
- what becomes immutable history.

This contract must precede SQL schema design.

## 22.4 Decision Engine Contract

Proposed file:

`docs/design-docs/M3_DECISION_ENGINE_CONTRACT.md`

Must define:

- deterministic domain rules;
- candidate generation;
- recommendation authority;
- model/AI boundary;
- confidence/abstention;
- explanation contract;
- feedback/learning;
- Laya evaluation criteria;
- fallback behavior.

## 22.5 M3 User Journey

Proposed file:

`docs/design-docs/M3_USER_JOURNEY.md`

Must walk through real gym use from opening the app to ending the session.

At minimum it should exercise:

1. new user with no plan;
2. normal planned workout;
3. shortened workout;
4. free workout;
5. occupied equipment/substitution;
6. different machine/unit/increment profile;
7. different gym;
8. network loss/recovery;
9. unexpectedly poor performance;
10. unexpectedly strong performance;
11. accumulating fatigue/recovery adaptation;
12. app termination/restart during an active workout.

The user journey should explicitly design the high-frequency micro-loop:

`perform set -> record -> rest -> assess -> next set`

before mobile implementation begins.

---

# 23. Decisions still intentionally unresolved

The following are not settled by this contract and must not be guessed during implementation:

- exact onboarding questions/order;
- exact plan library;
- exact goal taxonomy beyond the initial families;
- precise body-goal representation/history;
- exact training-goal numeric policies;
- exact fatigue thresholds/scoring;
- exact deload prescriptions;
- exact exercise substitution ranking;
- exact machine-profile data model;
- exact automatic machine-calibration logic;
- exact set-type enumeration;
- exact session-state machine;
- whether more than one active workout can exist;
- exact cancel/discard semantics;
- exact workout sync/conflict protocol;
- exact Free/Premium packaging and price;
- whether Laya is adopted;
- where any decision model is hosted;
- exact UI surfaces and wording.

These questions should be resolved in the appropriate follow-up contract rather than opportunistically inside implementation PRs.

---

# 24. M3 Product Contract acceptance criteria

This contract is ready to become M3 product authority when the Product Owner confirms that it captures the intended product.

Approval means agreement with the product principles and scope, not approval of every future algorithm.

After approval:

1. merge this document;
2. create the follow-up design-contract work in dependency order;
3. design the full M3 user journey;
4. only then derive the implementation backlog;
5. keep implementation issues traceable to an approved contract.

No database migration, API contract or workout implementation should be treated as final merely because it was convenient to code before these domain decisions were made.
