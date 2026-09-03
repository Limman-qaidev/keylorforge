# KeylorForge Visual Foundation

Status: **Product Owner approved visual direction**

Issue: #51 (`UX-001 — Establish KeylorForge mobile visual design foundation`)

This document is the implementation contract for KeylorForge's visual foundation. It exists so implementation agents do not invent product/UI direction while coding.

The approved broader product-direction reference is committed at:

`docs/design-docs/keylorforge-ui-reference/keylorforge-ui-foundation-v1.png`

The approved broader M1/product-shell reference is committed at:

`docs/design-docs/keylorforge-ui-reference/keylorforge-m1-reference-v1.png`

The approved **Welcome/Auth close visual target** is committed at:

`docs/design-docs/keylorforge-ui-reference/keylorforge-auth-reference-v1.png`

The reference boards are visual specifications, not sources of domain truth. Where generated mockup text/data or controls conflict with product/domain contracts, current product/domain contracts win. A control shown in a board must not be made fake merely for screenshot parity.

For Welcome, Sign in and Sign up specifically, `keylorforge-auth-reference-v1.png` is the closest visual target and should be matched closely in composition, energy, imagery, hierarchy, density, spacing and control treatment, subject to platform/accessibility constraints and real product behavior.

## 1. Product personality

KeylorForge should feel fresh, motivating, modern and immediately useful while training.

The visual/product language draws inspiration from the strengths of:

- Garmin Connect: visible progress, performance data and useful summaries.
- Spotify: personality, energy, imagery and an immersive focused mode.
- Wellhub: approachable, fresh fitness/wellness presentation.
- X: compact, content-first navigation and low-friction scanning.

KeylorForge must **not** read like a generic SaaS dashboard, corporate banking app, form scaffold, or bodybuilding cliché.

## 2. Product hierarchy

The primary product action is **training**.

Progress is the second pillar: the user should understand whether they are training consistently and improving.

Social competition is deliberately visible but secondary. Rankings, friends, challenges and events should motivate without obstructing the training workflow.

## 3. Navigation model

Approved primary navigation concept:

`Inicio · Progreso · Entrenar · Social · Perfil`

`Entrenar` is visually prominent and centrally positioned.

The bottom navigation must remain compact and usable with one hand. Navigation labels should be explicit; do not rely on ambiguous icons alone.

Implementation ownership for the authenticated five-destination shell is tracked in #67. UX-001 may define/reuse the visual language, but must not invent future Progress/Workout/Social domain data merely to populate the shell.

## 4. Surface modes

### 4.1 Standard application mode

Home, Progress, Training Hub, Social, Profile and configuration surfaces use the fresh light visual language:

- bright/clean surfaces
- compact information density
- blue/cyan/teal performance accents
- imagery where it increases motivation or recognition
- strong hierarchy without oversized explanatory copy
- cards only when they group meaningful information; avoid card-everything UI

Auth uses the approved treatment shown in `keylorforge-auth-reference-v1.png`; this includes a high-energy dark photographic Welcome and dark, refined authentication surfaces rather than generic white scaffold forms.

### 4.2 Active workout mode

An active workout uses a dark, immersive, distraction-minimizing mode.

The active workout surface prioritizes:

1. current exercise
2. current set / kg / reps
3. completing the set
4. rest timer
5. completed sets
6. next exercise context

Do not bury the active set behind analytics, social content or navigation complexity.

## 5. Approved representative surfaces

### Welcome / Auth

The Welcome/Auth triptych is a close target, not merely loose inspiration.

Welcome should preserve:

- strong athlete/gym imagery
- dark/navy visual field
- high contrast
- KeylorForge branding integrated into the composition
- white + teal/blue/purple hierarchy
- strong, compact motivational copy
- a prominent lower CTA area

Sign in and Sign up should preserve the triptych's density, spacing, hierarchy, input treatment and visual refinement.

Functional ownership remains separate where appropriate:

- password recovery belongs to #41
- Google/Apple provider authentication belongs to #66

Do not ship dead recovery/social-auth controls to mimic the image. Integrate their approved visual treatment once the owning issue supplies real behavior.

### Home

- user avatar/photo is visible
- weekly activity summary is near the top
- next/continuable workout has visual imagery and a prominent CTA
- progress teaser is visible
- weekly friends ranking teaser is visible but compact
- Home is not a social feed and is not dominated by ranking content

For the current M1 implementation, do **not** fabricate unavailable workout, ranking or progress data just to mimic the future board. Preserve the visual hierarchy and product character using only data/functionality that really exists.

### Active workout

- dark immersive presentation
- current workout/exercise clearly identified
- fast kg/reps entry
- large, obvious `Completar serie` action
- completed/current/pending series are easy to distinguish
- rest timer is visible
- next exercise context is visible

### Progress

- progress is visual rather than prose-heavy
- show useful charts and deltas
- support consistency/frequency and exercise/muscle performance
- avoid turning the page into a spreadsheet

### Training Hub

The hub is the entry point for choosing how to train. Conceptually it may expose:

- continue current workout
- free workout
- saved workouts
- preprogrammed routines
- training plans
- exercise dictionary
- create/configure workout

These future capabilities are product-direction context; implementation remains milestone/issue driven.

### Social / Ranking

- weekly friends ranking can be scanned quickly
- the current user is visually identifiable in the ranking
- challenges/events may be surfaced below the ranking
- social competition must not interrupt or block training

