---
name: android-release
description: Dispatch the Android Release GitHub Action that builds and publishes Orbit to Google Play. Defaults to the open track with the version and versionCode bumped one patch above the last run. Use when the user wants to ship a mobile release, publish to Play, or says /android-release. Not for a local APK, which is /android-generate.
argument-hint: "[version] [--track internal|open|production] [--code N] [--clear-cache] [--validate-deps] [--message <text>]"
effort: low
---

# Android Release - publish to Google Play

Dispatches `.github/workflows/android-release.yml`. It builds the embedded redesign, uploads Sentry
source maps, and **publishes to a Google Play track**. This is an outward, user-visible action, so it
runs only after the user confirms the exact inputs.

## The workflow's inputs (from the workflow file, not memory)

| Input | Required | Values |
|---|---|---|
| `app_version` | yes | user-facing version string, e.g. `1.3.27` |
| `android_version_code` | yes | integer Play upload code, e.g. `86` |
| `track` | yes | `internal` \| `open` \| `production` |
| `clear_cache` | no | boolean, default `false` |
| `validate_expo_dependencies` | no | boolean, default `false` |
| `message` | no | free text recorded in the run log and summary |

The workflow builds `internal` from the selected branch as `org.useorbit.app.staging` ("Orbit Staging")
against `https://api-staging.useorbit.org` and records it in the `staging` GitHub environment.
This variant runs only the embedded bundle: updates are disabled, the design startup plugin is
inactive, and account flags never trigger a design fetch or reload. It can test the selected
branch's sign-in and onboarding as well as its signed-in screens.
It builds `open` and `production` as `org.useorbit.app` ("Orbit") against
`https://api.useorbit.org` in the `production` environment. The `android-internal`
GitHub environment supplies the Firebase config containing both Android app clients;
the other tracks use the repository secret.
Each successful Play upload records an Android GitHub Deployment with the commit, version and
versionCode. The workflow derives each new versionCode from the last run across tracks;
Play enforces uniqueness within each package. The open and production tracks build the embedded redesign
from `main`. A binary is never promoted between tracks because its API base is fixed when it is built.

## Embedded design

Every release track ships its checked-out JavaScript bundle with `updates.enabled` set to `false`.
The design startup plugin stays inactive, and account flags never trigger a design fetch or reload.
Open and production releases build the promoted redesign from `main`. Internal releases build the
selected branch as Orbit Staging against `https://api-staging.useorbit.org`.

The workflow builds directly without a design publication job, a second source checkout or EAS
Update credentials. Changes to JavaScript or native dependencies reach devices through a new Play
build. Run `node apps/mobile/scripts/check-design-bundles.js .` from the repository root to confirm
the promoted source declares the redesign and disables updates.

Device verification belongs to the release coordinator. Verify the embedded redesign across cold
starts, offline startup, sign-out and account flag changes. The installed bundle stays the selected
build throughout those transitions.

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
a version. Never reuse a `versionCode` Play has received. A failure before upload can be retried
only under the recovery checks below; a failed Actions conclusion alone is insufficient.

## Sentry organization lookup recovery

Keep Sentry source-map upload fatal. `organization not found` does not establish a bad token,
wrong slug or outage. A successful web build does not verify the native credential. Do not rotate
credentials, broaden scopes, change the target or disable upload based on that message.

After normal review publishes the diagnostic to main, resolve the approved main SHA and dispatch
`android-sentry-diagnostic.yml` from `main` with `expected_source_sha` equal to that exact SHA.
The workflow refuses a non-main ref or a stale/malformed SHA before binding the token to its
probe step. It uses the existing `production` environment and repository `SENTRY_AUTH_TOKEN`,
serialized with production Android builds. It does not sign, build or publish anything.

The helper verifies the locked native CLI 3.6.0, not the top-level CLI. It compares token-embedded
organization/host with the immutable expected `thomasluizon/orbit-mobile` at `https://sentry.io`
in memory, respecting native precedence. A mismatch stops before authentication; its value and
decoded payload are never printed. Malformed or unrecognized credential syntax stops locally and
does not establish that the server rejected the credential. No credential is passed to subprocesses.
As in the locked CLI, every trailing slash is removed from a nonempty embedded URL for comparison;
null or empty URL uses the configured host. An omitted URL remains unrecognized. Request destinations
stay fixed, and different hosts, schemes, paths, queries, fragments or userinfo are refused.

The diagnostic makes at most two GETs: the native uploader's organization `chunk-upload/` lookup
and supplementary `/api/0/` auth-info. Each request has a ten-second deadline and 64 KiB body cap;
the overall deadline is 45 seconds and output is capped at 8 KiB. Redirects are refused. It has
no inventory, retry, arbitrary target/method input, cache or artifact path. Lookup fields and raw
errors stay unused. Supplementary auth/scopes are classified in memory; private bodies are never
returned, printed, saved or passed to a subprocess. The CLI is used only for its version: its
authenticated `info` transport has no equivalent body cap. The bounded GETs reproduce its read paths and source-verified target
selection. CLI `info --config-status-json` can exit zero with `auth.successful:false`; neither its
exit code nor `config.org` proves authentication or the effective token organization.

