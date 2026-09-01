# KeylorFit mobile UI foundation

The reusable light-mode foundation for M1 lives in `apps/mobile/components/ui/`.

- `tokens.ts` defines semantic application and future active-workout roles, typography, spacing, geometry, elevation and touch targets.
- `screen.tsx`, `card.tsx`, `section-heading.tsx` and `avatar.tsx` supply structural surfaces.
- `button.tsx`, `form.tsx` and `feedback.tsx` supply controls and accessible loading, validation, empty and skeleton states.

Future M2 screens should compose these primitives and use semantic tokens rather than raw color values. Add a new primitive only when it is useful on more than one surface. The future five-item navigation (`Home`, `Progress`, `Train`, `Social`, `Profile`) should reuse the compact action treatment, but routes must only be exposed when functional.

The standard application remains light-only. The workout color roles are reserved for the later active-workout immersive mode; global dark mode is intentionally deferred.
