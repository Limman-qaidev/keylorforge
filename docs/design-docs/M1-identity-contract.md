# M1 Identity contract

- Status: Accepted for IDN-001
- Parent milestone: #36
- Issue: #37
- Architectural authority: ADR-002
- Scope: development identity/authentication contract for Expo + FastAPI + PostgreSQL

## Purpose

This document turns ADR-002 into an implementation contract for M1. It does not implement authentication. It defines the provider boundary, configuration, token validation, session behavior, recovery/deep-link behavior, application-user mapping, and deletion semantics that IDN-002 through IDN-007 must follow.

The invariant remains:

`Supabase Auth authenticates -> FastAPI validates identity and authorizes -> Keylornet PostgreSQL stores application identity/profile data`

The mobile app is never authoritative for ownership or user identity.

## Provider and client baseline

Use Supabase Auth email/password for M1. OAuth/social providers are explicitly out of scope.

For the Expo client, use the current Supabase React Native approach:

- `@supabase/supabase-js`
- a React Native-compatible persistent storage implementation
- `autoRefreshToken: true`
- `persistSession: true`
- `detectSessionInUrl: false`
- explicit app-state handling so refresh work is active while the app is foregrounded and stopped while backgrounded where appropriate

The repository currently has Expo SDK 57 / React Native 0.86 and already declares the custom app scheme `keylornet` in `apps/mobile/app.json`.

## Observed Supabase development-project state

The connected Keylornet development project is active in `eu-central-1` and exposes a modern publishable API key. During IDN-001 setup, the Authentication dashboard was checked manually and confirmed:

- Email/password provider enabled.
- Email confirmation enabled.
- Redirect URLs configured for `keylornet://auth/confirm` and `keylornet://auth/recovery`.
- Current JWT signing key is asymmetric ECC P-256, suitable for public JWKS verification.
- A legacy HS256 shared-secret signing key remains only under **Previously used keys** after rotation; it is not the current signing key.

Do not revoke the previous legacy key merely to finish IDN-001. Revocation is a separate cleanup step and must happen only after legacy API-key dependencies and outstanding token lifetime have been considered. New Keylornet implementation must use the publishable-key + asymmetric-JWKS model and must not add new dependencies on legacy `anon`, `service_role`, or shared JWT-secret verification.

## Public, backend, and privileged configuration

### Safe/public mobile configuration

These values are intentionally shippable in a mobile bundle:

- `EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...`
- existing `EXPO_PUBLIC_API_BASE_URL`

The Supabase publishable key is not a secret. It identifies the project and has low privileges. Authorization still depends on the user's JWT and server/RLS policy. M1 must use the current publishable key rather than introducing a new dependency on legacy `anon` keys.

### Backend configuration that is not privileged

FastAPI may derive these from the project reference/URL or configure them explicitly:

- Supabase project URL
- issuer: `https://<project-ref>.supabase.co/auth/v1`
- JWKS URL: `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json`
- expected authenticated audience: `authenticated`

These identify the trusted issuer; they do not grant administrative access.

### Privileged server-only configuration

Account administration in IDN-006 requires a Supabase secret/server credential. Use a current `sb_secret_...` key rather than introducing the legacy `service_role` key unless provider constraints require otherwise.

A privileged Supabase secret must:

- exist only in local/server secret storage;
- never use an `EXPO_PUBLIC_` prefix;
- never be committed;
- never be put in PR descriptions, issue comments, screenshots, logs, or chat;
- be used only by backend code that has already authenticated and authorized the requesting Keylornet user.

The secret value does not need to be copied out of the Supabase dashboard during IDN-001. Provision it into backend-only local/deployment secret storage when IDN-006 actually needs administrative deletion capability, minimizing unnecessary exposure.

## Development Supabase project requirements

Use the existing dedicated Keylornet development project for M1 acceptance.

Required dashboard state:

1. Email/password authentication enabled.
2. Email confirmation enabled for the real M1 confirmation flow.
3. Current publishable API key available for the Expo client.
4. Current asymmetric JWT signing-key system active; Keylornet expects a JWKS endpoint with public verification keys.
5. Redirect URLs configured for the Keylornet custom scheme used by the development build.
6. A server secret key can be provisioned later for the deletion flow; do not put it in mobile configuration and do not expose it early without a consumer.

Do not alter auth timeouts/session policy simply to make tests pass. Use normal provider behavior unless a specific acceptance test needs a temporary, documented development setting.

## Mobile redirect and deep-link contract

The repository already declares:

`scheme: keylornet`

