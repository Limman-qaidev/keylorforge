# M3 Android real transport E2E (development-only)

This is a **new** QA scenario. Do not repeat local catalogue/offline training
acceptance: those checks have already passed separately.

## Prerequisites

- Samsung connected by USB, reverse ports tcp:8081 and tcp:8001.
- Local FastAPI at http://127.0.0.1:8001 with
  KEYLORFORGE_ENVIRONMENT=test, KEYLORFORGE_SUPABASE_PROJECT_URL set to the
  same Supabase issuer used by the mobile app, and KEYLORFORGE_DATABASE_URL
  pointing to **keylorforge_m3_e2e** in the local PostgreSQL container.
- Migrations applied to keylorforge_m3_e2e and 899 exercises imported.
- Local mobile .env contains EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8001.
- A signed-in Supabase test/development account. No JWT, email, or password
  should be pasted into a chat or terminal log.
- Checkout this PR's HEAD for **both** FastAPI and mobile; restart only each
  service to use the updated code.

## Safety gates

- The API's /_qa/m3-ready route is registered only when
  KEYLORFORGE_ENVIRONMENT=test. It requires authenticated Supabase JWT and
  checks **the actual database connection** using current_database(), refusing
  anything other than keylorforge_m3_e2e.
- The DEV-only Android flow additionally requires exactly the loopback API
  http://127.0.0.1:8001, and reruns the protected preflight immediately
  before each outbox drain.
- Device operations use a NEW account-partitioned SQLite file,
  keylorforge-m3-remote-e2e-v1-<subject>.db. All production/preview SQLite
  and the preexisting diagnostic file are left untouched.
- No reset, schema drop, force migration, background sync, implicit merge,
  or changes to an existing workout. If a step fails, local mutations remain
  durable; the same button resumes rather than creating another workout.
- Existing logged-in Supabase identity is used only to authenticate the
  test backend; server workout data goes only to keylorforge_m3_e2e.

## Single physical test

Under Inicio, open "QA M3 · Sincronización real (base aislada)" and press
"Ejecutar START → SET → FINISH → ACK" once.

The app automatically:
1. Authenticates the test-only server/DB preflight.
2. Creates START in a new isolated device SQLite, sends it, checks its
   durable ACK and authoritative active session.
3. Selects a real reps exercise from this PostgreSQL-backed API, confirms a
   WORKING set, sends it and checks its durable ACK.
4. Finishes the local session, transmits the final immutable snapshot and
   checks its durable ACK.
5. Queries the authoritative server history and confirms **exactly one**
   completed session with **one WORKING set**, plus no active remote session.

A second tap checks that SAME session, without inserting a duplicate.
Any failure reports stage/reason, never silently declares success.

## Still outside this test

- This tests a stable foreground connection, not offline reconnection/lost ACK.
- Independent security and owner-switching review #143.
- No product workout route is enabled; the former "datos aislados" previews
  remain local-only.
- Draft PR only; explicit PO approval required before any merge or release.
