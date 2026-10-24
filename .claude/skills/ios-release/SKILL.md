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
| Variable | `ORBIT_IOS_APP_STORE_ID` | App Store Connect > Apps > matching app > App Information > Apple ID |
| Variable | `IOS_PROVISIONING_PROFILE_NAME` | Apple Developer > Certificates, Identifiers & Profiles > Profiles; the matching App Store distribution profile's name |
| Secret | `IOS_DISTRIBUTION_CERTIFICATE_BASE64` | Base64 of the Apple Distribution certificate and private key exported as a password-protected PKCS#12 file |
| Secret | `IOS_DISTRIBUTION_CERTIFICATE_PASSWORD` | Password used for that PKCS#12 export |
| Secret | `IOS_PROVISIONING_PROFILE_BASE64` | Base64 of that variant's distribution provisioning profile |
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
Once enrolled, enable Push Notifications and Associated Domains for both bundle identifiers,
create their App Store Connect records, and replace `APPLE_TEAM_ID` in
`apps/web/public/.well-known/apple-app-site-association` with the enrolled application identifier
prefix. Verify both web hosts serve it as JSON with status 200 and no redirect. In App Store
Connect > Pricing and Availability > iPhone and iPad Apps on Apple Silicon Mac, opt out of Mac
availability before distribution. Keep testers internal; this workflow does not submit for review.

Confirm the installed `gh workflow run` interface before dispatching. The command shape is:

```sh
gh workflow run ios-release.yml --ref <ref> \
  -f variant=<staging-or-production> -f app_version=<version> -f build_number=<number>
```

Follow only the dispatched run. An upload command's successful exit proves upload acceptance;
confirm processing finishes and the exact version and build appear in the matching app's
TestFlight > Internal Testing screen before reporting it available to testers. Report the run URL,
commit, variant, version, build number and processing result. Never print signing material.
