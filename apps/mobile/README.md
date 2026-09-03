# KeylorForge mobile

Expo/React Native client for KeylorForge. The primary route is the M1
email/password identity flow; the M0 health diagnostic is no longer the normal
entry experience.

## Prerequisites

- Node.js 22 LTS or newer
- npm 10 or newer

## Setup

```sh
cp .env.example .env
npm install
```

`EXPO_PUBLIC_API_BASE_URL` is required for the development health check. It
must be an `http` or `https` URL that points to a development or test
environment. Do not commit a `.env` file, production endpoint, or credentials:
all `EXPO_PUBLIC_` values are visible in the client bundle.

`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` configure
the Supabase Auth client. They are public client configuration, not secrets.
Never put a `sb_secret_...`, service-role credential, refresh token, or user
password in `.env.example` or source control.

### Connecting to the local API

Start the API from `services/api/`:

```sh
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Then set the base URL appropriate for the client running the app:

- iOS Simulator on the development machine: `http://localhost:8000`
- Android Emulator:
  `http://10.0.2.2:8000`
- Physical device running Expo Go: `http://<development-machine-LAN-IP>:8000`

For a physical device, `localhost` means the phone itself, not the development
machine. Keep the device and development machine on the same trusted LAN, allow
the local port through the host firewall when necessary, and restart Expo after
changing `.env`.

## Development

```sh
npm start
npm run android
npm run ios
npm run web
```

At launch, the app restores the persisted Supabase session before choosing a
route, preventing an authenticated-screen flash. Signed-out users see welcome,
sign-in, registration, and confirmation-required states; signed-in users see
the authenticated shell and can sign out. Session refresh is active only while
the app is foregrounded. A definitive refresh failure clears the local
authenticated state and returns to sign-in.

For confirmation or password-recovery deep links, use a KeylorForge development
build with the `keylorforge` scheme; Expo Go does not provide the stable callback
URL required by the M1 contract.

### Physical Android confirmation acceptance

Before testing, the Supabase development project's Auth Redirect URLs must
contain the exact `keylorforge://auth/confirm` callback. Use an installed Android
development build (the stable application ID is already configured in
`app.json`), then start its bundler from `apps/mobile/`:

```sh
npx expo start --dev-client --clear
```

If the development build is not installed yet, build and install it with the
existing Expo Android workflow (for example `npx expo run:android`). This may
create local native Android files; do not commit generated directories solely
for this test.

1. Open the installed KeylorForge development build on the Android device and
   connect it to the dev-client bundler.
2. Register a new, disposable email address and confirm the app shows the
   pending-confirmation screen.
3. In the received email, tap the confirmation link. Android should open
   KeylorForge at `keylorforge://auth/confirm`, then route to the authenticated
   home screen without first asking the user to sign in.
4. Capture the pending-confirmation screen, the Android app-open handoff, and
   the authenticated home screen. Do not capture or share the email URL,
   authorization code, access token, refresh token, or password.

For an expired or previously used email link, KeylorForge should stay signed out,
show a safe request-a-new-email message, and provide a route back to sign in.

### Physical Android password-recovery acceptance

Before testing, the Supabase development project's Auth Redirect URLs must also
contain the exact `keylorforge://auth/recovery` callback. On an installed Android
development build:

1. Open **Forgot your password?** from sign-in and request recovery for a
   disposable account.
2. Tap the received recovery link. Android should open KeylorForge at
   `keylorforge://auth/recovery` and show the new-password form, never the
   authenticated home screen.
3. Enter and confirm a new password, then confirm the app returns to sign-in.
   Sign in successfully with the new password.
4. Repeat with an expired or used link. The app must remain out of protected
   navigation, show a safe recovery error, and let the user request another
   email.

Do not capture or share the recovery email URL, authorization code, access
token, refresh token, or password.

## Validation

```sh
npm run typecheck
npm run lint
npm run format:check
npm test
```

Use `npm run format` to apply the configured Prettier formatting.

## Continuous integration

Pull requests targeting `main` run the `Mobile CI / mobile-quality` GitHub
Actions check. This is the authoritative mobile check name for future branch
protection.
