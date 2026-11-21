---
name: android-generate
description: Build a release APK from this checkout, then reveal it in Finder or install and launch it on the Orbit Android emulator. Use for a fresh APK, an emulator test of mobile changes, or /android-generate. Not for Google Play, which is /android-release.
argument-hint: "[--emulator]"
effort: low
---

# Android Generate: build an APK from this checkout

This skill builds the local release APK with the script of `apps/mobile`. Sentry upload stays skipped.

| Arguments | Action |
|---|---|
| empty | Build the ARM-only APK, then reveal it in Finder. |
| `--emulator` | Build with the x86_64 ABI added, boot the emulator, install and launch. |

An x86_64 emulator needs the x86_64 native slice. Without it, the app exits at start.

## Step 1: Build

```bash
cd apps/mobile
npm run android:apk            # default
npm run android:apk:emulator   # --emulator
```

Run the build with `run_in_background: true` and a log file. A cold build can take tens of minutes. Poll the log.

Prebuild needs `apps/mobile/google-services.json`. It is gitignored. When it is missing, prebuild fails with `Cannot copy google-services.json`. Ask the owner to download it from the Firebase console for `org.useorbit.app`.

The APK lands at `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`.

## Step 2a: Default, reveal the APK

```bash
open -R apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

Report the absolute path and the file size.

## Step 2b: `--emulator`, install and launch

1. Boot the emulator. The tool creates the AVD on first use. Read `serial` from the JSON.
   ```bash
   node tools/android-emulator.mjs --json
   ```
2. Check that the APK carries x86_64: `unzip -l <apk> | grep libreactnative.so` must show `lib/x86_64/libreactnative.so`.
3. Remove any Play copy. A Play install and a local build have different signing keys. A `DELETE_FAILED_INTERNAL_ERROR` result for an absent app is fine.
   ```bash
   adb -s <serial> uninstall org.useorbit.app
   adb -s <serial> install -r <apk>
   ```
4. Launch the app. A live `pidof` result and an empty crash buffer are the pass.
   ```bash
   adb -s <serial> logcat -c
   adb -s <serial> shell monkey -p org.useorbit.app -c android.intent.category.LAUNCHER 1
   adb -s <serial> shell pidof org.useorbit.app
   adb -s <serial> logcat -b crash -d
   ```

Say plainly when the app crashed. Never infer success from the install step alone.

## Rules for the emulator

- After you hand the device to the owner, send no `adb shell input`, no `am start` and no screenshot until the owner says the work is done.
- A device-bug repro may boot a separate throwaway AVD, never the owner's `Orbit_Pixel_9_API_35`, never signed in as the owner, and deleted after the proof.
