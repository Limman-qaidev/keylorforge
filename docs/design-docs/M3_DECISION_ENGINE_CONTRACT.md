# M3 Decision Engine Contract

**Status:** Draft for Product Owner review  
**Milestone:** M3 — Workout Engine  
**Issue:** #99  
**Parent authorities:** `M3_WORKOUT_ENGINE_PRODUCT_CONTRACT.md`, `M3_TRAINING_GOAL_POLICIES.md`, `M3_EXERCISE_AND_EQUIPMENT_CONTRACT.md`, `M3_WORKOUT_DOMAIN_CONTRACT.md`  
**Date:** 2026-10-08

## 1. Purpose

This contract defines how KeylorForge turns approved domain state into an explainable recommendation.

The central architecture is:

`context -> hard constraints -> valid candidates -> evaluation/ranking -> abstention gate -> recommendation -> user decision -> observed outcome`

The most important invariant is:

> Models do not define what KeylorForge is allowed to do. The domain defines valid actions first.

The Decision Engine may recommend. It may prefill low-risk UI values where explicitly allowed. It does not own workout history and may never silently rewrite performed work.

This contract does not define final SQL, API endpoints, model hosting, synchronization protocol or final mobile layouts.

---

## 2. Decision classes

M3 should treat the following as distinct decision families.

### 2.1 Plan selection

Examples:

- rank a small set of curated plans;
- explain why one plan fits the user's stated goal/frequency/equipment better.

The engine selects among approved curated candidates; it does not invent an unrestricted program.

### 2.2 Today's session adaptation

Examples:

- preserve original session;
- shorten to available time;
- reduce low-priority volume;
- choose another valid plan session;
- leave unchanged because evidence is insufficient.

### 2.3 Exercise substitution

Examples:

- keep prescribed exercise;
- choose one of a small set of domain-approved substitutes;
- decline to recommend a substitute.

### 2.4 Next-set decision

Examples:

- keep load;
- increase to next valid equipment setting;
- reduce load;
- adjust target reps;
- stop exercise;
- continue as planned.

### 2.5 Recovery/fatigue intervention

Examples:

- continue normally;
- hold progression;
- adapt today's remaining work;
- recommend reduced stress across sessions;
- recommend a deload/recovery period.

### 2.6 Next-session / plan-continuation decision

Examples:

- continue to next sequence step;
- repeat/adjust a step because actual work materially differed;
- recommend rest/recovery;
- account for a free workout without pretending it was a planned one.

These families may share infrastructure but require different candidate generators and evidence rules.

---

## 3. Decision Context

Every recommendation is evaluated against a bounded context snapshot.

Potential context includes:

### User/training intent

- primary user outcome;
- primary training policy;
- optional secondary training policy;
- body-goal modifier;
- experience/policy level;
- user preferences/dislikes where relevant.

### Plan/prescription

- active plan/version;
- current Plan Step;
- template/prescription;
- priority movements/muscles;
- target sets/reps/time/distance;
- target effort/rest where available.

### Historical evidence

- recent comparable completed sets;
- same-exercise performance;
- same-machine performance;
- plan adherence;
- repeated fatigue/recovery trends;
- previous recommendations and user responses where relevant.

### Today context

- available time;
- current gym/equipment;
- optional readiness/energy;
- optional symptom context;
- user-declared constraints.

### Active-session state

- completed work;
- remaining Active Session Agenda;
- elapsed/remaining practical time;
- current exercise;
- current machine/configuration;
- latest actual set result;
- user edits/overrides.

### Equipment constraints

- native unit;
- available load sequence;
- load semantics;
- assistance direction;
- machine/profile/configuration;
- known personal calibration evidence.

### Data-quality context

- evidence count;
- comparability quality;
- missing fields;
- stale context;
- whether the user changed machine/exercise or edited the latest set.

The engine must distinguish “unknown” from a neutral/normal value.

---

## 4. Context snapshot and staleness

A recommendation is only valid for the context in which it was calculated.

A decision should conceptually have a `context_version` / fingerprint.

Material events invalidate or require recomputation, including:

- completing/editing/removing a set;
- changing exercise;
- changing machine/configuration;
- changing available time;
- changing today's readiness/context;
- manually changing the remaining agenda;
- ending/cancelling the session.

The UI must not present a stale recommendation as current merely because it was calculated moments earlier.

---

## 5. Hard constraints

Hard constraints are deterministic and non-overridable by optional model ranking.

Examples:

### Physical/equipment constraints

