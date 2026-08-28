# Mobile Engineering Instructions

These instructions extend the repository-level `AGENTS.md` for `apps/mobile/`.

## Ownership

Primary implementation owner: `mobile_engineer`.

Use `qa_engineer` for independent test design and regression verification. Use `tech_lead` when a change alters navigation architecture, state boundaries, offline synchronization semantics, API contracts, or introduces a major dependency. Use `security_engineer` for authentication, local sensitive-data storage, media permissions, privacy, or credential-related changes.

## Technology baseline

The mobile application uses:
- React Native
- Expo
- TypeScript
- Expo Router
- TanStack Query for server state
- Zustand for bounded client state
- React Hook Form + Zod for forms and validation
- Expo SQLite for local persistence and offline workflows

Do not replace these technologies or add overlapping state, routing, form, or persistence frameworks without an approved architectural decision.

## Design rules

- Keep TypeScript strict and avoid `any` unless a concrete boundary requires it and the reason is documented.
- Prefer feature-oriented code with small reusable UI components.
- Keep route files thin; domain/UI logic belongs in feature modules, hooks, services, or components.
- Treat TanStack Query as the primary cache for remote/server state.
- Use Zustand only for state that is genuinely client-local or cross-screen and cannot be represented cleanly by route state, component state, SQLite, or TanStack Query.
- Do not duplicate server data into multiple client stores without a documented reason.
- Validate user input at the form boundary with shared or explicit schemas.
- Accessibility is required: labels, touch targets, semantic roles, keyboard behavior, and readable error states must be considered.

## API integration

- Do not invent backend contracts.
- Do not manually edit generated API-client files.
- If the required endpoint or field is absent, report the exact contract required and coordinate with `backend_engineer` / `tech_lead`.
- Never trust client-side checks as authorization.
- Never hard-code production endpoints, tokens, service-role keys, or secrets.
- Handle network failures explicitly; do not silently discard user actions.

## Offline-first workout behavior

Workout recording must remain usable when the network is unavailable.

- Persist user workout actions locally according to the approved synchronization design.
- Surface meaningful synchronization state when pending or failed writes affect the user.
- Do not invent conflict-resolution or idempotency rules; follow the relevant ADR/design document.
- A successful local UI update must not falsely imply that remote synchronization has succeeded.
- Preserve enough local information to retry recoverable synchronization failures.

## UI and UX

- Optimize the workout-entry flow for low interaction cost in a gym context.
- Avoid blocking UI on network calls when the workflow is designed to operate locally.
- Loading, empty, error, offline, and retry states are part of the feature, not optional polish.
- Platform-specific code should be isolated behind small interfaces when possible.

## Testing

For each functional change, add the smallest useful combination of:
- unit tests for pure logic
- component tests for UI behavior
- integration tests for feature flows
- synchronization/offline tests when persistence or networking changes

Avoid brittle tests tied to incidental implementation details. Do not weaken assertions merely to make CI pass.

## Before completing work

- inspect the complete diff
- run the configured TypeScript checks
- run the configured lint/format checks
- run relevant mobile tests
- verify offline/error states where applicable
- verify acceptance criteria
- report anything that could not be validated

Do not modify backend, database migrations, infrastructure, or unrelated application areas as part of a mobile task.