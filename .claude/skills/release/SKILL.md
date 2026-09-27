---
name: release
description: Plan and run Orbit's manual production release in API, web, landing, Android order, or inspect staging and publish an internal or closed Android build. Use when the owner says /release or asks what has not shipped.
argument-hint: "[staging] [--track internal|closed|open|production]"
effort: high
---

# Release

Only run a release when invoked. The plan is read-only. Never dispatch a workflow for a service whose plan says `needsRelease: false`.

## Plan

Run `node tools/release-plan.mjs` for production, or `node tools/release-plan.mjs --environment staging`. Read the JSON and show each service's branch, deployed SHA or `no staging baseline` / `first production deploy`, head SHA, and every listed commit. Preserve the tool's API, web, landing, Android order. An empty plan ends here with no workflow dispatch.

The staging API baseline comes from the current live Render deploy. The staging web baseline comes from `/api/health` on the URL returned by its Render service record. Their service IDs are the UI repository variables `RENDER_API_STAGING_SERVICE_ID` and `RENDER_WEB_STAGING_SERVICE_ID`. A missing web service or live deploy is a first deploy, not proof that staging is current. Do not use a custom staging hostname for these checks. If a comparison diverges or a remote read fails, stop and report the error; do not guess a baseline.

## Production dispatch

For each changed service, in plan order:

1. Re-run the production plan just before dispatch and use its current head SHA. If an earlier release failed, stop; do not dispatch later services. Confirm the selected SHA still equals `main` in that repository. For API, web, and landing, dispatch the selected commit through their `ref` input while the workflow itself runs from `main`:

   ```text
   gh workflow run <workflow> --repo thomasluizon/<repo> --ref main -f ref=<planned SHA>
   ```

2. For Android, follow `.claude/skills/android-release/SKILL.md` to derive the next version and Play versionCode from the latest run across all tracks. Use `open` by default or the explicitly requested `production` track. Show the exact version, code, track, branch, and SHA and get the owner's confirmation required by that skill before dispatch. The Android workflow has no `ref` input; its `--ref main` selects the source. Stop if the remote SHA changed.
3. Record the time before dispatch. `gh workflow run` does not return a run ID. Use `gh run list --repo thomasluizon/<repo> --workflow <workflow> --branch main --limit 10 --json databaseId,headSha,createdAt,event,status,conclusion,url,displayTitle,headBranch` and identify exactly one new `workflow_dispatch` run on the selected SHA after the dispatch. If none or several match, stop and report the ambiguity. Do not watch an older run.
4. Run `node tools/wait-release.mjs --repo <api|ui|landing> --run <databaseId> --sha <planned SHA>`. This waiter registers the harness wake source. It prints the run URL while a `production` environment approval is pending and continues waiting. A ceiling result while approval is pending is a pending approval, not a failed deployment. Do not replace the waiter with a background shell, `gh run watch`, or a detached poll.
5. A successful workflow run is necessary but not sufficient. Verify the workflow's own health step succeeded, then read the live endpoint yourself. API: read `https://api.useorbit.org/health` and require `status: Healthy`; also confirm the Render production service's latest live deploy has the planned commit. Web: get `RENDER_WEB_SERVICE_ID` from the UI repository variables, get `.serviceDetails.url` from Render, and require that URL's `/api/health` reports `status: ok` and the planned `commit`. Landing: get the successful GitHub Deployment status for the planned SHA, read its `environment_url`, and require the page's `orbit-build` meta tag to equal the planned SHA. Android: require the Play upload step's success in the workflow and read the production API health endpoint. If any check fails, stop with the run link and the observed result.

Production deploys pause for the owner's `production` environment approval. Tell the owner which run is waiting, then keep the registered waiter active. Never treat `waiting` as failure or dispatch the next service before the current run succeeds and verification finishes.

## Staging

Staging API and web deploy automatically from `redesign/main`. Report their gaps from the plan and let those deployments finish through their existing paths. There is no staging deploy workflow to dispatch. A missing web baseline does not block an Android build, but an API gap does: wait until the staging API's live Render commit matches the planned branch head, then re-run the staging plan.

If Android needs a release, follow `.claude/skills/android-release/SKILL.md` for version and versionCode, choose `internal` by default or an explicitly requested `closed` track, and confirm the exact inputs with the owner. The workflow builds those tracks against the staging API. Before dispatch, verify the staging API's Render service URL returns a healthy `/health` response and that the Android workflow's configured staging API hostname resolves and serves that API. Stop if the hostname is not ready; a successful Play upload with an unreachable API would be unusable. Dispatch from `redesign/main`, resolve the unique new run, and use `wait-release.mjs` with `--repo ui` and the selected SHA. Verify the Play upload step and read staging API health again. Report the run link and track.

Do not infer Play availability from a green workflow: Play controls when a published build appears to testers.