- recommended load must physically exist when the load sequence is known;
- native unit/load semantics must be respected;
- assistance direction must not be inverted;
- a model cannot invent 47.5 kg on a machine that only offers 45 and 50.

### Domain/history constraints

- completed sets are not automatically rewritten;
- actual exercise/machine remains what was actually performed;
- a recommendation may change remaining agenda only;
- cancelled sessions are not treated as completed.

### Goal-policy constraints

- strength-priority specificity cannot be silently discarded as if any same-muscle substitute were equivalent;
- body goals modify policy but do not replace the training-policy dimension;
- fatigue decisions obey the no-single-signal rule.

### Product/safety constraints

- no medical diagnosis;
- no menstrual-phase-only prescription;
- no forced rest;
- no calorie/macronutrient prescription;
- no recommendation to deliberately train through reported pain/discomfort.

If a user reports pain/discomfort material to an exercise, the engine may conservatively suggest stopping, reducing, or substituting and can recommend professional assessment where appropriate; it must not diagnose the cause.

### Permission/control constraints

User-locked/manual choices must not be silently overridden.

A hard constraint failure removes a candidate before any scorer/model sees it.

---

## 6. Candidate generation

Each decision family owns deterministic candidate generation.

A candidate is a structured action, not free-form text.

Examples:

### Next set

- `KEEP_LOAD`
- `INCREASE_TO_NEXT_VALID_LOAD`
- `DECREASE_TO_PREVIOUS_VALID_LOAD`
- `KEEP_LOAD_ADJUST_REP_TARGET`
- `END_EXERCISE`

with concrete parameters only after equipment validation.

### Session adaptation

- `KEEP_SESSION`
- `REMOVE_LOW_PRIORITY_SET(S)`
- `REMOVE_LOW_PRIORITY_EXERCISE`
- `CREATE_COMPATIBLE_SUPERSET`
- `PRESERVE_PRIORITY_LIFT_REDUCE_ACCESSORIES`

### Exercise substitution

Candidates come only from approved substitution relationships plus current equipment availability.

### Recovery

- `CONTINUE`
- `HOLD_PROGRESSION`
- `ADAPT_TODAY`
- `REDUCE_STRESS_SHORT_TERM`
- `RECOMMEND_DELOAD`

### Required fallback candidate

Where sensible, every recommendation decision should include a conservative no-change candidate such as:

`KEEP_CURRENT_PLAN` / `NO_CHANGE`.

This prevents the engine from being forced to choose an intervention merely because candidates exist.

---

## 7. Candidate evidence

Each candidate should carry structured reason/evidence features.

Examples:

- `TOP_OF_REP_RANGE_REACHED`
- `TARGET_RIR_MET`
- `NEXT_LOAD_INCREMENT_AVAILABLE`
- `NEXT_INCREMENT_LARGE`
- `SAME_MACHINE_HISTORY_AVAILABLE`
- `MACHINE_CHANGED`
- `LOW_COMPARABILITY`
- `AVAILABLE_TIME_REDUCED`
- `PRIORITY_EXERCISE`
- `REPEATED_UNDERPERFORMANCE`
- `READINESS_LOW_REPEATEDLY`
- `SINGLE_BAD_SESSION_ONLY`
- `FREE_WORKOUT_OVERLAP`

Reason codes are preferable to explanation logic embedded in arbitrary prose.

---

## 8. Evaluation stages

The engine should conceptually evaluate candidates in this order.

### Stage 1 — Eligibility

Apply hard constraints and remove invalid actions.

### Stage 2 — Deterministic policy scoring

Use approved Training Goal Policies, equipment semantics and explicit context.

Examples:

- strength policy scores preserving a priority lift highly;
- hypertrophy policy scores preserving priority muscle stimulus;
- coarse machine increment may favor more reps over load increase.

### Stage 3 — Evidence sufficiency

Assess whether enough comparable information exists to make a useful personalized choice.

### Stage 4 — Optional model-assisted ranking

If enabled and validated, a model may rank/score the remaining candidates.

The model receives only valid candidate IDs/options plus bounded context.

### Stage 5 — Abstention/confidence gate

Decide whether evidence supports surfacing a recommendation.

### Stage 6 — Explanation

Generate the user-facing reason from deterministic reason codes/context, not hidden model reasoning.

### Stage 7 — User decision

User accepts, edits, chooses another candidate, or ignores.

---

## 9. Rule/heuristic layer

M3 must have useful deterministic behavior without any ML model.

Examples:

### Hypertrophy baseline

If:

- same comparable machine/exercise;
- top of target rep range achieved across intended working sets;
- effort approximately on target;
- next equipment-valid load exists;
- no meaningful fatigue warning;

