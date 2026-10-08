# KeylorForge product vision

## Product in one sentence

KeylorForge is a mobile-first gym training product where users can reliably record workouts, understand their progress, compare meaningful performance with groups, and optionally share training-related social content.

The product is not intended to be a generic social network with a workout form attached. The training record is the core domain and source of value; competition, analytics and social features are built on top of trustworthy workout data.

## Core user jobs

A user should be able to:

- register and sign in;
- start and complete a gym session;
- add exercises and record sets, repetitions, load and comments;
- support non-standard set measurements such as duration, distance, RPE/RIR or assisted/bodyweight work when needed;
- review workout history and progression;
- identify personal records and trends;
- browse a curated exercise catalogue by muscle, equipment/machine and category, with useful execution guidance;
- create or join groups;
- compare attendance, consistency, volume and exercise strength with other members of a group;
- eventually see a defensible muscle-level performance score rather than a naive sum of machine kilograms;
- optionally share a workout, text or photographs as a social post;
- keep workouts private even when the social layer exists.

## Product principles to preserve

### 1. Workout data is the source of truth

Raw workout sessions, exercises and sets are authoritative. Rankings, records, streaks, volume and other statistics are derived and must be reproducible from source workout data.

Do not make a derived ranking table the only source of historical truth.

### 2. Recording a set must work without connectivity

A gym is exactly the kind of environment where coverage can be poor. The user experience must not depend on a round-trip to the server for every set.

The intended flow is:

`user input -> local persistent state -> immediate UI update -> sync queue -> API when network is available -> PostgreSQL`

Offline-first behavior is therefore a product requirement, not merely a later performance optimization.

### 3. Exercise comparability matters

`Bench press - barbell`, `bench press - dumbbell`, `Smith-machine press` and a plate-loaded chest press are not interchangeable measurements for ranking purposes.

Exercise identity and variant/equipment must be modeled carefully enough that comparisons remain interpretable.

### 4. Rankings should be meaningful, not gimmicky

Attendance and session-count rankings are straightforward. Strength comparisons require compatible exercises/variants. Muscle-level rankings must not simply add displayed kilograms across unrelated machines.

The product should prefer transparent methodology that a user can inspect over an opaque score with no explanation.

### 5. Group competition before global competition

Groups are a first-class domain concept. The initial competitive experience is among friends, gym partners or other explicit groups rather than a single global leaderboard.

Expected group roles are `OWNER`, `ADMIN` and `MEMBER`.

### 6. Workout and social post are different entities

A workout can exist privately with no post. A post may optionally reference a workout. This separation prevents the social layer from contaminating the training record and supports privacy cleanly.

### 7. Privacy is explicit

The design intent includes `PRIVATE`, `GROUP` and `PUBLIC` visibility where relevant. Photos and social features must not force workout data to become public.

## Core domain model

The intended conceptual entities include:

- users / profiles
- groups / group_members
- muscles
- equipment
- exercise_categories
- exercises
- exercise_muscles
- exercise instructions/media
- workout_sessions
- workout_exercises
- workout_sets
- personal records / derived statistics
- posts / post_media / comments / reactions
- notifications / device tokens

A workout should be normalized into session -> exercises -> sets rather than stored as one opaque JSON object.

### Workout set flexibility

The initial dominant case is external load + repetitions, but the model must not treat a single normalized `weight_kg` value as the universal representation of resistance.

Depending on exercise type and equipment context, a performed set may include concepts such as:

- original nominal load value;
- original load unit (for example kg or lb);
- load-entry semantics (total load, per-dumbbell, selectorized stack, assistance, etc.);
- repetitions;
- duration;
- distance and distance unit where applicable;
- RPE/RIR;
- set role/type;
- completed/performed state.

Convenience conversions such as kg↔lb are derived displays. Machine-native values and semantics must remain recoverable.

This protects the product from destructive redesign for machines, assisted/bodyweight work, running, cycling, planks and other non-standard measurements.

## Exercise catalogue intent

The app should have its own internal exercise catalogue. A source such as wger may be useful for bootstrapping data, but KeylorForge must not depend on an external exercise API at runtime.

The intended ingestion model is:

`external/open source -> importer -> normalization -> KeylorForge database -> curation`

Licensing for descriptions and media must be checked independently before redistribution.

