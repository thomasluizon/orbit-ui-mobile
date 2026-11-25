---
name: android-release
description: Dispatch the Android Release workflow that publishes Orbit to Google Play. Defaults to the open track, one patch above the newest Android or iOS version, then hands that version to /ios-release. Use to ship a mobile release or on /android-release. Not for a local APK.
argument-hint: "[version] [--track internal|open|production] [--code N] [--clear-cache] [--validate-deps] [--message <text>] [--android-only <reason>]"
effort: low
---

# Android Release: publish to Google Play

This skill dispatches `.github/workflows/android-release.yml`. The workflow builds the AAB, uploads Sentry source maps and publishes to a Google Play track. This action is outward and visible to testers. The driver release train dispatches it on its cadence with the inputs below, and `/release` starts the same train at once. Use this skill for a hand dispatch of one release.

Before it submits, the workflow starts the AAB on an emulator through `.github/actions/android-boot`. A startup failure blocks the Play submission. Never retry a failed app assertion as an infrastructure failure. Read the `android-boot-evidence` artifact to find the cause.

Read `reference.md` in this folder for the Play facts, the Sentry upload facts and the device recipes.

## One mobile version

Android and iOS ship at the same `app_version` from the same commit. Each store keeps its own build counter.

- Dispatch Android first. Then dispatch iOS at the same version through `/ios-release` while the Android run builds.
- The iOS upload step waits for the Android record of that version and commit, so Android always uploads first.
- Do not report a mobile release as done until both uploads exist.
- The iOS and Android release stages are always the same. The train never uses the Android track `production` and never submits to the App Store. The launch ticket owns both.
- The train releases staging first (track `internal`, iOS `staging`) and then production (track `open`, iOS `production`), at the same `app_version` and commit. The code of staging is the newest code plus one. The code of production is the newest code plus two, because the code counter is shared across tracks.
- Release Android alone only for a defect that only Android has. Pass `--android-only <reason>`. The workflow input `platform_only_reason` records the reason.

The workflow runs `node apps/mobile/scripts/mobile-version-pair.js check` before it builds. The check reads the newest version of each platform from the GitHub Deployments `android-release` and `ios-release`.

- One version names one code state. The check refuses an Android version at or below the newest iOS version when Android does not carry that version. A reason does not change this.
- The workflow passes `--sha "$GITHUB_SHA"`. A version that a platform already carries takes only the commit of that platform's newest record at that version. New code takes `nextVersion`.
- A record with no commit makes the check refuse the version.
- `node apps/mobile/scripts/mobile-version-pair.js plan --environment <production|staging>` prints both newest versions, the lagging platform and `nextVersion`. Set `GITHUB_REPOSITORY` and `GH_TOKEN` first.
- A refusal is a stop. Never retry it with a made-up reason.

Each GitHub environment keeps its own records. The Android track selects the environment. The iOS `variant` must select the same one.

| Android `track` | GitHub environment | iOS `variant` |
|---|---|---|
| `open`, `production` | `production` | `production` |
| `internal` | `staging` | `staging` |

## Workflow inputs

Read the inputs from `.github/workflows/android-release.yml`, never from memory. The inputs are `app_version`, `android_version_code`, `track`, `clear_cache`, `validate_expo_dependencies`, `message` and `platform_only_reason`.

- Track `internal` builds the selected branch as Orbit Staging against the staging API. It records in the `staging` environment.
- Tracks `open` and `production` build `main` as Orbit against the production API. They record in the `production` environment.
- Every build ships its own JavaScript bundle with updates disabled.
- Never promote a binary between tracks.

## Step 1: Read the last run to derive the defaults

The workflow sets `run-name` to `Android Release <app_version> (<android_version_code>) to <track> on <ref>`.

```bash
gh run list --workflow android-release.yml --limit 5 \
  --json displayTitle,status,conclusion,createdAt,databaseId
```