then a load-increase candidate may be preferred.

### Coarse increment

If the next equipment step is too large relative to target performance, maintaining load and adding reps may be preferred.

### Strength underperformance

Repeated comparable underperformance plus higher effort can favor holding/reducing today's progression rather than increasing load.

### Unknown machine

No personal comparable history -> do not blindly copy nominal load from another machine.

### One poor session

Single-session underperformance -> generally prefer no large recovery intervention.

These are policy implementations and require tests; this contract does not fix every threshold.

---

## 10. Confidence is not one number by default

KeylorForge should not expose pseudo-precision.

Decision confidence should conceptually consider:

- amount of relevant data;
- comparability;
- consistency of signals;
- recency;
- missing context;
- disagreement among policy evidence;
- optional model uncertainty if a model is used.

Initial user-facing bands may be:

- `HIGH`
- `MODERATE`
- `LOW`
- `INSUFFICIENT`

Exact labels are provisional.

### Important model rule

A model-produced probability is **not automatically KeylorForge decision confidence**.

Even if a model reports a calibrated probability on its own benchmark, KeylorForge must validate calibration on KeylorForge-specific decisions before interpreting it as domain confidence.

---

## 11. Abstention

“No strong recommendation” is a valid and often desirable engine output.

Abstain when:

- comparable history is insufficient;
- machine context changed substantially;
- signals conflict;
- candidate scores are too close;
- a model is unavailable;
- model confidence is below an approved threshold;
- required context is missing;
- the situation falls outside approved policy scope.

Possible UX outcomes:

- keep the original plan;
- show two neutral options;
- ask one minimal useful question;
- let the user choose manually.

The engine must prefer uncertainty over fabricated precision.

---

## 12. Cold start

A new user has little/no personal history.

Cold-start decisions should rely on:

- approved curated plan;
- stated training goal;
- experience level;
- available frequency/time/equipment;
- conservative defaults;
- user-selected loads/effort feedback.

Do not pretend personalization exists before data exists.

Progressive personalization begins as actual workout evidence accumulates.

---

## 13. Offline and unavailable-service behavior

Basic workout recording never depends on a remote decision service.

When offline:

- active workout remains fully recordable;
- deterministic local rules may continue if implemented locally;
- last accepted plan/prescription remains usable;
- optional model-assisted ranking may be skipped;
- the app may abstain rather than block.

If an optional remote intelligence service fails mid-session, the user should not experience data loss or be unable to finish training.

---

## 14. Recommendations versus automatic actions

### Safe automatic/derived behavior

May include:

- unit conversion;
- restoring last known machine context;
- pre-filling the previous/target value as editable input;
- filtering impossible load settings;
- rest-timer state;
- recomputing deterministic derived candidate features.

### User-controlled recommendations

Initially require visible user control before:

- changing actual target load;
- removing planned sets/exercises;
- substituting exercises;
- changing session structure;
- recommending recovery/deload;
- treating a free workout as covering plan intent;
- making a significant plan-continuation change.

The user may accept with one tap; user control does not require friction-heavy confirmation dialogs.

---

## 15. Silence-by-default during live training

The Decision Engine should not behave like a noisy coach.

If the latest result is within the expected envelope and no meaningful action changes:

- persist the set;
- advance naturally;
- prefill the next expected values;
- stay visually quiet.

Surface an explicit recommendation when:

- the next action meaningfully changes;
- context changed;
- performance deviated materially;
- an equipment substitution/calibration is needed;
- time/fatigue requires adaptation;
- user asks for guidance.

The best recommendation is sometimes no interruption.

---

## 16. Next-set loop

The high-frequency loop is:

`perform -> record locally -> complete set -> rest -> evaluate -> recommend/abstain -> next set`

### Example: on target

Target:

`80 kg × 8–10 @ RIR2`

Actual:

`80 × 9 @ RIR2`

Possible output:

- no explicit intervention;
- next set prefilled at 80 kg;
- target remains 8–10.

### Example: much harder than expected

Actual:

`80 × 8 @ RIR0`

Possible valid candidates:

- keep 80 but lower rep expectation;
- reduce to previous valid setting;
- end exercise if broader fatigue evidence supports it.

The engine must not infer accumulated fatigue from this set alone.

### Example: too easy

Actual:

`80 × 10 @ RIR5`

Candidates may include:

- next valid load increase;
- keep load with revised target if the jump is coarse.

Equipment validity applies before ranking.

---

## 17. Substitution decisions

Candidate substitutes must come from the Exercise/Equipment domain.

