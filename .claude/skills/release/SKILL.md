---
name: release
description: Plan and run Orbit's manual production or branch-selected staging release.
argument-hint: "[staging <branch>] [--track open|production]"
effort: high
---

# Release

Only dispatch after the owner invokes a release. Planning is read-only. Never dispatch a service whose plan says `needsRelease: false`. Keep API, web, landing, Android order and stop after any failed release or verification.

## Plan

Production uses `node tools/release-plan.mjs`, with `--track production` when requested. Staging requires a branch argument: `node tools/release-plan.mjs --environment staging --branch <branch>`. Staging Android uses `internal`. Show each service's branch, deployed SHA or absent baseline, planned SHA (`plannedSha`), pinned `dispatchCommand`, and unreleased commits. Show the Android track and its baseline. An empty plan ends without dispatch.

The staging API baseline is the `commit` from `/health` with `status: Healthy` at the URL in its Render service record. The production API baseline is its current live Render deploy. The web baseline is `/api/health` at the URL in its Render service record. The landing baseline is its current live Render deploy. The UI repository variables `RENDER_API_STAGING_SERVICE_ID` and `RENDER_WEB_STAGING_SERVICE_ID` locate the API and web services. The planner locates Render landing services by their `orbit-landing` and `orbit-landing-staging` names. A missing baseline is a first deploy. For staging, show `deployedFromOtherBranch` when the live commit is outside the selected branch and list the selected branch's commits from the comparison. Stop on a divergent production comparison or remote read failure.

## Dispatch in plan order

Keep the reviewed plan and its full planned SHA for each repository through dispatch and verification. A branch advancing after planning does not change the selected commit. If a newer commit is wanted, produce and review a new plan first. Production selects `main`; staging uses the required branch. For API, web, and landing, run each repository's manual `release.yml` from `main`:

```text
gh workflow run release.yml --repo thomasluizon/<repo> --ref main -f environment=<production|staging> -f branch=<selected branch> -f sha=<planned SHA>
```

Use the plan's exact `dispatchCommand` for API, web, and landing. Staging requires an explicit full 40-character SHA. Production defaults to the dispatch's `github.sha` only when `sha` is empty; always pass the planned SHA from this procedure. Each workflow verifies checkout identity and selected-branch ancestry before deployment.

Production requires staging to serve the same commit with healthy status. For web, admission reads `/api/health` at the URL of `RENDER_WEB_STAGING_SERVICE_ID`. Only when the operator explicitly requests bypassing this check, append `-f force_unstaged=true` to that repository's dispatch command. The production job summary records the selected SHA and override.

For the staging Git-backed landing service, its workflow first updates the service's tracked branch with `PATCH /v1/services/{serviceId}` and `{"branch":"<selected branch>"}`, then triggers `POST /v1/services/{serviceId}/deploys` with `{"commitId":"<planned SHA>"}`. The update does not itself deploy. Both calls belong to that repository's workflow. The staging API and web workflows build the selected SHA into an image and deploy its digest. Do not change Render service settings manually while planning.

`gh workflow run` returns no run ID. Record the dispatch time and the repository's `main` SHA, then list recent `workflow_dispatch` runs on `main` with `gh run list --repo thomasluizon/<repo> --workflow release.yml --branch main --limit 10 --json databaseId,headSha,createdAt,event,status,conclusion,url,displayTitle,headBranch`, and select the unique new run with that `main` SHA. If no unique run matches, stop. Use `node tools/wait-release.mjs --repo <api|ui|landing> --run <databaseId> --sha <planned SHA> --workflow-sha <main workflow SHA> --service-url <selected service origin>`. The workflow run head is `main` even when its checkout deploys the selected staging branch. The waiter requires the selected service origin and checks its live commit against the planned SHA after the run succeeds: API `/health` with `status: Healthy`, web `/api/health` with `status: ok`, or landing `/` with the `orbit-build` meta tag. Use the selected Render service URL, without a path, as the origin. A missing, unhealthy, or different live commit fails verification. A ceiling result leaves the release unresolved; do not dispatch the next service.