Record source SHA, CLI, expected target, target-comparison outcome and each safe HTTP/body outcome.
The API index returns 200 even for anonymous requests. Its supported `auth.scopes` string array
reports token auth; `auth:null` means only that this response did not report token auth, without
establishing revocation, invalidity or the reason. Missing or unsupported auth/scopes shapes leave
auth evidence unavailable. Empty scopes and unrelated/future strings still report auth; only a
fixed observation says whether any current native GET alternative appeared: `project:read`,
`project:write`, `project:admin`, `project:releases`, `org:ci`. Values are never printed, and scope
presence does not prove target access or justify broader grants.

Complete type-only receipts require exactly `version`, `auth`, `user`, a string version, null user,
and either null auth or exactly `scopes` with a string array. Extra/missing keys, wrong types and
user objects yield `shape_unavailable`, without printing unknown keys or traversing user fields.
Auth evidence remains separate from complete-shape evidence. These shapes and scope alternatives
follow the pinned [index producer](https://github.com/getsentry/sentry/blob/d4ac7c872436deb5d01d1e8673bae061758e3e0b/src/sentry/api/endpoints/index.py#L17-L30)
and [native GET permission](https://github.com/getsentry/sentry/blob/d4ac7c872436deb5d01d1e8673bae061758e3e0b/src/sentry/api/bases/organization.py#L182-L187);
the deployed service revision and future contracts remain unverified.

A healthy diagnostic requires both healthy bounded reads, reported token auth, an observed listed
scope and a recognized complete envelope. Unavailable evidence, no reported auth or no listed scope
keeps it incomplete. An auth-info 403 can mean unavailable read scope, while a lookup 404 cannot
distinguish absent organization from denied access. Do not add grants to make an auxiliary read pass. Malformed JSON,
oversize, redirect, timeout, network/TLS and HTTP failures remain incomplete evidence. Even healthy
reads and reported auth/scopes do not prove project access, successful upload or the original cause.
A native lookup 404 stays incomplete even with reported auth and a listed scope. If the lookup is
already healthy, retain the original cause as unknown and gather discriminating evidence before a repair.

Apply only the demonstrated configuration/access repair through its existing authorized owner,
then retain before/after read evidence. Source changes after a diagnostic merge require a fresh
branch and normal review. Keep the ticket open through repair, upload and Open availability.

For an authorized pre-upload retry, use confirmed GitHub and Play CLI or API interfaces first to
recheck **all** concurrent/recent release runs, deployment receipts and authoritative uploaded-code
history for package `org.useorbit.app` immediately before dispatch. Confirm the supported command
and actual response shape before relying on it; do not guess an endpoint or field. Current tracks
alone cannot prove a code was never uploaded, including removed or historical uploads. Use Google
Play Console **Orbit > Test and release > App bundle explorer** only when the supported interfaces
cannot establish the required history. The exact code must remain never-uploaded, and no concurrent
release may claim it. Unknown history is a stop; if Play has received the code, resolve the approved
next version/code. Do not add an account, grant or credential to make a read possible.

Pin the approved carrying main SHA, freshly fetch remote main and require the local source and
remote main to equal that approved SHA immediately before dispatch. Select **open** explicitly and
verify the actual run's SHA before accepting its result. A source mismatch stops recovery. Do not
retry an old failed run's source merely because its versionCode is available. Existing release
authorization applies; recovery adds no separate owner approval step.

Keep separate evidence for root cause, exact repaired input, diagnostic red/green outcomes, the
ordinary fatal source-map upload's actual organization/release/dist, signed AAB, Play submission
and actual Open testing availability. Check availability through confirmed Play CLI or API interfaces
first; use Google Play Console **Orbit > Test and release > Testing > Open testing** only when those
interfaces cannot establish it. A green diagnostic or accepted Play submission cannot establish
tester availability; retain that observation as pending until proven. Preserve signing, manifest,
native cache and Open-to-beta mapping guards. This recovery does not authorize production-track
publication.

## Step 2 - Apply the user's arguments

Anything in `$ARGUMENTS` overrides the derived defaults:

- a bare version-looking token (`1.4.0`) -> `app_version`
- `--track <name>` -> `track`, validated against the three allowed values
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

A mismatch either way is a **stop**, not a warning. Resolve and confirm the approved remote source
before dispatch. Open and production require `main`; a tag does not satisfy their branch guard.
An internal release may use a confirmed exact tag when its selected branch is moving.

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
