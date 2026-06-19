---
name: android-generate
description: Build the Android APK for the mobile app by running npm run android:apk. Use when the user asks to generate, build, or produce an Android APK / release / install file for apps/mobile.
---

# Android Generate

Runs the project's existing Android APK release command.

The APK bakes in `EXPO_PUBLIC_API_BASE` at prebuild time, so the API the build targets is decided by the environment present when the script runs. Default (no env set) builds against prod (`https://api.useorbit.org`).

## Steps

### Prod (default)

1. From the repo root, run `npm run android:apk -w @orbit/mobile`. The `android:apk` script is defined in the `apps/mobile` workspace (`node scripts/android-release-apk.js`), not at the root, so it must be targeted with `-w @orbit/mobile`.

### QA

Build against the QA API instead of prod by exporting the QA base (and forcing AdMob test IDs so the QA build never serves live ads) before running the same command. The QA API base is the public QA endpoint `https://api-qa.useorbit.org`.

- PowerShell:

  ```powershell
  $env:EXPO_PUBLIC_API_BASE = "https://api-qa.useorbit.org"
  $env:EXPO_PUBLIC_ADMOB_USE_TEST_IDS = "true"
  npm run android:apk -w @orbit/mobile
  ```

- bash:

  ```bash
  EXPO_PUBLIC_API_BASE="https://api-qa.useorbit.org" \
    EXPO_PUBLIC_ADMOB_USE_TEST_IDS="true" \
    npm run android:apk -w @orbit/mobile
  ```
