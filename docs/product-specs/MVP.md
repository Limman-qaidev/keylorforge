# Keylornet MVP Product Specification

## Product goal

Keylornet is a mobile application for recording gym training, reviewing personal history and progress, and comparing activity and performance within groups. Social sharing is a later layer built on top of trustworthy workout data.

## MVP priorities

The first usable product must prioritize reliable workout recording over social functionality.

### 1. Identity
Users can:
- register
- log in and log out
- recover access
- maintain a basic profile
- delete their account according to the defined privacy flow

### 2. Exercise catalog
Users can:
- search exercises
- filter by muscle and equipment
- inspect instructions and exercise metadata
- create private/custom exercises where supported

An exercise can target multiple muscles with explicit roles such as primary and secondary.

### 3. Workout recording
Users can:
- start a workout session
- add exercises
- add, edit and remove sets
- record repetitions and weight where applicable
- add comments
- finish or cancel a session
- continue recording when network connectivity is unavailable

The data model must allow future exercise metrics such as duration, distance, assistance and other exercise-specific values without requiring a destructive redesign.

### 4. History and personal analytics
Users can:
- inspect historical sessions
- inspect exercise progression
- see personal records
- see training frequency
- see volume statistics where meaningful
- see estimated 1RM for supported strength exercises

Raw workout data is the source of truth for derived metrics.

### 5. Groups and rankings
Users can:
- create or join groups
- view group membership
- compare weekly, monthly and yearly training frequency
- compare performance by compatible exercise
- view aggregate muscle scores once methodology is implemented and documented

Arbitrary machine weights must not be treated as universally comparable strength values.

## Post-MVP / later milestones

- social posts
- workout sharing
- photos and media
- reactions and comments
- push notifications
- routine/templates
- advanced analytics
- Apple Health / Health Connect / Garmin integrations
- recommendation systems

These later features must not block delivery of the workout core.

## Privacy model

The architecture must support explicit visibility levels where relevant:
- PRIVATE
- GROUP
- PUBLIC

Client-side visibility controls are not sufficient authorization.

## Product quality constraints

- workout entry must remain practical with unreliable connectivity
- common set-entry actions should require minimal interaction
- data loss during recoverable network failures is unacceptable
- derived statistics must be reproducible
- security and privacy requirements apply from the first release

## Out of scope for initial implementation

- microservices
- real-time global social feed at scale
- complex recommendation/AI coaching
- payment/subscription system
- direct support for minors unless requirements are explicitly revisited
