---
name: android-release
description: Dispatch the Android Release GitHub Action that builds and publishes Orbit to Google Play. Defaults to the open track with the version bumped one patch above the newest Android or iOS release, then hands the same version to /ios-release. Use when the user wants to ship a mobile release, publish to Play, or says /android-release. Not for a local APK, which is /android-generate.
argument-hint: "[version] [--track internal|open|production] [--code N] [--clear-cache] [--validate-deps] [--message <text>] [--android-only <reason>]"
effort: low
---

# Android Release - publish to Google Play

Dispatches `.github/workflows/android-release.yml`. It builds the embedded redesign, uploads Sentry
source maps, and **publishes to a Google Play track**. This is an outward, user-visible action, so it
runs only after the user confirms the exact inputs.

Before submission, the workflow derives an installable APK from that exact AAB and runs
`.github/actions/android-boot` on a GitHub-hosted emulator. It compares the embedded Hermes
bytes, clears app storage, cold starts once, requires the signed-out first screen through
accessibility and checks process survival and app fatal logs after settling. The gate taps the
Wait control of another process's Application Not Responding dialog before and after settling;
the app's own dialog fails the gate. A startup failure
blocks Play submission. Review `android-boot-evidence` for XML, app-UID logcat, process IDs,
ABI compatibility and artifact hashes. Never retry a failed app assertion as infrastructure.
The separate `android-startup.yml` workflow proves the gate without Play upload credentials;
its Hermes inventory job also rejects duplicate bundled native modules at pull request time.
The proof derives `ORBIT_APP_VERSION` from the newest successful open or production release on
`main` before prebuild; release dispatches continue using `app_version`. A forced-update dialog
fails with an explicit build-below-server-minimum verdict, including after the settle period.
The first-screen assertion reads the onboarding input label because the keyboard can clip its
heading. Both workflows ship an x86_64 slice so the gate executes the AAB's native libraries.

## One mobile version

Android and iOS ship at the same `app_version`. Each store keeps its own build counter. This skill is the
default entry point for both platforms: release Android, then release iOS at the same version through
`/ios-release`. Do not report a mobile release as done until both uploads exist.

Release Android alone only for a defect specific to Android. Pass `--android-only <reason>`. The
workflow input `platform_only_reason` carries the reason, and the run summary records it.

The workflow runs `node apps/mobile/scripts/mobile-version-pair.js check` before it builds. The check
reads the newest version of each platform from GitHub Deployments (`android-release` and `ios-release`).
One version names one code state. So the check refuses an Android version at or below the newest iOS
version when Android does not carry that version, as after an iOS-only release. It refuses an Android-only
version at or below the newest iOS version. A reason does not change these two refusals.
`node apps/mobile/scripts/mobile-version-pair.js plan --environment <production|staging>` prints both
newest versions, the lagging platform and the next shared version. Run it with `GITHUB_REPOSITORY` and
`GH_TOKEN` set. A refusal is a stop: do not retry it with a made-up reason.

Each GitHub environment keeps its own records, and the check reads only one environment. The Android
track selects that environment, and the iOS `variant` must select the same one:

| Android `track` | GitHub environment | iOS `variant` |
|---|---|---|
| `open`, `production` | `production` | `production` |
| `internal` | `staging` | `staging` |

An iOS `staging` build follows an Android `internal` build at the same version. An iOS `production` build
follows an Android `open` or `production` build at the same version. The other variant reads the other
environment, and the check refuses the version when that environment holds a different Android version.

## The workflow's inputs (from the workflow file, not memory)

| Input | Required | Values |
|---|---|---|
| `app_version` | yes | user-facing version string, e.g. `1.3.27` |
| `android_version_code` | yes | integer Play upload code, e.g. `86` |
| `track` | yes | `internal` \| `open` \| `production` |
| `clear_cache` | no | boolean, default `false` |
| `validate_expo_dependencies` | no | boolean, default `false` |
| `message` | no | free text recorded in the run log and summary |
| `platform_only_reason` | no | empty for a release that mirrors iOS; the Android-specific defect for an Android-only release |

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
versionCode. Release planning reads the newest Android deployment for the selected track, because
an Actions failure after submission does not undo a Play upload. Recording retries transient API
failures and looks up the commit, environment, track, version and versionCode before creating a
record, so a lost creation response reuses the upload's existing record.
The workflow derives each new versionCode from the last run across tracks;
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

- `app_version` -> run `mobile-version-pair.js plan --environment production` for the `open` and `production`
  tracks, and use its `nextVersion`: the newest of the Android and iOS versions, with the **last numeric segment
  bumped by one** (`1.3.26` -> `1.3.27`). Use `nextVersion` also when the plan names `android` as the lagging
  platform: iOS is ahead only after an iOS-only release, and that version names iOS code that Android does not
  carry. An Android-only release also uses `nextVersion`, so it never reuses a version iOS shipped.
  For the `internal` track, run the plan with `--environment staging` and use its `nextVersion`. The check
  also accepts a higher version, so a staging build of code that did not ship yet can use the `nextVersion`
  of the production plan when that version is higher.
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

