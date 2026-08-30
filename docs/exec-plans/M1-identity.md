# M1 Identity execution plan

- Status: Planned
- Milestone: M1
- Parent issue: #36
- Owners: project_manager + tech_lead

## Objective

Deliver the first visibly product-like KeylorFit slice on a real phone while preserving ADR-002: Supabase Auth owns identity/token issuance and FastAPI owns application authorization.

M1 is not complete merely because auth libraries are wired or CI passes. The user must be able to use the identity flow on a physical device.

## Final physical-device demo gate

The primary acceptance journey is:

```text
launch signed out
-> welcome/auth UI
-> register or sign in
-> authenticated app shell
-> protected FastAPI identity/profile
-> edit profile
-> restart app and remain signed in
-> sign out
-> sign in again
```

M1 must also independently prove:

- access-token expiry while the refresh session remains valid causes a successful session refresh and protected API access continues without user intervention;
- refresh failure/invalid refresh credentials fail safely back to the signed-out state rather than leaving a stale authenticated shell;
- password recovery from the physical development client;
- account deletion using a disposable account;
- after deletion, access tokens and refresh credentials issued before deletion cannot regain protected access or recreate application state, and a new password login for the deleted identity cannot restore the deleted KeylorFit account under the accepted final semantics;
- invalid/missing/expired token behavior fails closed;
- no privileged Supabase credential is present in the mobile bundle or repository.

The primary launch experience must no longer be the M0 health diagnostics screen. Diagnostics may remain available as development tooling, but the app should now look and behave like an early product.

## Product scope

M1 implements:

- email/password registration;
- login/logout;
- session persistence/refresh;
- authenticated versus unauthenticated navigation;
- basic server-backed profile;
- password recovery;
- account deletion/privacy flow;
- server-side JWT validation and authorization foundation.

M1 does not implement OAuth/social providers, exercise catalogue, workouts, groups, rankings, social feed, production deployment, or a final visual design system.

## Architectural invariants

1. Supabase Auth establishes identity and issues access tokens.
2. FastAPI validates the token and derives the authenticated principal from it.
3. Protected endpoints never trust a client-supplied owner/user identifier.
4. KeylorFit application user/profile data is owned by the application database and linked deterministically to the external auth subject.
5. Privileged Supabase/service-role credentials remain server-side only.
6. Public Expo configuration contains only values intentionally safe to ship in a client bundle.
7. Account deletion has an explicit terminal identity state: valid-looking credentials issued before deletion must not be able to reprovision or regain a deleted KeylorFit account.
8. Any change to these boundaries requires ADR review rather than silent drift.

## Work items and dependencies

### IDN-001 — Identity contract and Supabase development configuration (#37)

First gate. Make provider configuration, JWT verification, access/refresh-token lifecycle, auth restoration, recovery/deep-link behavior, external-subject mapping, deleted-identity semantics and deletion authority implementation-ready. This work may expose a manual Supabase project provisioning step; if so, document the exact user action and never request privileged secrets in chat or commit them.

The contract must define how access-token expiry is exercised in development, what happens when refresh succeeds or fails, and how FastAPI prevents a deleted external subject from recreating application state while old credentials are still cryptographically valid.

### IDN-002 — Backend JWT validation and user/profile foundation (#38)

Depends on IDN-001. Build fail-closed token validation, reusable authenticated principal, application user/profile persistence and the first protected identity endpoint. Real PostgreSQL integration tests apply where persistence semantics matter.

### IDN-003 — Mobile auth UX/session/protected navigation (#39)

Depends on IDN-001 and may run in parallel with IDN-002 in an isolated worktree. Build the visible signed-out and signed-in product shell, forms, session restoration, route protection, automatic session refresh and logout.

**First visible product checkpoint:** after IDN-003, the phone should already show a real KeylorFit welcome/login/register experience and authenticated shell, even before profile integration is complete. Acceptance also exercises access-token expiry with a still-valid refresh session and a refresh-failure path back to signed out.

### IDN-004 — Authenticated profile API + mobile editing (#40)

Depends on IDN-002 and IDN-003. Connect the authenticated mobile shell to FastAPI/PostgreSQL and provide a minimal editable profile with server-side validation and ownership protection.

**Second visible checkpoint:** after IDN-004, signing in leads to a genuinely server-backed user experience rather than only an auth-provider session.

### IDN-005 — Password recovery/deep links (#41)

Depends on the stable IDN-001/IDN-003 auth lifecycle. Verify the complete recovery journey on the supported physical development client. If Expo Go cannot reliably satisfy the accepted redirect model, document the limitation and use the smallest supported development-build approach rather than weakening the security model.

### IDN-006 — Account deletion/privacy flow (#42)

Depends on the authenticated backend/mobile/profile foundation. Any provider-administration privilege remains server-side. Deletion semantics must be retry-safe, must not permit deletion of a different user by identifier manipulation, and must define a terminal deleted-identity behavior that rejects pre-deletion access/refresh credentials and prevents automatic reprovisioning of application state.

### IDN-007 — Integrated acceptance (#43)

Final M1 gate. QA and security independently verify the complete physical-device journeys, including token refresh/refresh failure and post-deletion credential rejection, and update durable project state with real evidence. M2 must not begin until this gate passes.

## Parallelization

After IDN-001 is accepted:

```text
IDN-002 backend/data  \
                       > parallel in isolated worktrees
IDN-003 mobile UX     /
```

Then:

```text
IDN-002 + IDN-003 -> IDN-004
IDN-003           -> IDN-005
IDN-002 + IDN-003 + IDN-004 -> IDN-006
all above -> IDN-007
```

Avoid concurrent edits to shared cross-cutting configuration without explicit coordination. Each implementation issue normally maps to one focused PR.

## Review gates

- IDN-001: tech_lead + security_engineer
- IDN-002: security_engineer + qa_engineer; data_engineer owns migration semantics
- IDN-003: qa_engineer
- IDN-004: qa_engineer; security review for ownership/authorization findings
- IDN-005: security_engineer + physical-device QA
- IDN-006: mandatory security_engineer + qa_engineer
- IDN-007: independent QA + security final acceptance

Implementation agents do not self-approve.

## CI and branch policy

Every PR targets protected `main` and must receive the three authoritative required checks:

- `Backend CI / Backend CI`
- `Mobile CI / mobile-quality`
- `Database Migration CI / Database migration validation`

Strict branch protection and conversation resolution remain in force. No direct push to `main` is part of the normal workflow.

## Definition of Done for M1

M1 is complete only when:

- IDN-001 through IDN-007 are accepted/closed;
- physical-device registration/login/logout works;
- session restoration across app restart works;
- access-token expiry is exercised while the refresh session is valid and protected API access continues after refresh;
- refresh failure safely returns the user to signed out;
- FastAPI authenticates the real access token and returns only the caller's protected identity/profile;
- profile edits persist through PostgreSQL;
- password recovery works end-to-end;
- account deletion works for a disposable account;
- pre-deletion access/refresh credentials cannot regain protected access or recreate deleted application state, and the accepted login-after-deletion behavior is verified;
- invalid/missing/expired tokens fail closed;
- no privileged auth secret is present in mobile/repository history introduced by M1;
- all required CI is green;
- security review has no blocking findings;
- independent QA records the final physical-device evidence;
- `PROJECT_STATE.md` records M1 completion before M2 starts.
