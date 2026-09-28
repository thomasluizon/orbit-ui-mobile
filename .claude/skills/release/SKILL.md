---
name: release
description: Plan and run Orbit's manual production or branch-selected staging release in API, web, landing, Android order.
argument-hint: "[staging <branch>] [--track open|production]"
effort: high
---

# Release

Only dispatch after the owner invokes a release. Planning is read-only. Never dispatch a service whose plan says `needsRelease: false`. Keep API, web, landing, Android order and stop after any failed release or verification.

## Plan

Production uses `node tools/release-plan.mjs`, with `--track production` when requested. Staging requires a branch argument: `node tools/release-plan.mjs --environment staging --branch <branch>`. Staging Android uses `internal`. Show each service's branch, deployed SHA or absent baseline, head SHA, and unreleased commits. Show the Android track and its baseline. An empty plan ends without dispatch.

The staging API baseline is its current live Render deploy. The web baseline is `/api/health` at the URL in its Render service record. The landing baseline is its current live Render deploy. The UI repository variables `RENDER_API_STAGING_SERVICE_ID` and `RENDER_WEB_STAGING_SERVICE_ID` locate the API and web services. The planner locates Render landing services by their `orbit-landing` and `orbit-landing-staging` names. A missing baseline is a first deploy. Stop on a divergent comparison or remote read failure.

## Dispatch in plan order

Re-run the same plan immediately before each dispatch. Confirm the selected branch head still equals the planned SHA. Production always selects `main`; staging uses the required branch. For API, web, and landing, run each repository's manual `release.yml` from `main`:

```text
gh workflow run release.yml --repo thomasluizon/<repo> --ref main -f environment=<production|staging> -f branch=<selected branch>
```

For a staging Git-backed Render service (API or landing), its workflow first updates the service's tracked branch with `PATCH /v1/services/{serviceId}` and `{"branch":"<selected branch>"}`, then triggers `POST /v1/services/{serviceId}/deploys` with `{"commitId":"<planned SHA>"}`. The update does not itself deploy. Both calls belong to that repository's workflow. The web workflow instead builds the selected branch into an image and deploys its digest. Do not change Render service settings manually while planning.

`gh workflow run` returns no run ID. Record the dispatch time and the repository's `main` SHA, then list recent `workflow_dispatch` runs on `main` with `gh run list --repo thomasluizon/<repo> --workflow release.yml --branch main --limit 10 --json databaseId,headSha,createdAt,event,status,conclusion,url,displayTitle,headBranch`, and select the unique new run with that `main` SHA. If no unique run matches, stop. Use `node tools/wait-release.mjs --repo <api|ui|landing> --run <databaseId> --sha <main workflow SHA>`. The workflow run head is `main` even when its checkout deploys a staging branch. A ceiling result leaves the release unresolved; do not dispatch the next service.

After success, verify the live service. API: require `https://api.useorbit.org/health` to report `status: Healthy` for production, or the staging service URL's `/health` to be healthy for staging; confirm the Render live deploy commit equals the planned SHA. Web: require the selected Render service URL's `/api/health` to report `status: ok` and the planned `commit`. Landing: require a successful GitHub Deployment for the planned SHA and its URL's `orbit-build` meta tag to equal the SHA. Stop with the run URL and observed value on a mismatch.

## Android

Follow `.claude/skills/android-release/SKILL.md` to derive the next version and Play versionCode across all tracks. Confirm the exact inputs with the owner before dispatch. Production uses `open` by default or explicitly requested `production`, always from `main`. Staging uses only `internal`, from the selected branch. Never promote a binary across tracks.

Before staging Android dispatch, require the staging API Render service and `https://api-staging.useorbit.org/health` to be healthy at the planned API commit. Dispatch `android-release.yml` with `--ref <selected branch>` and the confirmed inputs. Resolve the unique new run on that branch and SHA, then use `wait-release.mjs --repo ui`. Verify the Play upload step and API health again. A successful upload does not establish when Play makes the build available to testers.