Evaluation considers:

- training policy;
- exercise priority/specificity;
- target muscle/movement;
- actual equipment availability;
- user's history with substitute;
- current fatigue/context;
- time/setup cost.

A substitution explanation should say what is preserved and what changes.

Example:

> Dumbbell press preserves the chest-focused hypertrophy intent, but it is not directly comparable to your barbell bench strength history.

---

## 18. Time-adaptation decisions

The engine should produce candidates that preserve goal-specific intent.

### Hypertrophy

Prefer removing redundant/accessory volume while preserving priority muscle stimulus.

### Strength

Prefer preserving priority lifts and adequate rest.

### Muscular endurance

Preserve repeated-effort structure.

### General fitness

Prefer a coherent useful shorter session over cancellation.

The engine must not simply truncate the last N exercises without considering policy priority.

---

## 19. Fatigue/recovery decisions

Fatigue states are conservative estimates, not diagnoses.

Candidate generation follows the approved intervention ladder:

1. continue;
2. hold progression;
3. adapt today;
4. reduce stress across sessions;
5. recommend recovery/deload.

Hard policy:

> no single weak signal can directly produce Level 4.

The Decision Engine should attach the converging reasons it used.

Example:

- repeated performance decline;
- rising effort;
- repeated low readiness;
- recent workload above the user's normal range.

Exact windows/thresholds remain provisional.

---

## 20. User overrides

The user can reject/edit recommendations.

Examples:

- choose 45 kg instead of suggested 50;
- keep the original exercise;
- ignore shortened-session adaptation;
- end the exercise early.

### Override is not automatically “user error”

The engine should record the outcome as feedback where useful.

### Preference versus performance

Repeated overrides may indicate:

- preference;
- missing equipment/context;
- bad recommendation;
- deliberate experimentation.

Do not immediately train a preference model that blindly reinforces every override.

Personalization must distinguish “the user likes this” from “this produced the desired training response.”

---

## 21. Recommendation outcome

Where useful, the system may later observe whether an accepted recommendation led to:

- target achieved;
- target missed;
- user correction;
- immediate override;
- exercise abandonment;
- future comparable improvement.

This creates evaluation data.

M3 does not require online learning from every outcome.

No model should self-update on-device/server from unreviewed user behavior without a separate ML governance design.

---

## 22. Explanation contract

Explanations should be produced from:

- selected action;
- deterministic reason codes;
- relevant context;
- known uncertainty.

They should **not** require exposing hidden chain-of-thought or model internals.

### Good explanation

> You reached the top of the target range in all three working sets on this same machine, and the next available setting is 5 kg higher. A small load increase is reasonable.

### Equipment uncertainty

> This is a different cable machine and we do not yet have comparable history here, so KeylorForge is not copying your previous stack setting.

### Abstention

> Your recent results are mixed and this machine is new to your history, so there is not enough comparable data for a confident load change.

### Recovery

> Several recent comparable exercises have required more effort while performance declined, so holding progression today is more appropriate than increasing load.

Explanations must never say “the AI knows” or imply medical certainty.

---

## 23. Decision trace / audit

For debugging, quality evaluation and explainability, a material recommendation should be traceable without storing private hidden reasoning.

Conceptual fields:

- decision ID;
- decision family;
- timestamp;
- policy/version;
- bounded context/reference version;
- candidate action IDs;
- hard-constraint exclusions + reason codes;
- deterministic feature/reason codes;
- selected recommendation or abstention;
- product confidence band;
- optional model identifier/version;
- optional model output/probability;
- explanation reason codes;
- user response/override when available.

Do **not** store chain-of-thought.

Sensitive context should be minimized and referenced rather than duplicated where possible.

Exact persistence/retention belongs in implementation/privacy design.

---

## 24. Determinism and reproducibility

Given the same:

- approved policy version;
- same bounded context;
- same candidate generator;
- no optional stochastic/model layer;

the deterministic portion should produce the same valid candidates/result.

If a model is used, model/version/configuration should be traceable.

Future analytics should be able to distinguish:

- deterministic recommendation;
- model-assisted recommendation;
- purely manual user choice.

---

## 25. Laya boundary

Laya is **provisional** and not required for M3 correctness.

As of the 2026-10-08 review, its published model cards describe it as a non-autoregressive decision model that accepts state/context plus typed questions and returns choices/scores/probabilities. Published checkpoints include an English ~421M model and multilingual ~322M model; model weights are published under Apache-2.0. The TypeScript/ONNX community implementation is a separate MIT-licensed wrapper.

Sources:

