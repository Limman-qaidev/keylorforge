# M3 Training Goal and Recovery Policies

**Status:** Draft for Product Owner review  
**Parent authority:** `docs/design-docs/M3_WORKOUT_ENGINE_PRODUCT_CONTRACT.md`  
**Evidence review:** 2026-10-07

### Core rule

> The user's goal does not merely select a routine. It selects the policy used to interpret training and recommend what to do next.

### Goal model

Training policies:
- `HYPERTROPHY`
- `STRENGTH`
- `MUSCULAR_ENDURANCE`
- `GENERAL_FITNESS`

Body-goal modifiers:
- `GAIN_MASS`
- `MAINTAIN`
- `FAT_LOSS`
- `RECOMPOSITION`

Body goals modify interpretation; they do not become separate workout engines.

Primary goal controls exercise priority, progression metric, load/rep bias, rest priority, time-constrained trade-offs and fatigue interpretation. Secondary goals may influence compatible choices, but the primary goal wins on material conflict unless the user changes priorities.

### Shared rules

1. Progression is broader than adding weight: load, reps, duration, distance, density, useful volume, lower assistance or better RIR/RPE can all matter.
2. Never recommend an equipment setting that does not physically exist.
3. Compare like with like: machine, pulley/configuration, unit, variant, set type, target and rest can change interpretation.
4. Warm-ups are not equivalent to working sets.
5. Failure is not the universal target.
6. RIR/RPE are optional tools; novices must be able to train without them.
7. One bad set/session is not a fatigue trend.

### Policy matrix

| Policy | Primary success signal | Progression bias | Short-session priority |
| --- | --- | --- | --- |
| Hypertrophy | recoverable muscle-directed working-set stimulus | reps + load + useful volume | preserve high-priority muscle stimulus |
| Strength | performance in priority movements | load/performance + specificity | preserve priority lift(s) and rest |
| Muscular endurance | repeated local work capacity | reps/duration/distance/density | preserve repeated-effort stimulus |
| General fitness | consistency + broad exposure | gradual simple progression | preserve coherent broad session |

### Hypertrophy

Evidence-backed direction:
- More weekly set volume generally supports more hypertrophy, with diminishing returns.
- ACSM 2026 identifies roughly 10+ weekly sets per muscle in the reviewed evidence as a useful reference associated with greater hypertrophy, **not** a universal minimum/maximum.
- Frequency mainly distributes useful volume; no universal hypertrophy frequency is hard-coded.
- Hypertrophy must not be reduced to 8–12 reps.
- Working closer to failure may favor hypertrophy, but systematic failure is not required.

Product heuristic:
- Double progression is the preferred baseline for many rep-based exercises.
- Example `3 × 8–10`: reach the upper range across working sets near intended effort, then consider the next *physically valid* machine/load step.
- Consider RIR/RPE, machine consistency, increment size and fatigue.

**Provisional:** roughly 1–3 RIR may be a useful default for many ordinary hypertrophy working sets, but is not a universal rule.

Short session:
1. preserve priority muscle stimulus;
2. preserve valuable working sets;
3. reduce low-priority accessory/redundant volume;
4. use compatible supersets only when priority-set quality is preserved.

Plateau response:
maintain → adjust rep/load progression → improve exercise/equipment fit → reduce fatigue if needed → only then consider more volume.

### Strength

Evidence-backed direction:
- ACSM 2026 supports heavier loads (around ≥80% 1RM) for maximizing strength.
- Priority work should retain specificity and quality.
- Routine failure is not required.
- RPE/RIR/APRE-style autoregulation is legitimate; M3 does not require velocity hardware.

Priority movement rule:
A barbell bench prioritized for strength is not interchangeable with any chest exercise merely because the target muscle is similar.

Short session:
1. preserve priority lift(s);
2. preserve adequate rest;
3. reduce accessories before rushing main work.

Plateau response:
confirm comparability → require repeated underperformance → inspect fatigue/readiness and coarse load jumps → hold/autoregulate → later modify programming if evidence persists.

### Local muscular endurance

This means local muscular endurance, not full endurance-sport programming.

Distinguish:
- **absolute endurance:** more work against the same absolute load;
- **relative endurance:** work against load scaled to current capacity.

Evidence supports a lower-load/higher-repetition bias for relative muscular endurance, but no universal rep threshold.

Progression may use reps, duration, distance, density or later load progression. Density must not mean “rest as little as possible”.

### General fitness

Priorities:
- consistency;
- broad resistance-training exposure;
- major-muscle/movement coverage;
- manageable duration;
- low cognitive burden.

ACSM 2026 supports consistency over unnecessary complexity for healthy adults.

A coherent short session is better than cancelling because ideal duration cannot fit. A PR is not required for every successful workout.

### Body-goal modifiers

M3 does not prescribe calories/macros or diagnose energy availability.

**Gain mass:** use primary policy normally; do not add volume just because this modifier is selected.

**Maintain:** stable performance is acceptable; do not force progression every session.

**Fat loss:** evidence suggests energy deficit impairs lean-mass gains more clearly than strength gains. Maintaining strength/performance can therefore be a successful outcome. Be conservative about adding volume when recovery deteriorates.

**Recomposition:** use longer horizons and avoid aggressive short-term changes based on expected body-composition change.

### Experience

**Novice:** simple progression, few inputs, exercise learning, gradual RIR introduction.

**Intermediate:** explicit RIR/RPE, double progression, substitutions, moderate autoregulation.