### Create / configure workout

The user does **not** manually estimate workout duration.

Duration is calculated automatically from configured exercises, number of sets and rest configuration.

Workout configuration must support:

- exercise selection and ordering
- set counts / targets as defined by the workout domain contract
- rest between sets
- rest between exercises
- optional intensity metadata such as RPE/RIR where supported

### Exercise dictionary

Exercise surfaces should support recognizable imagery/video context, muscles/equipment/technique information and personal performance context where available.

### Plans, events and challenges

These are first-class future product surfaces and should reuse the same visual language rather than inventing a separate mini-product.

## 6. Visual token direction

The exact implementation tokens must be defined in code and documented by UX-001, but they must preserve the approved visual character.

### Color roles

Required semantic roles include at least:

- canvas/background
- raised surface
- primary text
- secondary/muted text
- border/divider
- primary action / training blue
- progress/success teal
- strength/secondary accent
- warning/attention
- destructive/error
- disabled
- dark-workout canvas/surface/text variants

Colors must be named by **semantic role**, not by visual value (`blue500`, `orange400`) in consumer components.

### Typography

Typography should be modern, compact and highly legible on a phone during training.

Use a restrained scale with roles such as:

- display / key workout metric
- page title
- section title
- body
- label
- caption / metadata
- tab/navigation label

Do not use oversized marketing-style headings on routine operational screens.

### Spacing and geometry

- minimum interactive touch target: 48 dp
- use a small, consistent spacing scale
- use moderate rounded corners; avoid turning every element into a large floating pill/card
- dividers and whitespace are preferred over unnecessary nested cards
- respect Android safe areas and keyboard behavior

## 7. Reusable component foundation required by #51

The implementation should provide a small composable foundation rather than a large third-party UI framework.

At minimum, reusable primitives should be introduced when required by real implemented screens rather than speculatively building a large component library. Likely reusable roles include:

- application screen/safe-area shell
- section heading
- card/section surface
- primary/secondary/destructive buttons
- compact icon action
- text input / password treatment
- validation/error message
- loading state
- empty state
- avatar treatment
- progress/delta indicators where genuinely reusable

Components should expose intent/semantic variants rather than screen-specific colors.

## 8. UX-001 scope and issue boundaries

UX-001 is a **foundation issue**, not permission to implement every surface visible in a concept board.

The accepted implementation is allowed to land in bounded slices. #51 remains open while dependent/adjacent issues provide real behavior required by the final visual experience.

Ownership boundaries:

- #51 owns the visual foundation and visual composition of Welcome/Auth and other accepted M1 surfaces.
- #41 owns real password recovery behavior.
- #66 owns real Google/Apple provider authentication.
- #67 owns the authenticated five-destination app shell.
- later domain milestones own Progress analytics, workout functionality, rankings and social content.

### Current implementation slice

The next bounded #51 implementation pass is intentionally limited to:

1. Welcome visual parity
2. Sign in visual parity using existing email/password behavior
3. Sign up visual parity using existing email/password behavior
4. only the tokens/primitives required by those surfaces
5. preservation of existing authentication/session behavior
6. accessibility and physical Android visual smoke

Do **not** modify Home, Profile, the authenticated five-destination shell, password-recovery behavior, provider-auth behavior, backend, database or Supabase contracts in this slice.

## 9. Reference-image usage during implementation

For every visual implementation PR touching this foundation:

- inspect `keylorforge-ui-foundation-v1.png` for the broader product language
- inspect `keylorforge-m1-reference-v1.png` for broader M1 composition
- when touching Welcome/Auth, inspect `keylorforge-auth-reference-v1.png` and treat it as the closest visual target
- compare rendered physical-device screenshots side-by-side against the relevant reference before acceptance
- preserve hierarchy, density, imagery treatment, navigation character and mode distinction
- do not blindly reproduce generated text, fake data, unsupported provider behavior or impossible details

A visual difference is acceptable when required by accessibility, platform behavior, real product requirements or existing domain contracts. Material visual-direction changes require Product Owner approval.

## 10. Accessibility / device requirements

- normal text and controls must meet appropriate contrast requirements
- interactive targets should be at least 48 dp
- dynamic text must not destroy the primary task
- keyboard opening must not make form actions unreachable
- Android status/navigation safe areas must be handled correctly
- loading, error, disabled and success states must be distinguishable without relying only on color

## 11. Non-goals

UX-001 does not require:

- pixel-perfect production brand system
- full dark mode across the entire app
- marketing site design
- full animation/motion system
- implementation of workout engine, exercise catalog, rankings, social feed, plans or events ahead of their domain milestones
- fake Google/Apple authentication
- fake workout/progress/social data used only to make a screen resemble a mockup
- adoption of a large UI framework

The active-workout dark mode is a purposeful product mode and is distinct from implementing a universal app-wide dark theme.

## 12. Acceptance for the foundation

UX-001 is complete only when:

- the approved visual references are versioned alongside this contract
- visual tokens/primitives required by implemented surfaces are reusable and coherent
- existing M1 user-facing surfaces no longer look like engineering scaffolding
- Welcome/Auth closely match the Product Owner-approved auth triptych
- the authenticated shell is integrated from #67 where required for final M1 presentation
- real password-recovery/provider controls are integrated from their owning identity issues rather than faked
- accessibility basics pass
- tests/CI pass
- Product Owner visually reviews the implementation on a physical Android device and approves it

Until then, #51 remains open.