Use stable app callbacks under that scheme:

- `keylornet://auth/confirm`
- `keylornet://auth/recovery`

Exact route filenames may be adjusted by IDN-003/IDN-005 while preserving these semantic endpoints.

For provider redirects requiring a stable callback URL, the supported M1 physical-device client is a development build, not Expo Go. Expo Go uses an `exp://` URL whose address is not stable enough to be the durable authentication callback contract. Expo Go can still be used for flows that do not depend on stable provider redirects, but IDN-005 recovery acceptance must use the supported development build if required.

Supabase Auth Redirect URLs must allow the Keylornet custom scheme for the M1 development project. Use the narrowest practical allowed callback set rather than an unnecessarily broad production wildcard.

## Registration and email confirmation

M1 signup uses email/password.

Expected states:

1. User submits email/password.
2. Supabase returns either a usable session or a confirmation-required state according to project settings.
3. When confirmation is required, the app displays an explicit pending-confirmation state rather than pretending the user is authenticated.
4. The confirmation link returns to the Keylornet development build through the configured deep link.
5. The resulting Supabase session becomes the only source of authenticated client identity.

Provider errors must be mapped to understandable UI errors. Do not reveal internal provider responses or credentials verbatim to users.

## Login, logout, persistence, and refresh

### Login

Email/password login creates a Supabase session containing an access JWT and refresh token.

### Persistence

The mobile client persists the Supabase session using a supported React Native storage adapter. IDN-003 chooses the concrete adapter after checking the current Expo/Supabase package compatibility; the current official Expo quickstart supports persistent client storage, and Supabase also documents AsyncStorage as a React Native option.

The app must restore session state before deciding between authenticated and unauthenticated navigation. Protected UI must not flash before restoration finishes.

### Refresh

Access tokens are short-lived; refresh tokens sustain the session. The client must allow Supabase's normal refresh lifecycle and coordinate it with React Native app foreground/background state.

M1 acceptance must test more than app restart:

- while a refresh session remains valid, exercise access-token expiry/near-expiry and prove a refreshed access token allows protected FastAPI access to continue;
- when refresh credentials are invalid/revoked or refresh otherwise definitively fails, clear the authenticated application state and route safely to signed out;
- do not leave a stale authenticated shell that repeatedly sends unusable credentials.

The normal Supabase JWT expiration should remain provider-default for regular development. If a shorter expiry is temporarily used to exercise refresh, record the temporary setting and restore it after the acceptance run.

### Logout

Logout terminates the applicable Supabase session and clears local session/application auth state. After logout, protected mobile routes and FastAPI endpoints must be inaccessible without a new valid session.

## FastAPI JWT validation contract

IDN-002 must validate Supabase user access tokens server-side.

For the M1 development project, use the current asymmetric signing key and JWKS-based validation. Do not distribute a JWT signing secret to FastAPI or mobile.

For every protected request FastAPI must verify at least:

- cryptographic signature against the trusted Supabase JWKS;
- issuer equals `https://<project-ref>.supabase.co/auth/v1`;
- audience includes/is `authenticated`;
- expiration has not passed;
- subject is a valid external user UUID;
- role is appropriate for an authenticated user.

The authenticated principal is derived from the validated JWT `sub`; a `user_id` supplied in a body, query parameter, or path never overrides it.

JWKS lookup/caching must permit Supabase signing-key rotation. Do not cache keys indefinitely.

A valid signature alone is not sufficient to resurrect a deleted Keylornet identity; see deletion semantics below.

## Application user/profile mapping

Keylornet maintains its own application identity row independently of the Supabase Auth schema.

Recommended M1 mapping:

- internal Keylornet user ID: application-owned UUID primary key;
- external auth provider: `supabase`;
- external subject: Supabase JWT `sub`, unique and immutable for the mapping;
- profile: application-owned profile data linked to the Keylornet user.

Do not use email as the stable foreign identity key because email can change.

First authenticated access may provision the Keylornet application user/profile deterministically if no active mapping exists. The operation must be transaction-safe/idempotent so concurrent requests do not create duplicates.

A deleted/tombstoned external subject must never be eligible for automatic reprovisioning.

## Protected API design for M1

The first protected identity endpoint should be caller-relative, for example:

- `GET /me`
- later `PATCH /me/profile`

The route derives the caller from the authenticated principal. It does not accept a trusted target user ID.

Typical auth error semantics:

- missing/invalid/expired access token -> `401 Unauthorized`;
- valid identity but forbidden operation -> `403 Forbidden`;
- authenticated profile validation conflict -> appropriate `4xx` contract defined with the profile endpoint.

