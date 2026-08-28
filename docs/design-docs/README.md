# Design Documents

Use this directory for implementation-oriented designs that are narrower than an ADR but substantial enough that agents should not invent behavior while coding.

A design document is appropriate for topics such as:
- offline synchronization protocol
- workout domain model
- exercise catalog import/normalization
- ranking methodology
- media upload flow
- notification workflow
- API versioning details

## Suggested structure

```text
# Title

## Problem
## Goals
## Non-goals
## Domain model
## API / interface contract
## Data model
## Failure modes and edge cases
## Security / privacy
## Testing strategy
## Rollout / migration
## Open questions
```

## Rules

- Reference relevant ADRs and product specifications.
- Do not use a design document to silently reverse an accepted ADR.
- Resolve material open questions before assigning implementation work.
- API, persistence, synchronization and ranking behavior must be explicit enough that independent agents can implement against the same contract.
- Keep implementation-specific details current as the design evolves.
