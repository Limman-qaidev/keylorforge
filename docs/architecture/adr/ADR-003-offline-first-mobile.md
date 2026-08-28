# ADR-003: Offline-First Workout Recording

- Status: Accepted
- Date: 2026-08-28

## Context

Gym environments may have unreliable connectivity. Recording a set is a high-frequency user action and must not depend on a successful round trip to the backend.

## Decision

Use Expo SQLite as local persistence for active workout flows. User actions are persisted locally first and synchronized with the backend when connectivity permits.

The detailed synchronization protocol will be defined in a dedicated design document before implementation.

Required properties:
- workout recording remains usable offline
- local persistence survives application restarts
- synchronization status is observable
- failed writes are retryable when appropriate
- duplicate remote mutations are prevented through explicit idempotency semantics
- conflict behavior is defined rather than implicit
- the UI must distinguish local success from remote synchronization success where material

## Authority

Local mobile data may temporarily contain newer user input, but PostgreSQL remains the persistent server-side source of truth after successful synchronization.

Derived rankings and authoritative analytics are computed server-side.

## Consequences

Positive:
- robust gym experience
- reduced perceived latency
- recovery from temporary network loss

Trade-offs:
- synchronization and conflict handling add complexity
- mutations require stable identifiers and idempotent behavior