After success, verify the live service. API: require `https://api.useorbit.org/health` to report `status: Healthy` for production, or the staging service URL's `/health` to be healthy for staging; confirm the reported health commit equals the planned SHA. For production API, also confirm the Render live deploy commit equals the planned SHA. Web: require the selected Render service URL's `/api/health` to report `status: ok` and the planned `commit`. Landing: require a successful GitHub Deployment for the planned SHA and its URL's `orbit-build` meta tag to equal the SHA. Stop with the run URL and observed value on a mismatch.

## Desktop with web

The UI `release.yml` owns desktop admission for both environments. Its reusable `desktop-build.yml` checks out the exact planned web SHA, runs the shell and web bridge unit tests, and compiles all four native targets. After production staging admission succeeds, reusable `desktop-release.yml` compares that commit's shell inputs with the immutable version tag named by the channel's verified manifest. Unchanged inputs keep the published shell. Changed inputs automatically select a higher version, package and sign every target, and advance the selected channel before web deployment. A failed desktop check or publication stops the web release. Do not dispatch a separate Desktop Release during `/release`.

Read the Desktop summary for the selected SHA, channel and published or unchanged version. The signed channel manifest remains the update endpoint. Running desktop windows check `/api/desktop-release` at launch, on focus and reconnect, and every minute; native shells check the signed channel at launch, on focus and every minute. A newer web build or shell offers Restart now and Later in the existing notice slot once streaming, edits, attachments and mutations settle. The native menu also shows Update available. Later hides the exact offer until the next process launch or a newer version. Restart reloads a web-only update, or downloads, verifies, installs and relaunches a shell update after repeating the settle checks. A one-use account-bound checkpoint restores Astra; shell relaunch also restores the same-origin page. Checkpoint or update failure retains the current window for explicit Retry. Closing the window or choosing Quit never applies an update. Shells without the guarded update bridge retain their native menu for shell installation and can still offer web updates. The coordinator obtains `/second-opinion` approval for English and pt-BR update copy before merge. `apps/web/web-compatibility.json` declares the web build's `minimumShellVersion`; raise it with an incompatible shell requirement. The automatic shell version must meet that floor before web deployment. Server rendering and hydration retain the application content; an older running shell switches to the native menu update instructions after hydration.

## Android

Follow `.claude/skills/android-release/SKILL.md` to derive the next version and Play versionCode across all tracks. Confirm the exact inputs with the owner before dispatch. Production uses `open` by default or explicitly requested `production`, always from `main`. Staging uses only `internal`, from the selected branch. Never promote a binary across tracks.

For a native Sentry upload blocker, follow that procedure's **Sentry organization lookup recovery**:
use the trusted-main same-secret diagnostic. An API index 200 alone does not prove token auth; retain
the bounded auth/scopes classification and exact type-only receipt when available. Reported auth
and a listed scope do not resolve a native lookup 404 or prove target access. Use that procedure's
bounded scope-selected identity/control and regional comparisons without adding grants or guessing
destinations. Preserve the native failure independently of auxiliary success. Retain those evidence
limits, repair only a demonstrated cause and recheck Play plus concurrent releases before any
never-uploaded-code retry. Use confirmed
GitHub/Play CLI or API interfaces first, with Console fallback only for history or availability those
interfaces cannot establish. Unknown history stops recovery; current tracks do not prove a code was
never uploaded. Pin and freshly verify the approved carrying main source, and keep Open submission
separate from verified tester availability.

Before staging Android dispatch, require the staging API Render service and `https://api-staging.useorbit.org/health` to be healthy at the planned API commit. Dispatch `android-release.yml` with `--ref <selected branch>` and the confirmed inputs. Resolve the unique new run on that branch and SHA, then use `wait-release.mjs --repo ui --workflow android --run <databaseId> --sha <planned Android SHA>`. Verify the Play upload step and API health again. A successful upload does not establish when Play makes the build available to testers.
