# KeylorFit UI visual references

This directory stores Product Owner-approved visual references used while implementing the mobile UI.

## Product-direction reference

Canonical file:

`keylorfit-ui-foundation-v1.png`

This is the approved concept board covering the broader KeylorFit visual language for Home, active workout, Progress, Training Hub, Social/Ranking and representative future product surfaces.

## UX-001 / current M1 implementation reference

Canonical file:

`keylorfit-m1-reference-v1.png`

This board is the Product Owner-approved implementation reference for the current UX-001 scope. It covers:

- Welcome
- Sign in
- Sign up
- authenticated Home
- Profile
- loading/skeleton states
- full-screen/component/action error states
- the compact bottom-navigation treatment expected as the foundation for later product surfaces

Implementation agents working on #51 must inspect **both** reference images before coding. The broad foundation board defines the product language; the M1 board is the closer visual target for screens that actually exist in the current milestone.

These images are **directional references**, not sources of product truth. Implementations must also read `../KEYLORFIT_VISUAL_FOUNDATION.md` and the relevant product/domain contracts.

Do not infer unfinished product behavior, API contracts, ranking algorithms or persistence rules from generated mockup copy/data. In particular, do not ship fake rankings, workout data, plans, routines, social features or third-party auth merely because they appear in a concept board.

When a new visual direction is approved, add it as a versioned reference rather than silently overwriting historical references. Update the visual-foundation contract to identify which version is canonical for the affected implementation scope.