The helper verifies native CLI 3.8.0 and SDK 8.28.0 against the lock and the checked-out
source SHA. The versions come from `package-lock.json` entries
`apps/mobile/node_modules/@sentry/cli` and
`apps/mobile/node_modules/@sentry/react-native`; update this guide and the checks in
`tools/android-sentry-diagnostic.mjs` together when those locked versions change. Its immutable configured and comparison targets both select
`orbit-ai-habit-tracker/orbit-mobile` on `https://sentry.io`. Each run must establish current
organization and project route access through its fixed GETs. The tenant frontend URL never
receives a credentialed request.

Token-embedded organization and URL take priority in native CLI 3.8.0. The diagnostic privately
recognizes `embedded_current_organization`, `embedded_previous_organization`, `configured_defaults`
and `unknown` as distinct selections. The previous organization is recognized solely to diagnose a
mismatch; it cannot become a healthy native selection. A previous binding can reach the fixed current
target reads without overriding native selection. Genuine non-embedded token syntax uses current
configured defaults unless a native environment override conflicts. Conflicting `SENTRY_ORG` for
non-embedded tokens, `SENTRY_URL` without a nonempty embedded URL, or `SENTRY_PROJECT` for any token
is refused locally as `native_override_mismatch`, without using or printing the override value.
Unknown organizations, unknown hosts and malformed syntax
stop locally before authentication without claiming server rejection. Every trailing slash is
removed from a nonempty URL; null or empty URL uses the configured host. Omitted URL remains
unrecognized. Extra token metadata stays unused. No credential or decoded payload reaches a child.
Changing only Expo configuration or `SENTRY_ORG` cannot override an old embedded organization.
The [native configuration](https://github.com/getsentry/sentry-cli/blob/3.8.0/src/config.rs#L412-L442)
and [URL selection](https://github.com/getsentry/sentry-cli/blob/3.8.0/src/config.rs#L143-L160),
[URL normalization](https://github.com/getsentry/sentry-cli/blob/3.8.0/src/config.rs#L307-L317)
and [token parser](https://github.com/getsentry/sentry-cli/blob/3.8.0/src/utils/auth_token/org_auth_token.rs#L14-L80)
define this selection. Token re-encoding changes the full-token hash and is not a repair; see the
[pinned issuance/hash producer](https://github.com/getsentry/sentry/blob/d4ac7c872436deb5d01d1e8673bae061758e3e0b/src/sentry/utils/security/orgauthtoken_token.py#L17-L58).

The maximum-three flow uses exactly these fixed GET destinations, in order:

1. `https://sentry.io/api/0/`
2. `https://sentry.io/api/0/organizations/orbit-ai-habit-tracker/chunk-upload/`
3. `https://sentry.io/api/0/projects/orbit-ai-habit-tracker/orbit-mobile/releases/?per_page=1`

Candidate reads require fresh reported token authentication, a complete supported index envelope,
and at least one existing GET alternative: `project:read`, `project:write`, `project:admin`,
`project:releases`, `org:ci`. No list, control-config, regional, numeric-ID or old-target read occurs.
There is no pagination, redirect following, retry, response-derived destination or grant request.
Unknown string scopes remain open strings privately; their presence does not invalidate credentials
or prove resource access. Scope alternatives follow the pinned
[organization release permission](https://github.com/getsentry/sentry/blob/d4ac7c872436deb5d01d1e8673bae061758e3e0b/src/sentry/api/bases/organization.py#L182-L187)
and [project release permission](https://github.com/getsentry/sentry/blob/d4ac7c872436deb5d01d1e8673bae061758e3e0b/src/sentry/api/bases/project.py#L79-L85).

The index can return 200 anonymously. Complete supported receipts are exactly
`{version:string,auth:{scopes:string[]},user:null}` or `{version:string,auth:null,user:null}`.
Null auth means not reported, never revoked or invalid. Missing/extra keys, wrong types or a user
object leave complete-envelope evidence unavailable; supported auth evidence stays separate.
User objects are never traversed. Values and unknown key names are never printed. Re-derive from the
[index producer](https://github.com/getsentry/sentry/blob/d4ac7c872436deb5d01d1e8673bae061758e3e0b/src/sentry/api/endpoints/index.py#L17-L30)
and [organization-token authenticator](https://github.com/getsentry/sentry/blob/d4ac7c872436deb5d01d1e8673bae061758e3e0b/src/sentry/api/authentication.py#L744-L780).
These pinned public producers do not establish the deployed SaaS revision.

Organization options consume status and bounded object shape only. Project releases consume status
and top-level array shape only; an empty array is valid route-access evidence. No release element,
field, value or pagination link is inspected. This proves neither upload permission nor an existing
release/dist. The [project GET](https://github.com/getsentry/sentry/blob/d4ac7c872436deb5d01d1e8673bae061758e3e0b/src/sentry/releases/endpoints/project_releases.py#L51-L115),
[project resolution/permission boundary](https://github.com/getsentry/sentry/blob/d4ac7c872436deb5d01d1e8673bae061758e3e0b/src/sentry/api/bases/project.py#L139-L219),
[base paginator](https://github.com/getsentry/sentry/blob/d4ac7c872436deb5d01d1e8673bae061758e3e0b/src/sentry/api/base.py#L601-L672)
and [page-size validation](https://github.com/getsentry/sentry/blob/d4ac7c872436deb5d01d1e8673bae061758e3e0b/src/sentry/utils/pagination_factory.py#L28-L43)
define the bounded project read. Unsupported body types, malformed JSON, HTTP 401/403/404/429/5xx,
redirects and transport failures remain distinct unavailable outcomes. A 404 does not distinguish
absence, visibility, mapping or routing.

Each request retains its ten-second deadline and 65,536-byte streamed body cap, cancellation and
reader release. The overall deadline remains 45 seconds and sanitized output is capped at 8,192 bytes.
The native child runs only `--version`, with PATH-only environment and a five-second process bound.
No raw response, scope value, header value, payload or subprocess output is printed or saved.
Only presence of `X-Sentry-Proxy-URL` is retained; absence is inconclusive. Error classification
requires exactly `{detail:string}`: `The requested resource does not exist` on 404 and
`Invalid org token` on 401/403 become fixed labels without echoing detail. All other shapes/messages
remain unavailable. Sources are the pinned
[resource exception](https://github.com/getsentry/sentry/blob/d4ac7c872436deb5d01d1e8673bae061758e3e0b/src/sentry/api/exceptions.py#L17-L19),
[authenticator](https://github.com/getsentry/sentry/blob/d4ac7c872436deb5d01d1e8673bae061758e3e0b/src/sentry/api/authentication.py#L754-L778),
[proxy marker](https://github.com/getsentry/sentry/blob/d4ac7c872436deb5d01d1e8673bae061758e3e0b/src/sentry/silo/util.py#L17)
and [DRF scalar wrapper](https://github.com/encode/django-rest-framework/blob/3.17.2/rest_framework/views.py#L87-L100).

Record source SHA, CLI, configured and comparison targets, private-selection relation, configuration
agreement and each bounded request outcome. `current_target_reads:route_access_observed` means only
that the fixed organization and project GETs passed their supported read boundaries. A previous
embedded selection stays exit 1 with `native_target_differs_from_candidate` and both
`differs_from_configured` and `differs_from_candidate`, even when all three reads pass. A current
embedded selection or genuine configured-default selection with no conflicting native override can
exit 0 with `current_target_reads_observed`, `matches_configured`, `matches_candidate` and
`native_upload_unverified`. Exit 0 establishes only bounded reads and native target agreement;
upload and release readiness remain unverified. Other incomplete evidence stays exit 1;
invalid arguments exit 2.

Original native old-target failures remain historical evidence. This flow does not execute or
replace that native lookup and does not execute an upload. Current-target access, native-effective
selection, configuration repair, fatal source-map upload, signed bundle, Play submission and tester
availability need separate evidence. A current organization GET is auxiliary when native selection
differs. Do not infer rename, removal, revocation or a credential repair from this comparison.

Apply only the demonstrated configuration/access repair through its existing authorized owner,
then retain before/after read evidence. Configuration alignment cannot replace a credential whose
embedded organization still selects the previous target. A human administrator must replace the
existing repository `SENTRY_AUTH_TOKEN` in GitHub **Settings > Secrets and variables > Actions**
with an officially issued credential for the configured organization through that secret field.
Never send the credential through chat, tickets, dispatch inputs or generated files, and never
rewrite its payload or broaden grants to satisfy diagnosis. Re-run the trusted-main diagnostic
with the replacement; require current target agreement and supported reads before the ordinary
fatal-upload release path. Source changes after a diagnostic merge require a fresh
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
- `--android-only <reason>` -> `platform_only_reason`, and skip the iOS follow-up

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
  -f message=<text> \
  -f platform_only_reason=<reason or empty>
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

## Step 5 - Release iOS at the same version

Unless `--android-only` was given, run `/ios-release` after the Android upload succeeds. Use the same commit
(a `main` commit for `open` and `production`) and the same `app_version`. Dispatch the iOS `variant` of the
Android track's environment:

- Android `open` or `production` -> `variant=production` (this is the default path).
- Android `internal` -> `variant=staging`.

The iOS workflow refuses any other version. The other variant reads the other environment's Android
records, so the workflow refuses it too when those records hold a different version. Confirm the iOS build
number with the owner as that skill states.

## Report

Give the run URL, the resolved inputs, and the final conclusion. If it fails, name the failing step and
quote the error rather than summarizing it. A green run means the artifact reached the named Play
track; it does not mean the release is live to users, which Play decides on its own review schedule.
