# KeylorFit mobile

Expo/React Native client for KeylorFit. The primary route is the M1
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

For confirmation or password-recovery deep links, use a KeylorFit development
build with the `keylorfit` scheme; Expo Go does not provide the stable callback
URL required by the M1 contract.

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
