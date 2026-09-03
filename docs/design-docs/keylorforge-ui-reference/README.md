# KeylorForge UI visual references

This directory stores Product Owner-approved visual references used while implementing the mobile UI.

## Product-direction reference

Canonical file:

`keylorforge-ui-foundation-v1.png`

This is the approved concept board covering the broader KeylorForge visual language for Home, active workout, Progress, Training Hub, Social/Ranking and representative future product surfaces.

## M1 product-shell reference

Canonical file:

`keylorforge-m1-reference-v1.png`

This board is the Product Owner-approved M1 reference covering:

- Welcome
- Sign in
- Sign up
- authenticated Home
- Profile
- loading/skeleton states
- full-screen/component/action error states
- the compact bottom-navigation treatment expected for the authenticated product shell

It remains the broad M1 composition reference. Domain functionality shown illustratively is not automatically in scope.

## UX-001 Welcome/Auth close target

Canonical file:

`keylorforge-auth-reference-v1.png`

This triptych is the Product Owner-approved **close visual target** for the current Welcome/Auth implementation slice of #51:

- Welcome
- Sign in
- Sign up

For those three surfaces, implementation should reproduce the triptych's composition, visual energy, dark treatment, imagery, hierarchy, density, spacing and control language as closely as platform/accessibility and real product contracts allow.

The reference may show controls owned by other issues. Their appearance in the image does not authorize fake behavior:

- password recovery functionality belongs to #41
- real Google/Apple authentication belongs to #66
- the five-destination authenticated shell belongs to #67

Do not render dead controls solely to make a screenshot resemble the reference. Integrate those controls when their owning issues provide real behavior.

## Reference precedence

Implementation agents working on #51 must inspect the relevant references before coding:

1. `keylorforge-ui-foundation-v1.png` defines the broader KeylorForge product language.
2. `keylorforge-m1-reference-v1.png` defines the broader M1 composition/product-shell direction.
3. `keylorforge-auth-reference-v1.png` is the closest visual target for Welcome, Sign in and Sign up.
4. `../KEYLORFORGE_VISUAL_FOUNDATION.md` and current product/domain contracts remain authoritative for behavior, architecture, accessibility and milestone boundaries.

Generated mockup text/data is never a source of domain truth. Do not fabricate rankings, workout data, plans, routines, social content, provider behavior or persistence rules merely because they appear in a visual reference.

When a new visual direction is approved, add it as a versioned reference rather than silently overwriting historical references, and document which scope it supersedes or narrows.
