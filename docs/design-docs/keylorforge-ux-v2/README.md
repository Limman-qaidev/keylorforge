# KeylorForge — UX/UI v2 (M3 reference boards)

**Status:** design proposal visually accepted in conversation; reference assets for review and implementation planning, **not** an implementation of any new functionality.

**Editable design:** [Open the Figma v2 source](https://www.figma.com/design/siS159Erdj9OZcejWOiGyd)

**Product owner-approved visual baseline:** [original approved product board](../keylorforge-ui-reference/keylorforge-ui-foundation-v1.png), [original M1 reference](../keylorforge-ui-reference/keylorforge-m1-reference-v1.png), [original auth reference](../keylorforge-ui-reference/keylorforge-auth-reference-v1.png) and [visual implementation contract](../KEYLORFORGE_VISUAL_FOUNDATION.md).

> The original illustrations still show a historical product wordmark; the live app and these new mockups use **KeylorForge**, with the real G4 symbol taken from `brand/`.

## Board 1 — M3: workout experience

![M3: Entrenar, dark active workout, catalogue, sets and history](01-m3-workout.png)

Individual screens (390 × 820 px exports):

1. [Training Hub](m3/01-training-hub.png)
2. [Active workout — dark immersive mode](m3/02-active-workout-dark.png)
3. [Choose exercise / catalogue](m3/03-exercise-catalog.png)
4. [Register a set — dark immersive mode](m3/04-register-set-dark.png)
5. [Workout history](m3/05-workout-history.png)
6. [Workout details](m3/06-workout-detail.png)
7. [Finish confirmation](m3/07-finish-confirmation.png)

**Runtime scope (do not confuse QA with the published app):** workout START, confirmed sets, explicit FINISH/CANCEL, local SQLite history and causal FastAPI synchronization have been **implemented and physically validated on the separately packaged Android QA release** (PR #171, isolated test account/database). The ordinary published `/train` route still displays the catalogue; these workout flows and background sync are **not shipped as a production feature**. Do not treat the QA success as production readiness or skip production integration, account isolation, deletion/retention or security gates. See [PROJECT_STATE](../../project-context/PROJECT_STATE.md) for the execution queue; its older #153 narrative predates the later merged QA slices.

**Rest timer scope:** a **basic live-workout rest timer is an accepted M3/MVP requirement that is not yet implemented** ([M3 Workout Engine Product Contract §15.4](../M3_WORKOUT_ENGINE_PRODUCT_CONTRACT.md), [MVP](../../product-specs/MVP.md)). The timer pictured on the dark workout board is an illustrative placeholder, **not a functioning or completed timer**. Its basic implementation remains an **open M3 implementation task**; only advanced rest programming can be deferred to a subsequent sprint.

Other capabilities depicted but not yet implemented—advanced RIR/RPE interactions, persistent notes and finished-workout editing, predictive catalogue search, routines, plans, social and rankings—require their own explicitly scoped implementation slices. None should be inferred to exist from these PNGs.

## Board 2 — Existing shell / visual continuity

![General product shell and identity, including dark authentication](02-product-shell.png)

8. [Home](shell/08-home.png)
9. [Progress — concept for later sprint](shell/09-progress-future.png)
10. [Social — concept for later sprint](shell/10-social-future.png)
11. [Profile](shell/11-profile.png)
12. [Welcome — dark auth direction](shell/12-welcome-auth.png)
13. [Sign in — dark auth direction](shell/13-sign-in-auth.png)
14. [Sign up — dark auth direction](shell/14-sign-up-auth.png)

Navigation must retain **Inicio · Progreso · Entrenar · Social · Perfil**, with a prominent central training action. The actual brand assets live under [`/brand`](../../../brand/) and `apps/mobile/assets/brand/`. **Welcome photography has not yet been imported into Figma v2:** its existing canonical asset is `apps/mobile/assets/images/welcome-hero.png`; do not treat the abstract placeholder as an approved substitute.

Metrics and sample ranking names shown in the mockups are illustrative **design data, not live user information**. Do not insert fake values into production.

## Board 3 — Future functionality (separate sprints)

![Five future modules, intentionally outside the M3 visual-redesign implementation](03-future-sprints.png)

15. [Create / configure workout](future/15-create-configure.png)
16. [Workout library](future/16-workout-library.png)
17. [Training plans](future/17-training-plans.png)
18. [Exercise dictionary](future/18-exercise-dictionary.png)
19. [Events and challenges](future/19-events-challenges.png)

These screens are **visual-only proposals**. Plans, routines, recommendations, social/rankings, progress analytics, enriched exercise content and events require separately scoped development sprints.

## Review and implementation rules

- Compare the visual treatment against the three original approved images and the [product visual foundation](../KEYLORFORGE_VISUAL_FOUNDATION.md).
- **Standard mode is light**; **active workout is dark and distraction-minimizing**; auth preserves its separate dark photographic direction.
- The Figma file is the **editable source**. GitHub PNGs are **versioned previews/reference evidence**, not interactive implementations.
- Keep the existing production naming **KeylorForge** and the original G4 mark; no generic letter-logo substitutions.
- The **M3 UX visual sprint is presentation-only**, using the currently implemented QA-safe domain flows; it must not silently promote isolated QA behavior into ordinary production. M3-required gaps such as the **basic rest timer** remain explicitly tracked for a dedicated M3 implementation slice and are not waived by the visual redesign. Other capabilities get their own sprint/contract/QA.
- Preserve offline-first behavior, session history, SQLite outbox, security and previously approved physical-device test results. Do not reset or uninstall the Android QA application to check visual changes.
- Approval and progress tracked in [issue #169](https://github.com/Limman-qaidev/keylorforge/issues/169).

**Captured:** 2026-10-22 from the editable Figma design. All images are native PNG snapshots that GitHub can preview directly. 
