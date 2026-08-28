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

`EXPO_PUBLIC_API_BASE_URL` is optional during this foundation stage. When it is
set, it must be an `http` or `https` URL and must point to a development or test
environment; do not commit a `.env` file or production credentials. For a
physical device, `localhost` refers to the device, so use a reachable local
network host instead.

## Development

```sh
npm start
npm run android
npm run ios
npm run web
```

The root route only reports foundation status and the configured API base URL.
It does not call an API yet. Future health integration is tracked separately as
FND-010, once the server contract and local environment are available.

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