- https://huggingface.co/convaiinnovations/laya
- https://huggingface.co/convaiinnovations/laya-multilingual
- https://github.com/receptron/laya

These properties make Laya conceptually compatible with **ranking already-valid candidates**, but do not establish suitability for fitness decisions.

### Allowed experimental role

Laya may be evaluated for:

- ranking a bounded plan shortlist;
- ranking valid substitutions;
- ranking valid next-set actions;
- ranking recovery interventions already generated by policy.

### Not allowed

Laya may not:

- invent arbitrary actions;
- produce unrestricted workout plans;
- bypass hard constraints;
- invent load values;
- diagnose health conditions;
- write actual workout history;
- be required for offline logging.

---

## 26. Laya adoption gate

Before production use, KeylorForge-specific evaluation is mandatory.

Minimum evaluation should include:

### Accuracy

Correct action ranking on labeled KeylorForge scenarios.

### Calibration

Whether reported probabilities correspond to empirical correctness/usefulness in our domain.

### Spanish/multilingual quality

Because Spanish is a primary product language, Spanish cases must be first-class evaluation data.

### Safety/constraint adherence

The wrapper/domain boundary must prove that invalid actions cannot escape candidate filtering.

### Robustness

Cases with:

- missing history;
- contradictory signals;
- machine changes;
- kg/lb;
- assisted exercises;
- coarse increments;
- free workouts;
- fatigue noise;
- adversarial/odd text notes.

### Latency/resources

Measure real deployment memory, compute and latency for intended hosting/hardware.

### Privacy

Verify what user context would be sent to the model/runtime and minimize it.

### Baseline comparison

The model must outperform or materially improve over deterministic policy/rule baselines on the decisions where it is proposed.

If it does not add measurable value, do not ship it merely because it is available/open source.

---

## 27. Model probability versus product confidence

This distinction is mandatory.

Example:

Laya output:

`P(INCREASE_LOAD) = 0.78`

This does **not** mean:

> there is a 78% chance increasing load is correct for this user.

Until domain-specific calibration is validated, it is only the model's score/probability for its configured decision task.

Product confidence must also consider:

- evidence amount;
- context comparability;
- hard-domain uncertainty;
- missing signals;
- calibration evidence.

The UI should initially prefer qualitative confidence/explanation over raw model probabilities.

---

## 28. Failure modes

### No history

Use plan/policy defaults; do not fake personalization.

### New machine

Use machine-native values/manual choice and conservative calibration; do not copy nominal load blindly.

### Model unavailable

Fall back to deterministic logic or abstain.

### Conflicting signals

Prefer no change / ask one useful question / show options.

### Invalid candidate from implementation bug

Hard validation must reject it before application.

### Recommendation becomes stale

Invalidate and recompute.

### User ignores recommendation

Continue logging; do not punish or block.

---

## 29. Tests implied by this contract

Future implementation should include deterministic tests for at least:

- physically impossible load filtered out;
- assistance direction handled correctly;
- same exercise/different machine lowers comparability;
- one poor set does not trigger deload;
- strength priority preserves main lift in time compression;
- hypertrophy time compression removes lower-priority redundancy first;
- free workout does not silently complete plan step;
- stale recommendation invalidates after set edit;
- no-history path returns conservative/default behavior;
- optional model failure does not break workout;
- user override remains allowed;
- completed history is never rewritten by recommendation engine.

Model-assisted paths require a separate evaluation suite, not only unit tests.

---

## 30. Explicitly unresolved

Do not hard-code yet:

- exact scoring formulas;
- candidate score weights;
- confidence thresholds;
- exact evidence windows;
- exact model prompt/state serialization;
- whether Laya is adopted;
- which Laya checkpoint/runtime;
- local versus server model hosting;
- premium/free gating of specific decisions;
- exact decision-log storage/retention;
- personalization-learning algorithm;
- exploration/bandit behavior;
- exact recommendation UI;
- exact plan-ranking algorithm.

---

## 31. Acceptance

This contract becomes M3 authority when the Product Owner approves:

- domain-first candidate generation;
- non-overridable hard constraints;
- deterministic baseline without ML;
- abstention as valid output;
- silence-by-default live behavior;
- user-controlled material recommendations;
- context/version invalidation;
- deterministic explanations from reason codes;
- user override as feedback, not error;
- traceability without chain-of-thought;
- Laya as optional/provisional ranker only;
- KeylorForge-specific model evaluation before adoption;
- distinction between model probability and product confidence;
- offline workout independence from model availability.

Approval does not authorize a model deployment, scoring thresholds, model hosting architecture, final API or final UI.

