# KeylorForge project context

This directory is the durable handoff for product and engineering context that would otherwise live only in long chat histories.

It is intentionally concise enough to read at the start of a new ChatGPT/Codex session, but detailed enough to recover the original product intent and the rationale behind the architecture.

## Read this first

A fresh engineer or agent should read, in this order:

1. `docs/project-context/PRODUCT_VISION.md`
2. `docs/project-context/TECHNICAL_BLUEPRINT.md`
3. `docs/project-context/PROJECT_STATE.md`
4. relevant files under `docs/product-specs/`
5. relevant ADRs under `docs/architecture/adr/`
6. the current implementation issue / PR / execution plan

## Source-of-truth precedence

This context pack is a rehydration and intent document. It does **not** override more specific accepted decisions.

When sources disagree, use this precedence:

1. accepted ADR for an architectural decision
2. approved/current design document or implementation contract
3. current product specification / acceptance criteria
4. this project-context pack
5. historical chat or exploratory notes

If a product requirement itself changes, update the appropriate product spec and this context pack. If architecture changes, record or supersede the relevant ADR.

## Status vocabulary

The documents distinguish between:

- **Accepted**: already adopted by ADR, merged foundation, or explicit project decision.
- **Product intent**: behavior we deliberately want to preserve while implementation evolves.
- **Provisional**: a strong default/design candidate that still needs a dedicated implementation decision or validation.
- **Future**: explicitly deferred beyond the current milestone/MVP.

Do not silently promote a provisional idea into an irreversible contract.

## Maintenance rule

`PROJECT_STATE.md` is a living handoff and should be updated after meaningful merges, roadmap changes, dependency changes, or newly discovered blockers.

`PRODUCT_VISION.md` and `TECHNICAL_BLUEPRINT.md` should change much less frequently: only when the actual product intent or architecture meaningfully changes.

## Why this exists

KeylorForge was designed through a long product/architecture discussion covering workout logging, exercise taxonomy, rankings, groups, social features, privacy, offline behavior, analytics, infrastructure and delivery strategy. The important ideas must survive model/session changes and should not depend on anyone remembering a previous conversation.