**Advanced:** greater specificity and nuanced effort/load decisions, but no unapproved complex periodization.

### Fatigue/recovery

M3 estimates readiness/fatigue; it does **not** diagnose overtraining syndrome.

Candidate objective signals:
- repeated rep decline at comparable load;
- repeated load reductions;
- RIR falling / RPE rising for comparable work;
- repeated missed targets;
- declining completed working-set volume;
- repeated set/exercise abandonment;
- broad underperformance across movements.

Optional subjective signals:
- energy;
- recovery;
- soreness;
- sleep;
- motivation/stress;
- menstrual/symptom context.

**Hard rule:** no single-signal fatigue decision. One bad set, one poor night, one high RPE, one low-energy response or one menstrual phase cannot automatically trigger a deload/material rewrite.

Avoid fake precision such as “fatigue = 83.7%”.

Provisional internal states:
- NORMAL
- WATCH
- ACCUMULATING_FATIGUE
- RECOVERY_RECOMMENDED

### Recovery intervention ladder

1. **Continue** — normal variation.
2. **Hold progression** — weak fatigue evidence; do not add load/volume.
3. **Adapt today** — lower-priority set reduction, higher RIR target or lighter valid load.
4. **Reduce stress across sessions** — temporary volume/effort reduction.
5. **Recommend deload/recovery** — stronger accumulated evidence or planned deload.

Material changes remain user-controlled recommendations.

### Deload

- No universal `every N weeks -> deload`.
- Planned and autoregulated deloads are both valid.
- Deload means reduced training stress, not automatically zero training.
- Practical reductions may involve volume, reps, effort and sometimes load.
- Preserve useful movement specificity where appropriate.
- Deload is not competition taper.

Goal bias:
- Hypertrophy: reduce working-set volume/effort first.
- Strength: preserve priority specificity while reducing hard-set stress.
- Endurance: reduce repeated-effort stress while retaining exposure.
- General fitness: simple reduced-stress training/rest according to context.

### Time-aware matrix

| Goal | Preserve first | Reduce first | Avoid |
| --- | --- | --- | --- |
| Hypertrophy | priority muscle stimulus | accessory/redundant volume | dropping a target muscle because it appears late |
| Strength | priority lifts + rest | accessories | rushing heavy priority work |
| Endurance | repeated-effort stimulus | exercise variety | replacing it with unrelated heavy work |
| General fitness | broad useful coverage | complexity | cancelling a useful short session |

### Free workouts

Free workouts are authoritative history.

Their effect on future plans is goal-specific:
- a free hypertrophy chest session may cover much of planned chest stimulus;
- a machine press session may not replace a strength-priority barbell bench exposure.

### Menstrual/symptom context

It is a readiness/context modifier, not a separate policy.

- no universal phase-based automatic changes;
- no sex-based default reduction;
- opt-in only;
- personal longitudinal response may support recovery recommendations;
- no medical interpretation.

### Decision-engine outputs

A goal policy may provide:
- exercise priority;
- load/rep bias;
- effort/RIR direction;
- rest priority;
- preferred progression variable;
- volume interpretation;
- short-session removal priority;
- fatigue intervention preference;
- deload strategy preference.

Policy does not directly mutate workouts.

### Automation boundary

Safe deterministic calculations may include target-range checks, valid machine increments, unit conversion, working-set aggregation and explicit comparability/trend features.

Initially recommendation-only:
- fatigue-driven load changes;
- removing planned working sets;
- recovery substitutions;
- material session rewrite;
- autoregulated deload;
- goal changes.

Never automatic:
- injury/overtraining diagnosis;
- menstrual-phase-only prescription;
- calorie prescription;
- forced rest;
- competition taper;
- AI overriding domain/equipment constraints.

### Explicitly provisional

Do not hard-code without later approval:
- universal weekly set min/max;
- exact “effective set” definition;
- exact optimal frequency;
- universal RIR target;
- fatigue-score formula;
- number of bad sessions required;
- exact deload duration/reduction;
- goal weighting;
- experience thresholds;
- exact rest intervals;
- exact plateau definition;
- indirect-set weighting;
- machine-equivalence logic.

## Research basis

- Currier BS et al. ACSM Position Stand, 2026. PMID **41843416**, DOI **10.1249/MSS.0000000000003897**.
- Pelland JC et al. Resistance Training Dose Response, 2026. PMID **41343037**, DOI **10.1007/s40279-025-02344-w**.
- Bayesian network meta-analysis of strength/hypertrophy prescription. PMID **37414459**.
- Robinson ZP et al. Proximity to Failure, 2024. PMID **38970765**, DOI **10.1007/s40279-024-02069-2**.
- Non-failure vs failure meta-analysis. PMID **42410632**.
- Autoregulation meta-analysis. PMID **35038063**.
- Huang Z et al. Autoregulated strength training, 2025. PMID **40791980**.
- Hammert WB et al. Absolute/relative muscular endurance, 2025. PMID **40153563**.
- Murphy C, Koehler K. Energy deficit + resistance training, 2022. PMID **34623696**.
- Saw AE et al. Subjective recovery monitoring. PMID **26423706**.
- Rogerson D et al. Deload practices, 2024. PMID **38499934**.
- Coleman M et al. One-week deload trial, 2024. PMID **38274324**.

## Acceptance

Product Owner approval is required before these policies become authority.

Approval does not authorize a specific fatigue algorithm, exact plan library, universal volume targets, automatic deload execution or AI decision model.

