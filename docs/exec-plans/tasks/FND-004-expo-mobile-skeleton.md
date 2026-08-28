# FND-004 — Create Expo mobile skeleton

## Status

Ready for implementation.

## Primary owner

`mobile_engineer`

## Context

The mobile architecture is accepted and M0 needs a reproducible Expo/React Native foundation before product screens are implemented.

## Goal

Create a minimal Expo + TypeScript application skeleton with routing, environment configuration, API connectivity abstraction and test/type/lint foundations.

## Scope

- create mobile project under `apps/mobile/`
- Expo + React Native + TypeScript
- TypeScript strict mode
- Expo Router baseline
- environment configuration pattern
- API client/connectivity abstraction without inventing product contracts
- simple development screen suitable for later `/health` integration
- baseline unit/component test setup
- formatting/lint/type-check configuration
- local developer commands documented

## Out of scope

- authentication UI
- exercise/workout/social screens
- SQLite synchronization implementation beyond any minimal project dependency setup
- production design system
- CI/EAS deployment workflows

## Dependencies

- FND-001 completed
- FND-002 completed

## Expected affected modules

- `apps/mobile/`

## Acceptance criteria

- [ ] Expo application starts using the documented command
- [ ] TypeScript strict mode is enabled
- [ ] Expo Router is configured with a minimal route structure
- [ ] environment-specific API base URL can be configured without hard-coding production values
- [ ] no secrets are committed
- [ ] baseline tests execute successfully
- [ ] formatting/lint/type-check commands are configured and documented
- [ ] no product-domain screens or invented API contracts are introduced

## Required validation

- run TypeScript checks
- run lint/format checks
- run mobile tests
- start Expo development application successfully

## Review gates

- use `tech_lead` for read-only review if replacing the agreed routing/state/tooling baseline is proposed
- do not implement authoritative business rules client-side
- do not modify backend/database/infrastructure areas
- use `qa_engineer` for independent verification after implementation

## Codex execution rules

- work in an isolated worktree/branch dedicated to FND-004
- do not modify `main`
- stay within `apps/mobile/`
- inspect the complete diff before completion
- do not require GitHub CLI access to begin implementation
- if remote push/PR creation is unavailable in the sandbox, finish with a clean local commit and report the branch name and commit SHA for external publication
