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

## Windows / Samsung environment startup (verified on 16 October 2026)

This procedure exists because repeatedly restarting Metro with `--localhost`,
`--lan`, or `NODE_OPTIONS=--dns-result-order=ipv4first` did **not**
fix a reproducible Windows network binding problem.

**Observed evidence, not a guess:**
- `Get-NetTCPConnection -LocalPort 8081 -State Listen` returned
  `LocalAddress = ::1` (IPv6 only).
- `curl.exe http://127.0.0.1:8081/status` failed.
- `curl.exe -g "http://[::1]:8081/status"` returned
  `packager-status:running`.
- A Node TCP bridge `127.0.0.1:8081 -> [::1]:8081` made the IPv4
  `/status` check succeed **without restarting Metro**; the physical
  Samsung then loaded the JavaScript bundle. This confirmed the networking
  root cause and exposed a separate native module error.

### Start in separate Windows PowerShell terminals

1. Check existing PostgreSQL first; **reuse** the healthy
   `keylorforge-postgres-1` mapped to `127.0.0.1:5433`. The API must use
   the **existing** `keylorforge_m3_e2e` database. Never run
   `docker compose down -v` or recreate the QA database.
2. Start FastAPI from the checked-out QA PR at port 8001 with
   `KEYLORFORGE_ENVIRONMENT=test`,
   `KEYLORFORGE_DATABASE_URL=postgresql+psycopg://...@127.0.0.1:5433/keylorforge_m3_e2e`,
   and `KEYLORFORGE_SUPABASE_PROJECT_URL` derived locally from the mobile
   project's `EXPO_PUBLIC_SUPABASE_URL`. Verify
   `Invoke-RestMethod http://127.0.0.1:8001/health` returns `ok`.
   Do not commit credentials or print tokens.
3. Run `adb devices` (state must be `device`), then
   `adb reverse tcp:8001 tcp:8001` and
   `adb reverse tcp:8081 tcp:8081`.
4. Start Metro from the QA PR's `apps/mobile` directory with
   `$env:EXPO_PUBLIC_API_BASE_URL='http://127.0.0.1:8001'` and
   `npx expo start --localhost --port 8081`.
5. Check **both** addresses independently:
   `curl.exe -g 'http://[::1]:8081/status'` and
   `curl.exe http://127.0.0.1:8081/status`.
   If IPv6 works but IPv4 fails, open another PowerShell terminal and run
   `node scripts/metro-ipv4-bridge.cjs` from the repository root.
   Leave the bridge process running. It binds loopback only and refuses to
   run when the IPv6 Metro endpoint is unavailable. Verify the IPv4 status
   again. **Do not keep restarting Metro to fix this binding issue.**
6. Open the installed KeylorForge Android app directly. **Do not press
   `a` in Expo**, which may launch Expo Go (`host.exp.exponent`) and show
   an unrelated blue screen.

### Separate native module mismatch — `Cannot find native module 'ExpoCrypto'`

After the bridge worked, the installed Android KeylorForge build reached
`lib/workouts/native-workout-platform.ts` but lacked the `ExpoCrypto`
native module. Although `expo-crypto` exists in `package.json`, the
installed app binary may predate that dependency. `npm ci`, clearing Metro
cache and restarting Expo cannot add native code to an installed APK.

**Next gate:** rebuild the Android development app from the *same QA PR* with
`npx expo run:android --no-bundler --device` so native autolinking includes
`expo-crypto`. Before any install, preserve the original Android package
`com.jonathansalgadonieto.keylorforge`: **never uninstall the app or clear
its data to solve signing/update incompatibilities**. If the package signature
mismatches, Android should reject the update; stop and investigate rather
than replacing or removing the app. The rebuild and physical verification
are **not yet accepted**; do not mark #170 resolved.

### Diagnostic distinctions

- Expo Go blue `Something went wrong`: `host.exp.exponent`, not the
  KeylorForge native app.
- Red `Unable to load script`: bundle/Metro IPv4 reachability first.
- Metro bundle loads, then `Cannot find native module 'ExpoCrypto'`:
  JavaScript is reaching the native app but its Android binary lacks the module.
- Missing route default-export warnings during this import failure may be
  secondary; re-evaluate **only after** the native error is resolved.

## Still outside this test

- This tests a stable foreground connection, not offline reconnection/lost ACK.
- Independent security and owner-switching review #143.
- No product workout route is enabled; the former "datos aislados" previews
  remain local-only.
- Draft PR only; explicit PO approval required before any merge or release.


## New genuine no-backend QA: PR #171 (not the already-passed online E2E)

Do **not** re-run the old `Ejecutar START → SET → FINISH → ACK` button.
Use the new DEV-only home link **`QA M3 · Sin backend → reconexión (SQLite separada)`**.
It stores data in **`keylorforge-m3-offline-e2e-v1-<subject>.db`**, never the
pre-existing `remote-e2e-v1` or product/workout/preview SQLite databases.

This is an explicitly staged physical test. All three operations preserve
their ledger after a force-stop or app restart, and no stage resets data.

1. **Online preparation:** with the existing FastAPI `:8001` test server, existing
   Supabase TEST login, `adb reverse tcp:8001 tcp:8001`, and Metro `:8081`
   reachable, open the new QA screen and press **`1 · Preparar online`**.
   It requires `/_qa/m3-ready` to attest `keylorforge_m3_e2e`,
   refuses an existing active remote session, and saves a real REPS exercise
   UUID to the separate SQLite file. Expect `PREPARADA`.
2. **Genuine disconnection:** run **`adb reverse --remove tcp:8001`** (do not
   remove reverse 8081, do not stop Metro, uninstall or clear app data).
   Optionally enable airplane mode; USB Metro can still serve the JS bundle.
   Press **`2 · Crear entrenamiento SIN backend`**. The code **refuses to
   run** if `GET /health` is still reachable on port 8001, even via USB.
   It creates a new locally finished session with one WORKING set and requires
   **three PENDING** START/SET/FINISH mutations, with **zero POSTs** sent.
   Expect `OFFLINE REAL · 3 pendientes`.
   Force-stop and reopen the app **with port 8001 still disconnected** and
   press 2 again: it MUST report the same session ID and three pending rows
   without duplicating them.
3. **Reconnection:** disable airplane mode if used, restore
   **`adb reverse tcp:8001 tcp:8001`**, then press
   **`3 · Sincronizar y verificar`**. This demands the TEST database
   preflight, sends the original three immutable mutations in causal order,
   verifies SQLite ACK, one server-side completed workout with one set and no
   active server workout. Expect `PASS · reconexión · 3 ACK · 1 serie`.
   A repeated press checks the same record; it never creates a second workout.

**If the UI signs out or fails during step 2:** STOP and record only the visible
non-sensitive message. That is an auth offline-restoration finding for #170;
do not circumvent authentication, reset Supabase storage or pretend the step passed.
If any stage fails, keep the isolated outbox intact for root-cause review.
**No Android acceptance is claimed until the Product Owner observes all steps.**
