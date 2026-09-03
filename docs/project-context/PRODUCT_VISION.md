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

The initial dominant case is weight + repetitions, but the model should not make that the only possible exercise measurement. Depending on exercise type, a set may eventually contain optional fields such as:

- `weight_kg`
- `repetitions`
- `duration_seconds`
- `distance_m`
- `rpe`
- `rir`
- `set_type`
- `completed`

This protects the product from later schema redesign for running, cycling, planks, isometrics, pull-ups and assisted exercises.

## Exercise catalogue intent

The app should have its own internal exercise catalogue. A source such as wger may be useful for bootstrapping data, but KeylorForge must not depend on an external exercise API at runtime.

The intended ingestion model is:

`external/open source -> importer -> normalization -> KeylorForge database -> curation`

Licensing for descriptions and media must be checked independently before redistribution.

The system should eventually support both curated/system exercises and user-created custom exercises, so a user can represent a specific machine at their gym without polluting the canonical catalogue.

## Rankings and analytics intent

### Attendance / consistency

Useful periods include week, month, year and all-time. A completed session is the basic unit. Anti-gaming rules may be introduced so meaningless empty sessions do not count as visits.

### Exercise strength

A preferred strength comparison is estimated 1RM rather than only maximum displayed load. Epley is the current design candidate:

`e1RM = weight * (1 + repetitions / 30)`

This formula is **provisional methodology**, not an immutable contract. The key product requirement is compatible, understandable exercise-level comparison.

Useful exercise statistics include best load, repetitions, volume and e1RM.

### Volume

Basic loaded-set volume is:

`volume = sum(weight * repetitions)`

Useful slices include weekly/monthly totals and exercise/muscle views, subject to sensible rules for exercises where load x reps is not meaningful.

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

Create/continue/complete sessions; add exercises; log sets; comments; resilient local recording.

### History and analytics

Workout history, progress, personal records, volume and derived statistics.

### Groups and rankings

Groups, membership/roles, attendance and exercise rankings, then defensible muscle-level scores.

### Robust offline sync

Conflict behavior, retry/idempotency and mature offline workflows beyond the basic foundation.

### Social

Posts, media, comments/reactions, workout sharing and privacy/moderation flows.

### Beta / advanced product

Notifications, templates/routines, rest timers, advanced charts/goals, integrations such as Apple Health / Health Connect / Garmin, and later recommendation/ML possibilities.

## Explicit non-goal

Do not try to build Instagram + Strava + Hevy + Strong simultaneously. The architecture should permit the larger product, but implementation should preserve the ordering above so the workout core becomes trustworthy before higher-level features depend on it.
