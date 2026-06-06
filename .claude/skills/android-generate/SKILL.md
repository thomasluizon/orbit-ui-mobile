---
name: android-generate
description: Build the Android APK for the mobile app by running npm run android:apk. Use when the user asks to generate, build, or produce an Android APK / release / install file for apps/mobile.
---

# Android Generate

Runs the project's existing Android APK release command.

## Steps

1. From the repo root, run `npm run android:apk -w @orbit/mobile`. The `android:apk` script is defined in the `apps/mobile` workspace (`node scripts/android-release-apk.js`), not at the root, so it must be targeted with `-w @orbit/mobile`.