Parse the newest title with `Android Release (\S+) \((\d+)\) to (\S+) on`. Then derive the defaults:

- `app_version`: for `open` and `production`, run `mobile-version-pair.js plan --environment production` and use its `nextVersion`. For `internal`, run the plan with `--environment staging` and use its `nextVersion`.
- A staging build of code that has not shipped can use the higher `nextVersion` of the production plan.
- Use `nextVersion` also when the plan names `android` as the lagging platform and for an Android-only release. Then a version that iOS shipped never repeats.
- `android_version_code`: the previous integer plus one.
- `track`: `open`, whatever the previous run used.

If no run exists, or the title does not match, stop and ask for the version and the code. Never guess a version. Never reuse a `versionCode` that Play received. A failure before upload can be retried only after the Play history check in `reference.md`. A failed Actions conclusion alone is not enough.

## Step 2: Apply the arguments

Each value in `$ARGUMENTS` overrides its default:

- A bare version, such as `1.4.0`, sets `app_version`.
- `--track <name>` sets `track`. It must be `internal`, `open` or `production`.
- `--code <n>` sets `android_version_code`.
- `--clear-cache` sets `clear_cache=true`.
- `--validate-deps` sets `validate_expo_dependencies=true`.
- `--message <text>` sets `message`.
- `--android-only <reason>` sets `platform_only_reason` and skips the iOS step.

When a version has no code, derive the code from the last run and say so.

## Step 3: Resolve the ref

`gh workflow run` runs the workflow at the default branch when `--ref` is missing. So resolve the ref and pass it.

```bash
git rev-parse --abbrev-ref HEAD
git rev-parse --abbrev-ref --symbolic-full-name @{u}
git fetch origin <branch>
git rev-parse HEAD
git rev-parse origin/<branch>
```

The two SHAs must be equal. A mismatch is a stop.

- Remote behind local: the build cannot see the unpushed commits.
- Remote ahead of local: `--ref` names the branch, so someone else's later commit ships under the version you confirmed.
- No upstream is also a stop. The workflow builds from the remote.

Open and production need `main`. A tag does not satisfy their branch guard. An internal release can use a confirmed exact tag when its branch moves.

Show the resolved inputs and the ref as a table. Say when the working tree has uncommitted mobile changes, because the build excludes them. Then dispatch.

## Step 4: Dispatch and follow

```bash
gh workflow run android-release.yml \
  --ref <confirmed ref> \
  -f app_version=<version> \
  -f android_version_code=<code> \
  -f track=<track> \
  -f clear_cache=<bool> \
  -f validate_expo_dependencies=<bool> \
  -f message=<text> \
  -f platform_only_reason=<reason or empty>
```

`gh workflow run` prints no run id. List the runs again for the same ref. Take the newest entry whose `displayTitle` matches the dispatch. Copy the id from this output.

```bash
gh run list --workflow android-release.yml --branch <confirmed ref> --limit 5 \
  --json databaseId,displayTitle,status,headBranch
gh run watch <databaseId>
```

## Step 5: Release iOS at the same version

Unless `--android-only` applies, run `/ios-release` after the Android dispatch, once the Android run title carries the version (`Android Release <version> (<code>) to <track> on`). A title of only `Android Release` makes the iOS configuration check fail. Use the same commit and the same `app_version`. Use the iOS `variant` of the Android environment: `production` after `open` or `production`, and `staging` after `internal`.

- `gh workflow run --ref` builds the tip of the branch. The iOS check refuses a commit other than the Android commit.
- Before the iOS dispatch, run `git fetch origin <branch>`. Compare `git rev-parse origin/<branch>` with the commit of the Android run.
- If the branch moved, release Android again at the new `nextVersion` from the new tip. Then release iOS.

## Report

Give the run URL, the resolved inputs and the final conclusion. If the run fails, name the failing step and quote the error. A green run means the artifact reached the named Play track. It does not mean the release is live to users.
