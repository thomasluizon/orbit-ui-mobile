# Android release reference

Play and device facts for `/android-release` and `/android-generate`. The skills own the procedures.

## Contents

- Packages and Play
- Sentry source map upload
- Device repro recipe
- Instrumented local build

## Packages and Play

- Staging and production install side by side.
  - The `internal` track builds `org.useorbit.app.staging` ("Orbit Staging"). It is its own Play app with the same testers, and it calls the staging API.
  - The `open` and `production` tracks build `org.useorbit.app` and call the production API.
- The Firebase config for both packages is the `GOOGLE_SERVICES_JSON` secret of the `android-internal` environment. The other tracks use the repository secret.
- Orbit Staging has its own app signing key. SHA-256: `62:AC:19:77:F5:55:4E:89:4B:09:C3:21:F6:E4:0B:C8:27:77:37:3F:0A:F8:FE:A1:F1:23:CE:67:D2:FD:59:AA`. Each App Link host in its manifest needs that key in `assetlinks.json`.
- A binary never moves between tracks, because its API base is fixed when the build runs.
- Play numbers `versionCode` once for each package across every track. The workflow derives each new code from the last run across tracks.
- Play validates every active track. An old internal build blocks an upload on another track, so replace it first.
- A tester gets the highest `versionCode` across tracks.
- A successful upload does not say when Play makes the build available to testers. Play reviews a new app only with its first closed, open or production release.
- Each successful upload records an Android GitHub Deployment with the commit, version and `versionCode`. Release planning reads the newest record for the track, because a failure after submission does not undo a Play upload.
- A new default listing language needs a translation of every subscription. The Orbit Staging listing needs tablet screenshots.
- Copy a data safety form through "Exportar para .csv" and "Importar de arquivo CSV". A data safety change waits until the build it describes is live.
- The public Play developer name is TL SOFTWARE ENGINEERING LTDA.
- Before you retry an upload that failed, check all recent release runs, deployment records and the Play history of package `org.useorbit.app`. Current tracks alone do not prove that a code never reached Play. Unknown history is a stop.

## Sentry source map upload

- The upload stays fatal. The message `organization not found` does not show a bad token, a wrong slug or an outage. Do not rotate a credential or change the target because of it.
- The target is organization `orbit-ai-habit-tracker`, project `orbit-mobile`, on `https://sentry.io`.
- An auth token for an organization embeds that organization and a URL. In native CLI 3.8.0, the embedded values win over the Expo configuration and over `SENTRY_ORG`. See `src/config.rs` and `src/utils/auth_token/org_auth_token.rs` in the `getsentry/sentry-cli` repository at tag 3.8.0.
- A native environment override applies only to a token that embeds no organization. So a change of Expo configuration or `SENTRY_ORG` cannot move a token that embeds an old organization. A human administrator must replace the `SENTRY_AUTH_TOKEN` repository secret with a token that Sentry issued for the configured organization. Never send that token through chat, a ticket or a dispatch input.
- Read access to the target uses these GET routes, in this order:
  1. `https://sentry.io/api/0/`
  2. `https://sentry.io/api/0/organizations/orbit-ai-habit-tracker/chunk-upload/`
  3. `https://sentry.io/api/0/projects/orbit-ai-habit-tracker/orbit-mobile/releases/?per_page=1`
- A pass on these routes proves read access only. It does not prove upload permission.

## Device repro recipe

- Build a universal APK from the `android-release-aab` artifact of the release run: `bundletool build-apks --mode=universal` with a local key. Install it.
- Approve the App Link: `adb shell pm set-app-links --package org.useorbit.app STATE_APPROVED app.useorbit.org`.
- Skip the first run of Chrome. Write `_ --disable-fre --no-default-browser-check --no-first-run` to `/data/local/tmp/chrome-command-line`, then run `adb shell am set-debug-app --persistent com.android.chrome`.
- To deliver a Google redirect with no password, read `state` from the Custom Tab over `adb forward tcp:9333 localabstract:chrome_devtools_remote`. Inject a link to `https://app.useorbit.org/auth-callback?state=<state>&code=<fake>` through DevTools. Tap the link.
- A device bug repro may boot a separate throwaway AVD. Never use the owner's `Orbit_Pixel_9_API_35`, never sign in as the owner, and delete the AVD after the proof.

## Instrumented local build

Temporary `[DEBUG-xxxx]` `console.warn` lines reach logcat as `ReactNativeJS`. Build in a scratch worktree only.

- Run `node scripts/set-app-version.js <version> <code>` first. The committed version is below `MinSupportedVersion`.
- Write a placeholder `google-services.json` with `node -e` and `fs.writeFileSync`, as `.github/workflows/android-startup.yml` does. The `permissions.deny` rule on that name also refuses the Write tool and shell redirects.
- Set the release `EXPO_PUBLIC_*` values and the shipped public Google client id.
- Set `usesCleartextTraffic: true` under `expo-build-properties` for a local mock at `http://10.0.2.2:5186`.
- Set `ORBIT_APP_VARIANT=staging` for Orbit Staging.
- Use a new `TMPDIR` for each build. Metro reuses an older `EXPO_PUBLIC_*` value.
