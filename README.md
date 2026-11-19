# Abu Dhabi Foodies (iOS and Android app)

The app for [abudhabifoodies.ae](https://www.abudhabifoodies.ae) and
[@abudhabifoodies](https://www.instagram.com/abudhabifoodies). Answer a few
questions and get one recommendation from the restaurants the community loves.
It calls the site's public API only; there are no keys or secrets in this repo.

Expo SDK 58, expo-router, TypeScript.

## Run the tests

```bash
npm ci
npx tsc --noEmit
npm test
```

## Run it on a phone

`npx expo start`, then scan the QR code with Expo Go (Android) or the Camera
app (iOS).

## GitHub Actions

- **iOS** (`.github/workflows/ios.yml`): Actions > iOS > Run workflow.
  `compile-only` needs nothing; `testflight` signs and uploads with an App Store
  Connect API key stored as repository secrets `APP_STORE_CONNECT_KEY_ID`,
  `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_KEY_P8`, `APPLE_TEAM_ID`.
  No workflow runs on pull requests, so forks never see those secrets.
- **iOS screenshots** (`.github/workflows/ios-screenshots.yml`): App Store
  screenshots from the real app on a 6.9" iPhone simulator, driven by Maestro
  (`.maestro/screenshots.yaml`), uploaded as a run artifact.

## License

Copyright Abu Dhabi Foodies. All rights reserved. The source is visible for
transparency; it is not licensed for reuse.
