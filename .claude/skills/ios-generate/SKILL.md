---
name: ios-generate
description: Build the current checkout as Orbit Staging for an iPhone simulator, install it and open it in Xcode Device Hub. Use for a fresh local iOS build or /ios-generate. For TestFlight publishing use /ios-release.
---

# iOS Generate

Run from the repository root:

```bash
node tools/ios-simulator.mjs
```

Pass `--device <udid>` to choose a particular installed iPhone. Without it, the command prefers
a booted iPhone, then the first available iPhone. Use `xcrun simctl list devices -j` with the same
`DEVELOPER_DIR` to find identifiers.

The command sets `DEVELOPER_DIR` for Expo, CocoaPods and Xcode without changing the system selection.
It defaults to the standard Xcode application; an existing `DEVELOPER_DIR` overrides it. This path
requires Xcode with Device Hub, completed first-launch setup, CocoaPods on PATH, an installed iOS
runtime with an iPhone simulator, and dependencies installed through `npm ci`.

The app version comes from the newest `android-release` GitHub Deployment in `staging`,
whose payload must identify the `internal` track and the staging API. Authenticate `gh` with
repository read access, or pass `--app-version <x.y.z>` to select a version explicitly and skip
the lookup. Missing records, authentication failures and malformed versions stop the command
with that override in the error; the checkout version is never used implicitly.

Each run regenerates `apps/mobile/ios` with Expo prebuild, then compiles Release for the simulator
with local ad hoc signing. This retains the app and widget Keychain entitlements without an Apple
account, signing certificate or provisioning profile. It pins `ORBIT_APP_VARIANT=staging` and
`EXPO_PUBLIC_API_BASE=https://api-staging.useorbit.org`, disables Sentry upload, installs
`org.useorbit.app.staging` and launches it. JavaScript is bundled; no development server is needed.
Before prebuild it sets `ORBIT_APP_VERSION` for the child commands so both the native
version and the bundled Expo config carry the selected version, including `X-App-Version` requests.
It leaves `app.json` untouched, including on cancellation, and verifies the built and
installed versions before launching.

Use a background terminal for the build. Logs and checkout-local DerivedData stay under the ignored
`apps/mobile/.artifacts/ios-simulator` directory. An overlapping invocation in the same checkout is refused;
after an interrupted build, confirm its processes have stopped before removing that directory's
`running` lock. Other checkouts have independent build directories.

Report the command's exit code, elapsed time, simulator name and identifier, installed bundle id,
version and build number, and process liveness. Success requires the launched PID to remain alive
after five seconds. A failed build or early process exit is a failure even if installation succeeded.

Repeated runs replace the installed build and preserve its storage. Once the owner starts using
the simulator, leave it alone until they request another build or verification. Do not sign in as
part of this skill. Keep generated native projects, build products and screenshots out of commits.
