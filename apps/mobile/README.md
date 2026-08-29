# Keylornet mobile

Expo/React Native baseline for the Keylornet mobile client. It intentionally
contains only a development-status route; product screens and backend contracts
belong to later workstreams.

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

The root route calls `GET /health` through the shared API abstraction. It shows
loading, healthy, or readable error status without crashing if the server is
unreachable or its response is invalid. The health request is cancelled after
five seconds so an unreachable LAN endpoint shows `Health request timed out.`
instead of leaving the screen loading indefinitely. The stable accepted backend
response is `200 {"status":"ok"}`.

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