Avoid exposing provider-specific debugging information to the mobile UI.

## Password recovery contract

M1 recovery uses Supabase's password-reset flow.

1. Signed-out user submits email.
2. Mobile requests password recovery with a stable redirect target such as `keylornet://auth/recovery`.
3. Email link opens the supported Keylornet development build.
4. The app recognizes the recovery auth state and displays a new-password form.
5. The authenticated recovery context updates the password through the supported Supabase API.
6. Expired, reused, malformed, or wrong-flow links produce a safe recovery error and cannot enter normal protected navigation accidentally.

Tokens arriving in deep links must not be logged.

Because stable custom-scheme auth callbacks require the app scheme to be installed natively, physical recovery acceptance uses a development build rather than relying on Expo Go URLs.

## Account deletion contract

Account deletion is a backend-authorized operation.

The mobile app sends an authenticated deletion request to FastAPI and never receives a privileged Supabase admin key.

Backend sequence must be designed to be retry-safe and fail closed. M1 should preserve enough application-side terminal state to prevent a deleted Supabase subject from being silently reprovisioned by a still-valid pre-deletion JWT. At minimum:

1. authenticate the caller and derive external subject from the validated token;
2. mark the application identity as deletion-in-progress/terminal in an idempotent way;
3. erase/anonymize M1 profile data according to the accepted M1 privacy design;
4. delete the corresponding Supabase Auth user using the server-only administrative credential;
5. finalize application deletion state;
6. mobile clears its local session and returns signed out.

The exact minimal tombstone representation and retention policy must be reviewed in IDN-006 before production use. It should retain no unnecessary profile PII while still preventing accidental reprovisioning.

### Post-deletion security acceptance

IDN-006/IDN-007 must prove that:

- an access token issued before deletion cannot regain protected Keylornet access even if its signature and `exp` would otherwise still be acceptable;
- the old refresh credential/session cannot mint a usable Keylornet session after provider deletion;
- logging in again with the deleted account's old credentials does not silently recreate the deleted Keylornet account under the chosen deletion semantics;
- retries cannot delete a different user's identity.

## Failure behavior

Authentication fails closed.

Mobile distinguishes at least:

- signed out;
- restoring session;
- signed in;
- confirmation required;
- recovery flow;
- transient network/auth error;
- terminal session/refresh failure requiring sign-in.

Backend never converts token-verification exceptions into authenticated anonymous behavior.

## Physical-device development runbook

For normal auth UI/session work, Expo Go may remain useful where no stable callback is needed. For confirmation/recovery/deep-link acceptance, use a Keylornet development build carrying the `keylornet` scheme.

The local FastAPI URL on a physical phone remains the development machine's reachable LAN IPv4, as established in M0.

The Supabase project URL is internet-reachable and independent of the LAN API URL.

## Manual provisioning checklist

The connected Keylornet Supabase project has been configured for M1 as follows:

1. Email provider/password auth enabled.
2. Email confirmation enabled.
3. Project URL and modern publishable key available through project configuration.
4. Current asymmetric ECC P-256 signing key confirmed in JWT settings.
5. Auth redirect URL settings include `keylornet://auth/confirm` and `keylornet://auth/recovery`.
6. Any future `sb_secret_...` administrative credential remains server-only and should only be copied into secret storage when IDN-006 needs it.

Store locally when implementation starts:

- mobile `.env`: project URL + publishable key only;
- backend/server secret storage: secret key only when IDN-006 needs it;
- never paste the secret key into chat.

## Acceptance handoff to implementation

IDN-002 and IDN-003 may proceed in parallel because:

- the development Supabase project exists and is healthy;
- project URL and publishable key are available;
- the current asymmetric signing-key/JWKS model is established;
- redirect/deep-link configuration is established;
- email confirmation is enabled;
- the terminal deletion/reprovisioning rule above is accepted.

IDN-001 itself does not require application login code or backend JWT middleware.

## Provider references checked for this contract

At planning time, the current official Supabase and Expo documentation was checked for:

- Expo React Native Supabase setup and publishable keys;
- React Native session persistence and token auto-refresh;
- Supabase session/access/refresh-token lifecycle;
- asymmetric JWT signing keys, claims and JWKS validation;
- native mobile deep linking and redirect URLs;
- password recovery;
- server-only admin user deletion;
- Expo custom schemes and the requirement for development builds when a stable auth callback URL is needed.

Provider behavior can evolve; implementation PRs must re-check current official documentation if a relevant API/configuration has changed.
