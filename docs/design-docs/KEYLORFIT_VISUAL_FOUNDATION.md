# KeylorFit Visual Foundation

Status: **Product Owner approved visual direction**

Issue: #51 (`UX-001 — Establish KeylorFit mobile visual design foundation`)

This document is the implementation contract for KeylorFit's visual foundation. It exists so implementation agents do not invent product/UI direction while coding.

The approved visual reference is committed at:

`docs/design-docs/keylorfit-ui-reference/keylorfit-ui-foundation-v1.jpg`

The image is a **directional visual reference**, not a pixel-perfect screenshot specification and not a commitment that every future feature shown in the concept exists in the current milestone. Where generated mockup text or data conflicts with product/domain contracts, the product/domain contracts win.

## 1. Product personality

KeylorFit should feel fresh, motivating, modern and immediately useful while training.

The visual/product language draws inspiration from the strengths of:

- Garmin Connect: visible progress, performance data and useful summaries.
- Spotify: personality, energy, imagery and an immersive focused mode.
- Wellhub: approachable, fresh fitness/wellness presentation.
- X: compact, content-first navigation and low-friction scanning.

KeylorFit must **not** read like a generic SaaS dashboard, corporate banking app, form scaffold, or bodybuilding cliché.

## 2. Product hierarchy

The primary product action is **training**.

Progress is the second pillar: the user should understand whether they are training consistently and improving.

Social competition is deliberately visible but secondary. Rankings, friends, challenges and events should motivate without obstructing the training workflow.

## 3. Navigation model

Approved primary navigation concept:

`Inicio · Progreso · Entrenar · Social · Perfil`

`Entrenar` is visually prominent and centrally positioned.

The bottom navigation must remain compact and usable with one hand. Navigation labels should be explicit; do not rely on ambiguous icons alone.

## 4. Surface modes

### 4.1 Standard application mode

Home, Progress, Training Hub, Social, Profile, Auth and configuration surfaces use the fresh light visual language:

- bright/clean surfaces
- compact information density
- blue/cyan/teal performance accents
- imagery where it increases motivation or recognition
- strong hierarchy without oversized explanatory copy
- cards only when they group meaningful information; avoid card-everything UI

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

The approved reference establishes direction for these surfaces:

### Home

- user avatar/photo is visible
- weekly activity summary is near the top
- next/continuable workout has visual imagery and a prominent CTA
- progress teaser is visible
- weekly friends ranking teaser is visible but compact
- Home is not a social feed and is not dominated by ranking content

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

At minimum:

- application screen/safe-area shell
- active-workout dark shell
- bottom navigation shell / item treatment
- section heading
- card/section surface
- primary button
- secondary button
- destructive button
- compact icon action
- text input
- numeric/set input treatment
- validation/error message
- loading state
- empty state
- avatar treatment
- progress/delta indicator primitives where genuinely reusable

Components should expose intent/semantic variants rather than screen-specific colors.

## 8. Current UX-001 implementation scope

UX-001 is a **foundation issue**, not permission to implement every surface visible in the concept board.

For the current repository state, the implementation should:

1. introduce the approved token/component foundation
2. upgrade existing Welcome/Auth surfaces to the approved language
3. upgrade authenticated Home while preserving existing M1 behavior
4. upgrade Profile while preserving the server-backed M1 profile behavior
5. establish the navigation/shell direction needed for future M2 surfaces without inventing unfinished M2 features
6. document how future screens consume the foundation
7. pass accessibility and physical Android smoke

Do not fake unavailable domain data or ship non-functional future menu items merely because they appear in the concept reference.

## 9. Reference-image usage during implementation

For every visual implementation PR touching this foundation:

- open the approved reference image before coding
- compare the rendered phone UI against the relevant region of the reference
- preserve hierarchy, density, imagery treatment, navigation character and mode distinction
- do not blindly reproduce generated text, fake data or impossible details
- attach/update device screenshots in PR evidence when practical

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
- adoption of a large UI framework

The active-workout dark mode is a purposeful product mode and is distinct from implementing a universal app-wide dark theme.

## 12. Acceptance for the foundation

UX-001 is complete only when:

- the approved visual reference is committed alongside this contract
- visual tokens and reusable primitives are implemented
- existing M1 user-facing screens no longer look like engineering scaffolding
- implementation matches the approved visual direction at product level
- accessibility basics pass
- tests/CI pass
- Product Owner visually reviews the implementation on a physical Android device and approves it

Until then, #51 remains open.
