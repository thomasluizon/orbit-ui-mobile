---
name: android-generate
description: Build the Android APK for the mobile app by running npm run android:apk. Use when the user asks to generate, build, or produce an Android APK / release / install file for apps/mobile.
---

# Android Generate

Runs the project's existing Android APK release command.

The APK bakes in `EXPO_PUBLIC_API_BASE` at prebuild time, so the API the build targets is decided by the environment present when the script runs. Default (no env set) builds against prod (`https://api.useorbit.org`).

This local build always uses Google TEST AdMob ad units (never real ads) and skips the Sentry source-map upload (which requires the CI-only `SENTRY_AUTH_TOKEN`), so QA installs never serve live ads and the build never fails on a missing Sentry token. Real-ad production releases — with source maps uploaded to Sentry — ship only through the `.github/workflows/android-release.yml` CI workflow, which injects the real AdMob IDs + Sentry token and guards against shipping test units.

## Steps

### Prod (default)

1. From the repo root, run `npm run android:apk -w @orbit/mobile`. The `android:apk` script is defined in the `apps/mobile` workspace (`node scripts/android-release-apk.js`), not at the root, so it must be targeted with `-w @orbit/mobile`.
