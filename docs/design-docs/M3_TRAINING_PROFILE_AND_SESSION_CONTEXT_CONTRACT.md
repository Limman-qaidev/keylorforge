# M3 Training Profile, Cold Start and Session Context Contract

**Status:** Accepted by Product Owner — merged PR #122 on 2026-10-08  
**Milestone:** M3 — Workout Engine  
**Issue:** #121 — R2-02 / audit #117 N-P1-02  
**Approval evidence:** PR #122, squash merge `6b1989d46ed1d2efe051bc10c788bb2a86ebb151`
**Date:** 2026-10-08  
**Parent authorities:** `M3_PERSISTENCE_AND_DATA_MODEL_CONTRACT.md` (#110), `M3_LOCAL_DATA_AND_IDENTITY_CONTINUITY_CONTRACT.md` (#112), `M3_WORKOUT_DOMAIN_CONTRACT.md`, `M3_DECISION_ENGINE_CONTRACT.md`, `M3_TRAINING_GOAL_POLICIES.md`, `M3_USER_JOURNEY.md`, M1 identity contract and #116 privacy gate.

## 1. Purpose and non-goals

M3 must distinguish three independent sources of information:

1. **Training Intent**: explicitly established training policy and optional body-goal/overall priority, historically versioned under the accepted Persistence contract.
2. **Training Profile**: optional, gradually collected **stable preferences and declared experience**, owned by the account and independently editable without changing the policy itself.
3. **Session Context**: optional **time-varying operational facts or user choices** for a particular session. A material context revision can affect future recommendations without changing completed work.

A new authenticated user may log a Free Workout without completing onboarding, selecting a plan, specifying a Training Profile, or establishing Training Intent.

This document closes the conceptual **ownership, nullability, provenance and sync boundary**. It does not prescribe physical tables, final REST payloads, plan-ranking algorithms or fatigue/recovery thresholds.

## 2. Authority and nullability

### 2.1 Training Intent is optional as an entity

**Absence of Training Intent is a valid configured state of an account**, not a corrupted or partially constructed Training Intent row.

- An account may have zero Training Intent revisions before its first deliberate policy selection.
- If a Training Intent revision exists, `primary_training_policy` is **required** and must be one of the four already approved training policies.
- Optional `secondary_training_policy`, `body_goal`, and required `primary_intent_dimension` within a revision retain the exact #110 rules.
- `BODY_GOAL` as primary intent dimension requires non-null `body_goal`.
- No fabricated `GENERAL_FITNESS`, `MAINTAIN`, `UNSPECIFIED`, zero UUID, or other fake/default policy is written to satisfy database or API constraints.
- **An ActualWorkoutSession may reference no Training Intent revision**. Its optional `training_intent_revision_id` is nullable on the client, in the mutation payload and in the server relationship.
- If intent is absent, a session's policy snapshot explicitly indicates **no established intent**; it must not be silently populated from future account settings or from the selected exercise.
- The **fields inside an existing Training Intent revision** retain their required constraints. Do not weaken validation by making its primary training policy nullable.

### 2.2 Free Workout cold start

An authenticated, previously bootstrapped user with no configured plan, Training Profile or Training Intent can:

1. enter Entrenar;
2. choose Free Workout;
3. create a local `ACTIVE` session with null plan/template/intent provenance where absent;
4. select an exercise from the offline-cached canonical catalogue;
5. confirm a qualifying `WORKING` set with the necessary actual load/measurement semantics;
6. explicitly Finish;
7. preserve completed work and enqueue idempotent sync mutations.

The local transaction, one-active-session invariant, account partition, accepted Set Draft distinction, per-set context and qualifying-work rule are unchanged. No forced goal questionnaire, network call, plan assignment or default training policy occurs.

**No-intent session != invalid-intent mutation**: a missing optional reference is valid; an explicitly supplied malformed/unowned/stale reference remains subject to validation and conflict rules.

### 2.3 Plan selection

Plan discovery may progressively request a **stated** primary training policy and a few relevant Training Profile fields. Creating a configured Training Intent revision requires an explicit user choice or confirmation, never an unannounced inference from body goal, first workout, or selected plan.

If the user selects a curated plan with a policy, the UI can offer to adopt/confirm that policy as Training Intent. It may not silently assign a policy when the user merely browses. The accepted plan/template revision and active-session provenance rules continue to apply.

## 3. Training Profile ownership

### 3.1 Identity and lifecycle

`TrainingProfile` is a **first-class, account-owned, optional user preference entity** separate from the M1 identity/profile and Training Intent:

- stable client-generated `training_profile_id` when first created;
- owner derived from the authenticated application subject, never trusted from a client-supplied `user_id`;
- at most one current profile per subject for M3 (or an equivalent stable aggregate); 
- server revision/concurrency token, `updated_at`, field-level provenance of explicit user input, and enough history/snapshot information to interpret past material recommendations;
- creation/editing is local-first and atomically queued into the subject's outbox when offline;
- deletion/reset of one preference is an explicit user operation, not a training-intent deletion;
- absence of a profile is valid and must not prevent session creation.

A full append-only profile-history UI is not required. The system must protect prior decision/session meaning when the current profile changes.

### 3.2 Minimum supported preference fields

| Field / concept | Input | Absence semantics | Use |
| --- | --- | --- | --- |
| `declared_experience_level` | Optional `NOVICE / INTERMEDIATE / ADVANCED`, explicitly self-declared | unknown, not `NOVICE` | exercise-learning and eligible progression guidance |
| `desired_sessions_per_week` | Optional user-declared integer from 1 to 7 | no frequency stated | curated plan suitability |
| `typical_available_minutes` | Optional positive integer; exact product UI bounds in later field validation | no usual duration stated | plan shortlist/time expectations |
| `default_gym_context_id` | Optional reference to an owned Gym Context | gym unknown or not configured | prefill; never override today's actual gym |
| `available_equipment_taxonomy_ids` | Optional, explicitly declared selection of canonical equipment taxonomy IDs | availability unknown; no false “no equipment” inference | eligible plan/substitution candidates |
| `priority_muscle_ids` | Optional ordered unique canonical muscle IDs | priorities unknown | plan selection/priority, not injury diagnosis |
| `preferred_exercise_ids` | Optional set of **canonical** exercise identities | no stated preference | candidate ordering |
| `disliked_exercise_ids` | Optional set of **canonical** exercise identities | no stated dislike | substitution/plan customization |
| `preferred_effort_logging` | Optional `RIR / RPE / BOTH / NONE` explicit UX preference | no mode preference stated | logging interface, not historical effort metric |

All list/set fields are constrained to supported canonical IDs, with #89 redirect resolution before workout-history identity freeze. Where necessary, **not provided** must be distinguishable from an explicit empty/cleared selection. The exact normalized or JSON representation is implementation-specific.

No field implies an irreversible preference, medical limitation, user ability diagnosis, or universally valid performance expectation. A skipped exercise does not silently become a declared dislike.

### 3.3 Do not duplicate Training Intent

`TrainingProfile` must **not** persist a second competing `primary_training_policy`, `body_goal`, `primary_intent_dimension`, or `primary_user_outcome` field.

The optional `experience/policy level` in a Training Intent revision, **only when actually known**, is a historical snapshot of the level applied under that intent, not an independent mutable preference authority. Missing declared experience must remain null/unknown, never fabricated as `NOVICE`:

- the current user-declared experience lives in Training Profile, when present;
- when an intent revision uses experience/policy level, its historical recorded value does not change with future Training Profile edits;
- material decisions using the *current* profile must preserve/profile-reference the actual profile revision or fields used;
- a change to Training Profile alone does not retroactively edit or automatically invent a Training Intent revision.

### 3.4 Profile update and conflict

Use the M3 outbox/idempotency/optimistic-concurrency model. Explicit edits carry the expected revision and cannot silently overwrite concurrent edits from another device. Only demonstrably independent fields may be safely merged under an approved rule. A stale same-field edit is an explicit conflict, and local unsynced input remains recoverable.

Profile changes must not rewrite completed WorkoutSets, historical intent revisions or their associated snapshots.

## 4. Session Context

### 4.1 Distinguish user preference, today's context and actual set

A typical duration belongs to Training Profile; **time available today** belongs to Session Context. A default gym belongs to the Profile; the gym or machine **actually used** belongs to Session Context/agenda and ultimately to the performed-set historical machine snapshot.

Session Context may be completely absent; an `ACTIVE` Free Workout remains valid.

### 4.2 M3 operational fields

The minimum non-sensitive, optional operational context has:

- `session_id` and authenticated account ownership;
- a stable context revision/snapshot identity (`session_context_revision_id` or equivalent);
- `recorded_at` UTC instant and `source = USER_DECLARED / EXPLICIT_SELECTION` where relevant;
- optional `available_time_minutes` (positive, user-provided time budget **at the observation**, not actual session duration);
- optional `gym_context_id` (owned Gym Context chosen for this session);
- optional `available_equipment_taxonomy_ids` and/or specific available/unavailable Machine Profile IDs scoped to this session;
- an explicit distinction between unknown equipment availability and user-declared complete unavailability.

A gym context or equipment selection is a preference/availability aid, never evidence that a particular machine was used for an already completed set. Machine identity/load semantics remain authoritative on the performed set.

No inferred equipment capability, condition, pain diagnosis, menstrual data, or hidden user goal is persisted under an arbitrary free-text context property.

### 4.3 Context revisions and trace

Material changes to time/gym/equipment during the session must update the active operational context and invalidate any stale proposal/recommendation. Preserve the context **used for a material decision** through an immutable snapshot or reference with revision and timestamp.

- Changing a time budget never changes the actual start instant or completed sets.
- The session-start prescription and each performed-set prescription remain separately immutable per #110.
- Decision explanations must identify which user-declared context was considered and whether information was absent.
- A reusable recommendation must not later be interpreted as if it used new, post-decision preferences.

This is the context-input provenance rule. **It does not by itself close R2-04**, which still must define durable final agenda/adaptation outcomes, or G2's decision-trace retention protocol.

### 4.4 Cross-entity causal dependencies

When a session mutation references an unsynced user-owned Gym Context or a freshly created Training Profile revision needed for durable provenance, the outbox must preserve the applicable prerequisite/dependency. A per-session context update must be attributed to the correct user/session and ordered before a dependent durable decision/adaptation representation once R2-04/G2 establish that representation.

Do not block a valid Free Workout merely because an optional profile update cannot sync; omit unavailable optional references when no recommendation actually consumed them, without inventing values.

## 5. Generic readiness and privacy boundary

### 5.1 Not the same as Session Context or a diagnosis

Generic operational Session Context (time/gym/equipment) is distinct from an optional **user-provided readiness observation** (subjective energy/recovery, if later explicitly collected). Derived fatigue/recovery scores are another, **non-authoritative** concept.

The R2-02 core Free Workout does not require or automatically collect readiness, symptom, sleep, stress, menstrual, or contraceptive information.

### 5.2 Readiness observation ownership gate (G1)

Before collecting/persisting any generic subjective readiness in production, a narrower reviewed G1 design must specify:

- the exact optional questions/field values and plain-language purpose;
- user-controlled capture (never forced by Free Workout);
- distinct observation IDs, account ownership, optional session link, capture time, source, revision/correction semantics;
- whether and for how long local/server observations persist, export/delete, and account-deletion treatment (also R2-03);
- whether a material recommendation actually used the observation, with provenance and absence handling;
- the evidence-window/threshold safeguards required before multi-session fatigue or recovery interventions.

**R2-02 does not authorize readiness observations to be persisted just because the word “readiness” appears in a recommendation contract.** In the absence of the G1 decision, the basic session supports only non-sensitive operational context.

### 5.3 Sensitive context remains gated by #116

Until #116 has explicit Product Owner and privacy/security approval, do not persist or sync:

- menstrual cycle dates or phase estimates;
- contraceptive status;
- detailed menstrual/cycle-specific symptom history.

Neither a generic string/JSON context bag nor a Profile notes field may bypass this gate. Never infer or automatically reduce training based solely on sex or estimated menstrual phase. The app does not offer medical diagnosis.

## 6. Offline, auth, retention ownership

- Training Profile and optional Session Context are account-owned and account-partitioned in SQLite, under #112.
- A cached profile/context may be read during `LOCAL_OFFLINE_CONTINUITY` after a prior successful authenticated bootstrap for the **same** subject.
- A subject's profile/context/outbox is never readable or syncable while another subject is active.
- Explicit logout immediately hides it even if provider sign-out fails (existing G4 implementation gate); normal logout preserves unsynced state for same-subject recovery.
- Definitive credential revocation quarantines/hides, it does not purge user data.
- Confirmed account deletion purges Training Profile revisions, operational Session Context, any future readiness observations, and their local caches/outbox as part of the account partition.
- R2-03 owns **server-side** M3 retention/deletion strategy; nothing here authorizes retaining an identifiable Profile/Context indefinitely after account deletion.
- No personal data may be sent to an optional AI/ranker without an independently authorized purpose and privacy boundary; simple logging must not depend on AI availability.

## 7. Schema and API guardrails (not final DDL)

An implementation may choose one mutable versioned Profile with immutable revisions, or a stable Profile plus revision-stamped snapshots. Whichever strategy is chosen must support:

1. nullable `training_intent_revision_id` on a workout session when none exists, while non-null referenced intents are validated and owner-scoped;
2. optionally absent Training Profile without a synthetic empty policy/profile row;
3. profile field ownership, stable ID, revision tokens, explicit delete/reset and safe offline outbox reconciliation;
4. optional time/gym/equipment Session Context with durable revision input snapshots for material recommendations;
5. no conflict between historical Training Intent experience/policy snapshot and the currently declared Profile experience;
6. account partition isolation and deletion ownership;
7. future G1 readiness entities only after their own data/privacy review;
8. exact session/actual exercise/set semantics unchanged.

Do not persist an artificial current Plan Step, default training policy, or dummy context merely to satisfy a NOT NULL FK. Do not put Profile preferences into the M1 identity profile as untyped misc JSON.

## 8. Required validation and acceptance scenarios

1. **No onboarding:** account provisioned, profile absent, intent absent, plan absent → start Free Workout, log valid `WORKING` set and explicit Finish; preserve null intent, no fabricated values.
2. **Offline restart:** previously authenticated/cache-bootstrapped account can create/continue the same Free Workout without new network/goal/profile fetch.
3. **Invalid intent rejected:** supplied intent ID not found/unowned or invalid policy/goal dimensions does not fall back to an invented default.
4. **Intent exists:** a planned workout snapshots correct existing intent revision and body-goal priority; an earlier Free session stays with no intent.
5. **Profile-only:** set declared experience/frequency with no intent; Free Workout remains policy-unspecified, recommendation logic can abstain.
6. **Plan discovery:** explicit policy selection can create intent while profile fields are progressive/optional; mere browsing cannot do so.
7. **Preference correction:** change typical duration or disliked exercise, confirm current UI updates without rewriting completed history.
8. **Missing versus explicit empty:** unknown equipment list does not masquerade as “no equipment”; cleared preferences remain distinguishable.
9. **Current session override:** profile default gym A, today selects gym B; actual completed set records B's machine/configuration where used.
10. **Time budget revision:** change 45 to 20 minutes mid-session; old material proposal is stale; already completed sets keep prior prescription.
11. **Profile context trace:** a recommendation must be attributable to profile/context revision actually used, not a later edited version.
12. **Offline profile edit:** create/update profile locally and sync once with stable ID/idempotent mutation; lost acknowledgement/retry does not duplicate.
13. **Two-device conflict:** stale same-field profile change conflicts explicitly; unsynced local preference remains intact.
14. **Account switch:** A profile/context/outbox cannot render or sync under B.
15. **Delete account:** locally confirmed terminal deletion purges Profile/Context/any future readiness and outbox; backend deletion follows R2-03.
16. **No readiness required:** normal Free Workout can start, log and finish without an energy/sleep/symptom question.
17. **Privacy gate:** attempt to write cycle dates/phase/contraceptive or detailed symptoms via generic context is rejected pending #116.
18. **No invented recovery certainty:** without approved G1 subjective observations or sufficient historical evidence, the decision system holds/abstains from material recovery advice.

## 9. Scope and dependency verdict

**Closed at accepted semantic-contract level:** where stable Training Profile, optional Training Intent, optional Session Context, and their identity/history/sync boundaries belong.

**Remaining gates:** R2-03 M3 server deletion/retention; R2-04 exercise-occurrence and durable final-agenda/adaptation; #89 canonical aliases; G4 M1 logout error path; G1 readiness observation collection + multi-session safeguards; G2 decision trace. None is silently declared closed here.

Acceptance of this contract is **not** an implementation approval, a final schema/API freeze, or approval to collect sensitive personal data.

## 10. Product Owner acceptance (PR #122)

Product Owner approval, recorded by merge of PR #122, accepts:

1. nullable session Training Intent revision and no forced policy for Free Workout;
2. user-owned, optional Training Profile independent of Training Intent and M1 identity;
3. gradual, nullable stable preferences with safe versions and no competing goal authority;
4. optional per-session operational context, with durable snapshots of materially used inputs;
5. privacy gate for future subjective readiness (G1) and menstrual/cycle-specific context (#116);
6. same-device offline continuity and no silent loss/cross-account exposure.

Final SQL/SQLite/API details, G1/G2 privacy/storage design, R2-03 and R2-04 remain separate decisions.
