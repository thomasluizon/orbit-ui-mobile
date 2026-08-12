---
name: android-generate
description: Build a release APK from the current working tree, then either reveal it in the file explorer or install and launch it on the Orbit Android emulator. Use when the user wants a fresh APK, wants to test mobile changes on the emulator, or says /android-generate. Not for publishing to Google Play, which is /android-release.
argument-hint: "[--emulator]"
effort: low
---

# Android Generate - build an APK from this checkout

Builds the local release APK with `apps/mobile`'s own script, so the AdMob test units, the skipped
Sentry upload, and the Gradle staging directory all stay exactly as the repository defines them.

## Mode (from `$ARGUMENTS`)

| Arguments | What to do |
|---|---|
| empty | Build the ARM-only APK, then reveal it in the file explorer. |
| `--emulator` | Build with the x86_64 ABI added, boot the emulator, install, and launch. |

## Why `--emulator` changes the ABIs

`apps/mobile/app.json` sets `buildArchs` to `["armeabi-v7a", "arm64-v8a"]`, which is correct for Play:
no real phone needs x86_64 and the bundle stays small. An x86_64 emulator cannot run that APK. React
Native's SoLoader resolves `libreactnative.so` on the device's primary ABI, finds no `lib/x86_64/`,
and kills the process in `MainApplication.onCreate` (measured 2026-08-12).

`--emulator` therefore passes `-PreactNativeArchitectures=armeabi-v7a,arm64-v8a,x86_64` to Gradle for
that build only. `gradle.properties` documents this override. **Never fix this by editing
`app.json`**: the generated `gradle.properties` is rewritten from `app.json` on every prebuild, and
putting x86_64 there ships it to Play.

## Step 1 - Build

```bash
cd apps/mobile
npm run android:apk            # default
npm run android:apk:emulator   # --emulator
```

Run it with `run_in_background: true` and a log file: a cold build took **24m 30s** on 2026-08-12, and
later builds reuse the Gradle cache. Poll the log rather than blocking the session.

The script stops Gradle daemons before `expo prebuild`, because a live daemon holds `apps/mobile/android`
open on Windows and prebuild dies with `EBUSY: resource busy or locked`. If you still see EBUSY, some
other process has that directory open. **A shell whose working directory is `apps/mobile/android` is
enough to cause it** - move it and retry.

Prebuild needs `apps/mobile/google-services.json`, which is gitignored and absent on a fresh clone.
When it is missing, prebuild fails with `Cannot copy google-services.json`. Ask the user to download it
from the Firebase console for `org.useorbit.app`; CI writes it from the `GOOGLE_SERVICES_JSON` secret,
and secrets cannot be read back.

The APK lands at:

```
apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

## Step 2a - Default: reveal the APK

```bash
explorer.exe /select,"<absolute windows path to app-release.apk>"
```

`explorer.exe /select` returns exit code 1 even when it succeeds. Treat a non-zero exit as normal here
and confirm the file exists with `stat` instead.

Report the absolute path and the file size.

## Step 2b - `--emulator`: install and launch

1. **Bring the emulator up.** It creates the AVD on first use and always passes explicit DNS:
   ```bash
   node tools/android-emulator.mjs --json
   ```
   Read `serial` from the JSON for the following steps.

2. **Verify the APK really carries x86_64** before blaming anything else:
   ```bash
   unzip -l <apk> | grep libreactnative.so
   ```
   Expect a `lib/x86_64/libreactnative.so` row. Its absence means the override did not apply.

3. **Uninstall any Play copy first.** A Play install and a local build carry different signing keys, so
   installing over one fails. `adb uninstall` returning `Failure [DELETE_FAILED_INTERNAL_ERROR]` when the
   app is absent is fine.
   ```bash
   adb -s <serial> uninstall org.useorbit.app
   adb -s <serial> install -r <apk>
   ```

4. **Launch and prove it did not crash:**
   ```bash
   adb -s <serial> logcat -c
   adb -s <serial> shell monkey -p org.useorbit.app -c android.intent.category.LAUNCHER 1
   adb -s <serial> shell pidof org.useorbit.app
   adb -s <serial> logcat -b crash -d
   ```
   A live pid plus an empty crash buffer is the pass. `dumpsys package org.useorbit.app | grep primaryCpuAbi`
   should read `x86_64`.

## Never drive the emulator while the user is using it

Once you hand the device over - a sign-in, a manual walkthrough - send it no `adb shell input`, no
`am start`, and no screenshots until the user says they are done. An `am start` once threw away
credentials the user was mid-way through typing.

## Report

State the APK path and size, the ABIs it contains, and for `--emulator` the serial, the installed
`versionName`, and the crash-buffer result. Say plainly if the app crashed; never infer success from
the install step alone.
