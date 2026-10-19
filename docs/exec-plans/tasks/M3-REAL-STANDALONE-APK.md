# M3 real standalone Android QA — isolated release path

## Scope
The pre-existing Android smoke APK `...qastandalone` tested native ExpoCrypto
and SQLite, and is **closed**. This independent workflow packages the untouched
`apps/mobile/app/index.tsx` and the normal app shell in a release APK with
embedded JavaScript, without Metro.

- Normal app: `com.jonathansalgadonieto.keylorforge` (never touched).
- Native smoke: `com.jonathansalgadonieto.keylorforge.qastandalone`.
- **Real app QA: `com.jonathansalgadonieto.keylorforge.qareal`**.
- QA apps have no intent filters for original auth callback deep links. Test
  sign-in only using an **already verified, disposable QA account**.
- No migrations or data cleaning, no automatic installs, no phone tests,
  no merges, no production release, no Codex usage.

## Required build configuration
The GitHub Actions workflow
`.github/workflows/android-real-app-qa.yml` builds on trusted PRs **only
if** repository variables `KEYLORFORGE_QA_SUPABASE_URL` (HTTPS) and
`KEYLORFORGE_QA_SUPABASE_PUBLISHABLE_KEY` are both set. Otherwise the job
is intentionally **skipped**: do not claim it passed or publish a dummy APK.
On `workflow_dispatch`, the job fails closed if these are absent.
Both are public client-side values intentionally embedded in the QA binary;
**never use a Supabase service-role key**. Use a non-production QA project.

The API is pinned to `http://127.0.0.1:8001` and requires an explicitly
prepared TEST FastAPI/PostgreSQL environment and USB reverse for online calls.
Do not assume 127.0.0.1 routes to the PC without ADB reverse. HTTPS/App Links
are a separate production gate (#58). The build is independent of Metro and
of the main Android package.

## Non-goals / remaining gates
This artifact exercises the real **release application**, auth UI, catalog and
existing navigation. It **does not** activate the staged Free Workout UX on
`/train` (still shows catalog), and hence cannot certify the full M3 journey.
Do not use this artifact for real user data or consider it a production build.
Refresh token expiration/revocation, 401/403/409, account switching, security
review (#143) and retention (#123) remain separate gates. The Product Owner
must approve any physical installation/testing, with a distinct QA package.
