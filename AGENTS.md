# Agents

This document describes the AI agents configured for the fitness-app project.

# Engineering Operating Model

## Source of truth

At the start of a fresh session or when project context may be incomplete, read:
- `docs/project-context/README.md`
- `docs/project-context/PRODUCT_VISION.md`
- `docs/project-context/TECHNICAL_BLUEPRINT.md`
- `docs/project-context/PROJECT_STATE.md`

Then inspect the relevant authoritative documentation under:
- docs/architecture/
- docs/design-docs/
- docs/product-specs/
- docs/exec-plans/

The project-context pack is a rehydration layer, not a replacement for accepted ADRs or current implementation contracts. Follow the source-of-truth precedence documented in `docs/project-context/README.md`.

Do not invent architecture when an existing decision exists.

## Agent delegation

Use specialized agents when appropriate:

- project_manager: planning, dependencies and work decomposition.
- tech_lead: architecture and high-risk technical review.
- backend_engineer: services/api/.
- mobile_engineer: apps/mobile/.
- data_engineer: database, migrations, analytics and rankings.
- qa_engineer: independent verification and tests.
- devops_engineer: infra/, Docker and .github/.
- security_engineer: security review.

The main Codex thread remains responsible for orchestration and final synthesis.

## Parallel work

Prefer parallel subagents for:
- exploration
- code review
- test analysis
- security review
- independent research

Do not allow multiple write-heavy agents to edit overlapping modules
simultaneously.

For independent implementation tasks, use separate Git worktrees.

## Ownership

Structural database migrations belong to data_engineer.

backend_engineer must not create structural migrations without explicit
delegation.

Authoritative business rules belong server-side.

The mobile application must not become the authoritative implementation
of rankings or derived statistics.

## Git

Never commit directly to main.

One Issue should normally map to one focused branch and one Pull Request.

Do not modify unrelated files.

Do not merge a Pull Request merely because its implementation agent reports
success.

## Definition of Done

Work is complete only when:
- acceptance criteria are satisfied
- relevant tests exist
- existing tests pass
- formatting/lint/type checks pass
- documentation is updated when necessary
- the diff contains no unrelated modifications
- architectural review is complete when required
- security review is complete when required
- QA verification is complete

## Security

Never commit secrets.

Never place privileged credentials in mobile code.

Do not weaken authentication, authorization or validation to simplify
implementation.