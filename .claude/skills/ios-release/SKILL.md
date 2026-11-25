---
name: ios-release
description: Publish an Orbit iOS build to internal TestFlight through the manual iOS Release workflow. Use for an iOS release or TestFlight upload, after Apple enrollment and signing setup. App Store submission is separate.
---

# iOS release

Never release on the App Store. This workflow uploads to internal TestFlight only. Read `.github/workflows/ios-release.yml` for the inputs and the credential names.

## One mobile version

iOS ships at the same `app_version` as Android, from the same commit. Each store keeps its own build counter. The default path is `/android-release` first. Then run this skill right after the Android dispatch, at the version and commit of that Android run. Android still uploads first.

The `variant` selects the GitHub environment. Each environment keeps its own records. Select the variant of the Android environment:

| Android `track` | GitHub environment | iOS `variant` |
|---|---|---|
| `open`, `production` | `production` | `production` |
| `internal` | `staging` | `staging` |

## The version pair

1. Use the version of the Android run: `node apps/mobile/scripts/mobile-version-pair.js plan --environment <variant>` (set `GITHUB_REPOSITORY` and `GH_TOKEN`), or the version of the Android dispatch that still runs.
2. The workflow runs `mobile-version-pair.js check` twice. `--stage build` refuses a version that differs from the newest Android version, unless a matching Android run is queued or running on the same commit.
3. `--stage upload --wait-minutes 45` waits for the Android record of that version. It refuses when the Android run ends with no record.
4. Both checks refuse a commit other than the commit of the newest Android record at that version. A record with no commit makes the check refuse the version.
5. `gh workflow run --ref` builds the tip of the branch. Dispatch only while that tip is the commit of the Android run. If the branch moved, release Android at the new `nextVersion` first.
6. Release iOS alone only for a defect that only iOS has. Pass the defect as `platform_only_reason`. Never invent a reason to pass the check.
7. An iOS-only release uses `nextVersion` of the same plan. The check refuses an iOS-only version at or below the newest Android version.
8. The next shared release then starts on Android at the new `nextVersion`.

## Dispatch

Before dispatch, resolve the ref to the commit of the Android run. Take the `build_number` as the highest build of the matching app in App Store Connect plus one (`tools/lib/app-store-connect.mjs`). Never infer it from the Android version code. Check the `Mobile iOS Build` compile result when the commit changed a native input. The driver release train dispatches this workflow right after its Android dispatch, and `/release` starts the same train at once.

```sh
gh workflow run ios-release.yml --ref <ref> \
  -f variant=<staging-or-production> -f app_version=<version> -f build_number=<number> \
  -f platform_only_reason=<reason or empty>
```

Follow only the dispatched run.

## After the upload

- The job `record-upload` records an `ios-release` GitHub Deployment, which the Android check reads. It makes 3 attempts.
- The job `testflight-access` runs `tools/testflight-access.mjs`. It waits until App Store Connect lists the exact version and build as `VALID`, then makes sure the internal beta group has the team testers.
- If either job fails, use "Re-run failed jobs". A rerun does not upload the build again and does not use a new build number.
- A rerun uses the tool of the original commit. A later fix to the tool takes effect on the next release.

## Report

Report the run URL, the commit, the variant, the version, the build number and the job summary. Never print signing material.
