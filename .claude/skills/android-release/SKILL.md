---
name: android-release
description: Dispatch the Android Release GitHub Action that builds and publishes Orbit to Google Play. Defaults to the open track with the version and versionCode bumped one patch above the last run. Use when the user wants to ship a mobile release, publish to Play, or says /android-release. Not for a local APK, which is /android-generate.
argument-hint: "[version] [--track internal|closed|open|production] [--code N] [--clear-cache] [--validate-deps] [--message <text>]"
effort: low
---

# Android Release - publish to Google Play

Dispatches `.github/workflows/android-release.yml`. It builds with real AdMob units, uploads Sentry
source maps, and **publishes to a Google Play track**. This is an outward, user-visible action, so it
runs only after the user confirms the exact inputs.

## The workflow's inputs (from the workflow file, not memory)

| Input | Required | Values |
|---|---|---|
| `app_version` | yes | user-facing version string, e.g. `1.3.27` |
| `android_version_code` | yes | integer Play upload code, e.g. `86` |
| `track` | yes | `internal` \| `closed` \| `open` \| `production` |
| `clear_cache` | no | boolean, default `false` |
| `validate_expo_dependencies` | no | boolean, default `false` |
| `message` | no | free text recorded in the run log and summary |

## Step 1 - Read the last run to derive the defaults

The workflow sets `run-name` to
`Android Release <app_version> (<android_version_code>) to <track> on <ref>`, so the previous inputs
are readable without opening the run:

```bash
gh run list --workflow android-release.yml --limit 5 \
  --json displayTitle,status,conclusion,createdAt,databaseId
```

Parse the newest title with `Android Release (\S+) \((\d+)\) to (\S+) on`. From it:

- `app_version` -> bump the **last numeric segment by one** (`1.3.26` -> `1.3.27`).
- `android_version_code` -> previous integer plus one (`85` -> `86`).
- `track` -> **`open`** by default, regardless of the previous run's track.

If no run exists, or the title does not match, **stop and ask** for the version and code. Never guess
a version, and never reuse a `versionCode` - Play rejects a duplicate and the build is wasted.

## Step 2 - Apply the user's arguments

Anything in `$ARGUMENTS` overrides the derived defaults:

- a bare version-looking token (`1.4.0`) -> `app_version`
- `--track <name>` -> `track`, validated against the four allowed values
- `--code <n>` -> `android_version_code`
- `--clear-cache` -> `clear_cache=true`
- `--validate-deps` -> `validate_expo_dependencies=true`
- `--message <text>` -> `message`

When the user supplies a version but no code, still derive the code from the last run and say so.

## Step 3 - Resolve the ref, then confirm

**`gh workflow run` runs the workflow at the remote default branch when `--ref` is omitted.** A release
dispatched from a feature checkout would therefore build `main`, not the branch just confirmed. Resolve
the ref explicitly and pass it:

```bash
git rev-parse --abbrev-ref HEAD                        # <branch>
git rev-parse --abbrev-ref --symbolic-full-name @{u}   # fails when the branch is unpushed
git fetch origin <branch>
git rev-parse HEAD
git rev-parse origin/<branch>
```

**The two SHAs must be equal.** Containment is not enough in either direction:

- Remote *behind* local: the commits you are releasing were never pushed, so the build cannot see them.
- Remote *ahead* of local: `--ref` names the branch, not your commit, so the run builds whatever the
  branch points at now. Someone else's later commit ships under the version you confirmed.

A mismatch either way is a **stop**, not a warning. Report both SHAs to the user and let them decide:
push, pull, or name an exact tag instead. A tag is the safer ref when the branch is moving, because it
cannot advance under the run.

An absent upstream is the same stop: the workflow builds from the remote, so unpushed work is simply not
in the release.

Show the resolved inputs and the ref as a table, then ask for a plain yes. Do not dispatch on an assumed
yes, and say so first when the working tree has uncommitted mobile changes, because those are not in the
build either.

## Step 4 - Dispatch and follow

```bash
gh workflow run android-release.yml \
  --ref <confirmed ref> \
  -f app_version=<version> \
  -f android_version_code=<code> \
  -f track=<track> \
  -f clear_cache=<bool> \
  -f validate_expo_dependencies=<bool> \
  -f message=<text>
```

`gh workflow run` prints no run id. Resolve the new run by listing again, **scoped to the same ref** so a
concurrent dispatch of the same version cannot be mistaken for this one, and take the newest entry whose
`displayTitle` matches what was just dispatched. **Copy that id from this command's output**, never
reconstruct it:

```bash
gh run list --workflow android-release.yml --branch <confirmed ref> --limit 5 \
  --json databaseId,displayTitle,status,headBranch
gh run watch <databaseId>
```

## Report

Give the run URL, the resolved inputs, and the final conclusion. If it fails, name the failing step and
quote the error rather than summarizing it. A green run means the artifact reached the named Play
track; it does not mean the release is live to users, which Play decides on its own review schedule.