The system may eventually support both curated/system exercises and user-created custom exercises for movements that are genuinely missing or materially unique.

A specific machine at the user's gym is **not automatically a custom exercise**. When the canonical movement already exists, M3 represents the real equipment through a user-owned Machine Profile / configuration attached to the performed workout context. This preserves one canonical exercise identity without polluting the shared catalogue.

## Rankings and analytics intent

### Attendance / consistency

Useful periods include week, month, year and all-time. A completed session is the basic unit. Anti-gaming rules may be introduced so meaningless empty sessions do not count as visits.

### Exercise strength

A preferred strength comparison is estimated 1RM rather than only maximum displayed load. Epley is the current design candidate:

`e1RM = weight * (1 + repetitions / 30)`

This formula is **provisional methodology**, not an immutable contract. The key product requirement is compatible, understandable exercise-level comparison.

Useful exercise statistics may include best load, repetitions, volume and e1RM **only where exercise, load and machine semantics are sufficiently comparable**.

### Volume

A basic loaded-set volume concept is:

`volume = sum(load * repetitions)`

but only where the load semantics are meaningful and internally compatible. Machine-native nominal loads from incompatible machines must not be summed as if they represented one universal physical quantity.

Useful slices may include weekly/monthly totals and exercise/muscle views under explicitly versioned comparability rules.

### Muscle strength score

Do **not** rank a muscle by summing raw kilograms from heterogeneous exercises/machines.

The current design direction is:

1. compute a user's performance percentile for each comparable exercise/variant within the relevant population/group;
2. associate exercises to muscles with roles/contribution weights (`PRIMARY`, `SECONDARY`, potentially `STABILIZER`);
3. aggregate normalized exercise performance into an explainable muscle score.

This remains a design direction to formalize before implementation. The user must be able to inspect which exercises contribute to a muscle score.

## Social intent

Social is deliberately later than the workout engine. Expected capabilities eventually include:

- text posts;
- optional link to a completed workout;
- workout summary cards;
- photos;
- reactions/likes;
- comments;
- group/public/private visibility.

The social layer should strengthen training engagement rather than dictate the data model of workouts.

## Privacy, trust and safety intent

From the first socially enabled version, the product should account for:

- account deletion;
- user data export;
- block/report flows;
- deletion of posts;
- group privacy;
- server-side validation;
- media size/type constraints;
- stripping unnecessary photo EXIF, especially location metadata;
- rate limiting;
- secrets kept server-side;
- auditability for sensitive operations;
- backups and recovery.

Avoiding accounts for minors initially is the preferred product direction because it materially reduces moderation and regulatory complexity.

## Delivery phases

The intended product sequence is:

### Foundation

Repository, API/mobile/database foundations, local development, CI, test architecture, protected main and a real mobile-to-API health path.

### Identity

Registration/login, profile and authorization foundation.

### Exercise catalogue

Canonical exercise taxonomy, muscles/equipment, instructions and catalogue access.

### Workout engine

Create/continue/complete sessions; add exercises; log sets; comments; resilient local recording; curated/custom plans and reusable workout templates at the baseline needed to make the workout engine practical; first-class free workouts; basic rest timing; context/time-aware adaptation; and bounded, explainable recommendations under approved M3 policies.

### History and analytics

Workout history, progress, personal records, volume and derived statistics.

### Groups and rankings

Groups, membership/roles, attendance and exercise rankings, then defensible muscle-level scores.

### Robust offline sync

M3 already owns the correctness baseline required for trustworthy offline workout recording: local-first persistence, stable identities, idempotent retries, tombstones, explicit conflict detection and safe basic conflict resolution.

M6 matures that foundation with richer automatic multi-device merge, generalized sync infrastructure, batching/compaction, background scheduling, broader offline domains and conflict-UX polish.

### Social

Posts, media, comments/reactions, workout sharing and privacy/moderation flows.

### Beta / advanced product

Notifications, advanced multi-month programming/periodization beyond the M3 plan/template baseline, advanced charts/goals, integrations such as Apple Health / Health Connect / Garmin, and later conversational/generative coaching or recommendation/ML capabilities beyond the bounded M3 decision engine.

## Explicit non-goal

Do not try to build Instagram + Strava + Hevy + Strong simultaneously. The architecture should permit the larger product, but implementation should preserve the ordering above so the workout core becomes trustworthy before higher-level features depend on it.
