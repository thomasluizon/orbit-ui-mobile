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

The helper verifies native CLI 3.6.0 and SDK 8.17.2 against the lock and the checked-out
source SHA. Its immutable configured target remains `thomasluizon/orbit-mobile` on
`https://sentry.io`. The owner-confirmed comparison organization is `orbit-ai-habit-tracker`;
`orbit-mobile` within that organization remains unverified until its fixed project GET succeeds.
The tenant frontend URL is identity input only and never receives a credentialed request.

Token-embedded organization and URL take priority in native CLI 3.6.0. The diagnostic privately
recognizes the configured organization, the current comparison organization, and legacy configured
defaults as separate selections. An old binding can reach the deliberate current-target comparison;
this does not override native selection. Unknown organizations, unknown hosts and malformed syntax
stop locally before authentication without claiming server rejection. Every trailing slash is
removed from a nonempty URL; null or empty URL uses the configured host. Omitted URL remains
unrecognized. Extra token metadata stays unused. No credential or decoded payload reaches a child.
Changing only Expo configuration or `SENTRY_ORG` cannot override an old embedded organization.
The [native configuration](https://github.com/getsentry/sentry-cli/blob/3.6.0/src/config.rs#L344-L371)
and [token parser](https://github.com/getsentry/sentry-cli/blob/3.6.0/src/utils/auth_token/org_auth_token.rs#L14-L80)
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
that the fixed organization and project GETs passed their supported read boundaries. An old embedded
or legacy configured selection stays exit 1 with `native_target_differs_from_candidate` even when
all three reads pass. A current embedded selection with those reads can exit 0 with
`current_target_reads_observed`, while explicitly reporting `differs_from_configured` and
`native_upload_unverified`. Exit 0 never means native configuration agreement, repaired upload or
release readiness. Other incomplete evidence stays exit 1; invalid arguments exit 2.

Original native old-target failures remain historical evidence. This flow does not execute or
replace that native lookup and does not execute an upload. Current-target access, native-effective
selection, configuration repair, fatal source-map upload, signed bundle, Play submission and tester
availability need separate evidence. A current organization GET is auxiliary when native selection
differs. Do not infer rename, removal, revocation or a credential repair from this comparison.

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
