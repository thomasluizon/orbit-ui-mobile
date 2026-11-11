---
name: ios-release
description: Publish an Orbit iOS build to internal TestFlight through the manual iOS Release workflow. Use for an iOS release or TestFlight upload, after Apple enrollment and signing setup. App Store submission is separate.
---

# iOS release

Read `.github/workflows/ios-release.yml` for the current inputs and credential names.
It archives the embedded redesign bundle, uploads Sentry symbols, and uploads to App Store Connect.
Use staging for the first internal TestFlight build. Production releases run from `main`.

Before dispatch, resolve the requested ref to a commit, app version, unused positive `build_number`,
and `variant` (`staging` or `production`). Read the latest build number from the matching app's
App Store Connect TestFlight screen; do not infer it from Android's version code. Verify the
`Mobile iOS Build` compile check for the commit. Ask for a missing release parameter only after
checking the requested release context. Dispatch only when the user has authorized the upload.

The GitHub environments `ios-staging` and `ios-production`, under Settings > Environments, need:

| Kind | Key | Source |
|---|---|---|
| Variable | `ORBIT_APPLE_TEAM_ID` | Apple Developer > Membership details > Team ID |
| Variable | `EXPO_PUBLIC_APPLE_CLIENT_ID` | Required. The app reads it only to show the Sign in with Apple button; the API's `AppleSignIn__NativeClientId` sets the client ID that Apple checks. By convention it holds that bundle identifier: `org.useorbit.app` in `ios-production` and `org.useorbit.app.staging` in `ios-staging`. The release stops before it builds when the value is empty |
| Variable | `ORBIT_IOS_APP_STORE_ID` | App Store Connect > Apps > matching app > App Information > Apple ID |
| Variable | `IOS_PROVISIONING_PROFILE_NAME` | Apple Developer > Certificates, Identifiers & Profiles > Profiles; the matching App Store distribution profile's name |
| Variable | `IOS_WIDGET_PROVISIONING_PROFILE_NAME` | The distribution profile name for that variant's `<bundleIdentifier>.widget` extension |
| Secret | `IOS_DISTRIBUTION_CERTIFICATE_BASE64` | Base64 of the Apple Distribution certificate and private key exported as a password-protected PKCS#12 file |
| Secret | `IOS_DISTRIBUTION_CERTIFICATE_PASSWORD` | Password used for that PKCS#12 export |
| Secret | `IOS_PROVISIONING_PROFILE_BASE64` | Base64 of that variant's distribution provisioning profile |
| Secret | `IOS_WIDGET_PROVISIONING_PROFILE_BASE64` | Base64 of the widget extension's distribution provisioning profile |
| Secret | `APP_STORE_CONNECT_API_KEY_ID` | App Store Connect > Users and Access > Integrations > App Store Connect API > Team Keys |
| Secret | `APP_STORE_CONNECT_API_ISSUER_ID` | Issuer ID on the same screen |
| Secret | `APP_STORE_CONNECT_API_PRIVATE_KEY` | Raw downloaded `.p8` contents for that team key |
| Secret | `SENTRY_AUTH_TOKEN` | Sentry token with release upload access to `orbit-mobile` |

Supply the existing `EXPO_PUBLIC_GOOGLE_CLIENT_ID`, `EXPO_PUBLIC_TURNSTILE_SITE_KEY`,
`EXPO_PUBLIC_SENTRY_DSN`, `STAGING_EXPO_PUBLIC_POSTHOG_KEY` and `PRODUCTION_EXPO_PUBLIC_POSTHOG_KEY`
repository variables to these environments as appropriate. Each variant uses its own API host.
The Google web OAuth client must allow that variant's HTTPS `/auth-callback` redirect.

Enrollment and signing are prerequisites for an upload, not for the unsigned compile job.
Do not request enrollment while compilation and repository tests can still proceed.
Once enrolled, enable Push Notifications and Associated Domains for both app bundle identifiers,
and create their App Store Connect records. The application identifier prefix in
`apps/web/public/.well-known/apple-app-site-association` is the enrolled team `BD7JH468F7`; keep it
equal to `ORBIT_APPLE_TEAM_ID`. Verify both web hosts serve it as JSON with status 200 and no redirect. In App Store
Connect > Pricing and Availability > iPhone and iPad Apps on Apple Silicon Mac, opt out of Mac
availability before distribution. Keep testers internal; this workflow does not submit for review.

Register `org.useorbit.app.widget` and `org.useorbit.app.staging.widget` as explicit extension
identifiers in Apple Developer > Certificates, Identifiers & Profiles > Identifiers. Register
App Groups `group.org.useorbit.app.widget` and `group.org.useorbit.app.staging.widget`, associating
each group with its containing app and extension. The App Group also grants Keychain access to
the group name; no team prefix or change to the app's default Keychain group is needed. Generate
separate App Store distribution profiles for all four targets after enabling their capabilities.
The workflow installs both profiles for the selected variant and exports both bundle identifiers.
The plugin sets each target's profile so an app profile never applies to the extension.

The unsigned macOS compile job needs no Apple membership, certificate, profile or upload key.
It compiles the widget's Swift state and storage behavior tests through Vitest, then builds the
containing app and its embedded extension without launching a simulator. Complete that check
before enrollment. After signing becomes available, verify a completed habit appears after one
WidgetKit refresh, sign-out clears the widget, and reinstall opens login. Measure iPad at 744,
820, 1032 and 1366 points, including Split View, Slide Over and 200 percent Dynamic Type; check
labels, safe areas, landscape, sheet dismissal, VoiceOver focus and Reduce Motion on the device.
Repository tests and unsigned compilation do not establish those rendered or device results.

Confirm the installed `gh workflow run` interface before dispatching. The command shape is:

```sh
gh workflow run ios-release.yml --ref <ref> \
  -f variant=<staging-or-production> -f app_version=<version> -f build_number=<number>
```

Follow only the dispatched run. After the `release` job uploads the build, the separate job
`testflight-access` (`needs: release`, `ubuntu-latest`, 30 minutes) runs `tools/testflight-access.mjs`.
It waits until App Store Connect lists the exact version and build as `VALID`, and it fails the job on
`FAILED`, `INVALID` or a timeout. It then makes sure the app has an internal beta group with access to all
builds, and it links to that group every tester of the team's other internal beta groups. It creates the
group only when missing, it never creates a tester, and it fails when the group would hold no tester. The
job summary shows the processing state, the group name, the tester count and the number of testers this run
linked. If this job fails, use "Re-run failed jobs". The rerun does not upload the build again and does not
use a new build number. The release key needs only the App Manager role. Report the run URL,
commit, variant, version, build number and the job summary. Never print signing material.
